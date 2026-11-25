import {randomUUID} from 'node:crypto';

import type {AgentRow, Database, PendingApproval} from '@binary/db';
import {KnowledgeRepository} from '@binary/db';
import type {ChatTurn, ToolCallRecord} from '@binary/shared';
import {getProvider} from '@binary/shared';

import type {
  KnowledgeContext,
  MemoryContext,
  RunContext,
} from '../agents/system-prompt';
import {buildSystemPrompt} from '../agents/system-prompt';
import type {Embedder, EmbedderFactory} from '../embeddings/embedder';
import type {Engine} from '../engine/engine';
import {memoriesForPrompt} from '../memory/memories';
import {knowledgeTool, memoryTools} from '../memory/tools';
import {engineErrorMessage} from '../routes/stream-answer';
import type {BrowserManager} from '../browser/manager';
import {browserTools} from '../browser/tools';
import type {DesktopManager} from '../desktop/manager';
import {desktopTools} from '../desktop/tools';
import type {RunnerAccess} from '../runners/access';
import {runnerTools} from '../runners/tools';
import {keepImages} from '../sandbox/images';
import type {SandboxManager} from '../sandbox/manager';
import {sandboxTools} from '../sandbox/tools';
import type {ComposioGateway} from '../tools/composio';
import type {BinaryTool} from '../tools/toolbox';
import {sourceOf, Toolbox} from '../tools/toolbox';
import type {UserToolbox} from '../tools/user-tools';
import {loadUserToolbox} from '../tools/user-tools';
import type {Vault} from '../vault';

/** How many model calls one answer may take (each tool round trip is one). */
export const MAX_STEPS = 6;

/** The toolbox for Plan only: nothing to offer, nothing to close. */
const NO_TOOLS: UserToolbox = {
  toolbox: new Toolbox([]),
  unavailable: [],
  close: async () => {},
};

/** How many document titles the system prompt lists. */
export const KNOWLEDGE_TITLES_IN_PROMPT = 20;

/** What the person sees on a tool call that waits for their OK. */
export const WAITING_FOR_PERSON = 'Needs your OK before it runs.';

/** What answering needs from the app: the database, keys and tools. */
export interface AnswerDeps {
  db: Database;
  vault: Vault;
  builtInTools: () => BinaryTool[];
  composio: ComposioGateway | null;
  /** Cloud sandboxes; off (unavailable) without an E2B key. */
  sandboxes: SandboxManager;
  /** Browsers; off (unavailable) without Chromium. */
  browsers: BrowserManager;
  /** Cloud desktops; off (unavailable) without an E2B key. */
  desktops: DesktopManager;
  /** Your computers, through their Runners. */
  runners: RunnerAccess;
  /** Embeddings for memory and knowledge; off without an OpenAI/Google key. */
  embedders: EmbedderFactory;
}

/** Memory and knowledge for one answer, or nothing when they're off. */
async function loadRecall(
  db: Database,
  embedders: EmbedderFactory,
  {
    userId,
    agentId,
    prompt,
    withTools,
  }: {userId: string; agentId: string; prompt: string; withTools: boolean},
): Promise<{
  embedder: Embedder | null;
  memory?: MemoryContext;
  knowledge?: KnowledgeContext;
}> {
  try {
    const choice = await embedders(userId);
    if (!choice.ok) {
      return {embedder: null};
    }
    const {embedder} = choice;
    const [{memories, total}, knowledge] = await Promise.all([
      memoriesForPrompt(db, embedder, {userId, agentId, prompt}),
      withTools
        ? new KnowledgeRepository(db).titlesForUser(
            userId,
            KNOWLEDGE_TITLES_IN_PROMPT,
          )
        : undefined,
    ]);
    return {
      embedder,
      memory: {
        memories: memories.map(m => ({id: m.id, content: m.content})),
        total,
        tools: withTools,
      },
      knowledge,
    };
  } catch (error) {
    // Memory helps, but a chat never fails for want of it.
    console.warn(
      '[memory] left out of this answer:',
      error instanceof Error ? error.message : error,
    );
    return {embedder: null};
  }
}

export interface AnswerRequest {
  engine: Engine;
  agent: AgentRow;
  userId: string;
  /** The chat this answer is for (its sandbox and images belong to it). */
  threadId: string;
  /** The newest message from the person. */
  prompt: string;
  /** Images the model should see with it (a desktop's screen). */
  promptImages?: Array<{mime: string; data: string}>;
  /** Earlier turns, oldest first. */
  history: ChatTurn[];
  /** Set for routine runs, which nobody watches live. */
  run?: RunContext;
}

/** Live progress while the answer is written. */
export type AnswerProgress =
  {type: 'delta'; text: string} | {type: 'tool'; call: ToolCallRecord};

/**
 * A finished answer (not saved yet), or why there isn't one. `approvals`
 * are the requests it made; save them with the answer.
 */
export type AnswerOutcome =
  | {
      ok: true;
      text: string;
      toolCalls: ToolCallRecord[];
      approvals: PendingApproval[];
    }
  | {ok: false; error: string};

/**
 * The chat pipeline: loads the person's tools, asks the model with the
 * agent's system prompt, runs the tools its approval mode allows, turns
 * the ones that need an OK into approval requests (nothing waits in
 * memory), and reports each step through `onProgress`. Chats, routine
 * runs and follow-ups after a decision all use this, so they get the same
 * tools and the same rules. The caller saves the result.
 */
export async function generateAnswer(
  {
    db,
    vault,
    builtInTools,
    composio,
    sandboxes,
    browsers,
    desktops,
    runners,
    embedders,
  }: AnswerDeps,
  {
    engine,
    agent,
    userId,
    threadId,
    prompt,
    promptImages,
    history,
    run,
  }: AnswerRequest,
  onProgress: (progress: AnswerProgress) => void = () => {},
): Promise<AnswerOutcome> {
  const mode = agent.approvalMode;
  // Built-in tools plus every app that answers. An app that's down is
  // left out, and the answer carries on without it. Plan only uses no
  // tools, so it doesn't open any apps.
  const owner = {userId, threadId, agentId: agent.id};
  const wantsSandbox = agent.computers.includes('cloud_sandbox');
  const hasSandbox = wantsSandbox && sandboxes.available;
  const wantsBrowser = agent.computers.includes('browser');
  const hasBrowser = wantsBrowser && browsers.available;
  const wantsDesktop = agent.computers.includes('cloud_desktop');
  const hasDesktop = wantsDesktop && desktops.available;
  const runnerId = agent.computers.includes('runner') ? agent.runnerId : null;
  // Claude Code and Codex bring their own tools; Binary's aren't offered.
  const usesCli = agent.engine !== 'api';
  const withTools = mode !== 'plan_only' && !usesCli;
  // What it remembers goes into the prompt; knowledge is searched by tool.
  const recall = await loadRecall(db, embedders, {
    userId,
    agentId: agent.id,
    prompt,
    withTools,
  });
  const {embedder} = recall;
  const tools = !withTools
    ? NO_TOOLS
    : await loadUserToolbox(
        db,
        vault,
        userId,
        [
          ...builtInTools(),
          ...(hasSandbox ? sandboxTools(sandboxes, owner) : []),
          ...(hasBrowser ? browserTools(browsers, owner) : []),
          ...(hasDesktop ? desktopTools(desktops, owner) : []),
          ...(runnerId ? runnerTools(runners, {userId, runnerId}) : []),
          ...(embedder
            ? memoryTools(db, embedder, {userId, agentId: agent.id})
            : []),
          ...(embedder && recall.knowledge && recall.knowledge.total > 0
            ? [knowledgeTool(db, embedder, userId)]
            : []),
        ],
        composio,
      );
  const calls = new Map<string, ToolCallRecord>();
  const approvals: PendingApproval[] = [];
  const report = (call: ToolCallRecord) => {
    calls.set(call.id, call);
    onProgress({type: 'tool', call});
  };

  let text = '';
  try {
    // No abort signal on purpose: if the person closes the tab, the answer
    // still finishes and is saved for when they come back.
    for await (const part of engine.stream({
      prompt,
      promptImages,
      history,
      // Rebuilt from the saved profile every time, so edits apply at once.
      system: buildSystemPrompt(agent, {
        unavailableApps: tools.unavailable,
        run,
        sandbox: wantsSandbox ? (hasSandbox ? 'on' : 'off') : undefined,
        browser: wantsBrowser ? (hasBrowser ? 'on' : 'off') : undefined,
        desktop: wantsDesktop ? (hasDesktop ? 'on' : 'off') : undefined,
        runner: runnerId !== null && !usesCli,
        cli: usesCli,
        memory: recall.memory,
        knowledge: recall.knowledge,
      }),
      tools: tools.toolbox.toToolSet(mode),
      maxSteps: MAX_STEPS,
    })) {
      if (part.type === 'text') {
        text += part.text;
        onProgress({type: 'delta', text: part.text});
      } else if (part.type === 'tool-call' && part.risk) {
        // A tool the engine ran itself (Claude Code's Read, Edit…), under
        // the permission its approval mode maps to: shown, not asked.
        report({
          id: part.id,
          name: part.name,
          risk: part.risk,
          input: part.input,
          status: 'running',
        });
      } else if (part.type === 'tool-call') {
        const found = tools.toolbox.find(part.name);
        const risk = tools.toolbox.riskOf(part.name);
        if (found && tools.toolbox.decide(part.name, mode) === 'ask') {
          // Saved as a request with the answer. Nothing runs until the
          // person approves, and then exactly this tool and input run.
          const approvalId = randomUUID();
          approvals.push({
            id: approvalId,
            userId,
            agentId: agent.id,
            toolCallId: part.id,
            toolName: part.name,
            toolSource: sourceOf(found),
            risk,
            input: part.input ?? {},
          });
          report({
            id: part.id,
            name: part.name,
            risk,
            input: part.input,
            status: 'waiting',
            error: WAITING_FOR_PERSON,
            approvalId,
          });
        } else {
          report({
            id: part.id,
            name: part.name,
            risk,
            input: part.input,
            status: 'running',
          });
        }
      } else {
        const call = calls.get(part.id);
        // A waiting call stays waiting: nothing ran, whatever comes back.
        if (!call || call.status === 'waiting') {
          continue;
        }
        if (part.type === 'tool-result') {
          // Charts are saved for the person; the card keeps the model's view.
          const kept = await keepImages(db, {userId, threadId}, part.output);
          report({
            ...call,
            status: 'done',
            output: kept.output,
            ...(kept.images.length > 0 ? {images: kept.images} : {}),
          });
        } else {
          report({...call, status: 'failed', error: part.error});
        }
      }
    }
  } catch (error) {
    return {ok: false, error: engineErrorMessage(error)};
  } finally {
    await tools.close();
  }

  if (!text.trim() && calls.size === 0) {
    const name = getProvider(engine.provider).name;
    return {ok: false, error: `${name} sent back an empty answer.`};
  }
  return {ok: true, text, toolCalls: [...calls.values()], approvals};
}
