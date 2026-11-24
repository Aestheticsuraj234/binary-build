import {randomUUID} from 'node:crypto';

import type {AgentRow, Database, PendingApproval} from '@binary/db';
import type {ChatTurn, ToolCallRecord} from '@binary/shared';
import {decideTool, getProvider} from '@binary/shared';

import type {RunContext} from '../agents/system-prompt';
import {buildSystemPrompt} from '../agents/system-prompt';
import type {Engine} from '../engine/engine';
import {engineErrorMessage} from '../routes/stream-answer';
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

/** What the person sees on a tool call that waits for their OK. */
export const WAITING_FOR_PERSON = 'Needs your OK before it runs.';

/** What answering needs from the app: the database, keys and tools. */
export interface AnswerDeps {
  db: Database;
  vault: Vault;
  builtInTools: () => BinaryTool[];
  composio: ComposioGateway | null;
}

export interface AnswerRequest {
  engine: Engine;
  agent: AgentRow;
  userId: string;
  /** The newest message from the person. */
  prompt: string;
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
  {db, vault, builtInTools, composio}: AnswerDeps,
  {engine, agent, userId, prompt, history, run}: AnswerRequest,
  onProgress: (progress: AnswerProgress) => void = () => {},
): Promise<AnswerOutcome> {
  const mode = agent.approvalMode;
  // Built-in tools plus every app that answers. An app that's down is
  // left out, and the answer carries on without it. Plan only uses no
  // tools, so it doesn't open any apps.
  const tools =
    mode === 'plan_only'
      ? NO_TOOLS
      : await loadUserToolbox(db, vault, userId, builtInTools(), composio);
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
      history,
      // Rebuilt from the saved profile every time, so edits apply at once.
      system: buildSystemPrompt(agent, {
        unavailableApps: tools.unavailable,
        run,
      }),
      tools: tools.toolbox.toToolSet(mode),
      maxSteps: MAX_STEPS,
    })) {
      if (part.type === 'text') {
        text += part.text;
        onProgress({type: 'delta', text: part.text});
      } else if (part.type === 'tool-call') {
        const found = tools.toolbox.find(part.name);
        const risk = tools.toolbox.riskOf(part.name);
        if (found && decideTool(mode, risk) === 'ask') {
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
        report(
          part.type === 'tool-result'
            ? {...call, status: 'done', output: part.output}
            : {...call, status: 'failed', error: part.error},
        );
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
