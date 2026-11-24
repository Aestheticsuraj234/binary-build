import type {AgentRow, Database} from '@binary/db';
import type {ChatTurn, ToolCallRecord} from '@binary/shared';
import {getProvider, runsWithoutAsking} from '@binary/shared';

import type {RunContext} from '../agents/system-prompt';
import {buildSystemPrompt} from '../agents/system-prompt';
import type {Engine} from '../engine/engine';
import {engineErrorMessage} from '../routes/stream-answer';
import type {ComposioGateway} from '../tools/composio';
import type {BinaryTool} from '../tools/toolbox';
import {loadUserToolbox} from '../tools/user-tools';
import type {Vault} from '../vault';

/** How many model calls one answer may take (each tool round trip is one). */
export const MAX_STEPS = 6;

/** What the person sees on a blocked tool call. */
export const BLOCKED_FOR_PERSON =
  'This tool can change things outside Binary, so it needs your approval. ' +
  'Approvals arrive in a later chapter.';

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

/** A finished answer (not saved yet), or why there isn't one. */
export type AnswerOutcome =
  | {ok: true; text: string; toolCalls: ToolCallRecord[]}
  | {ok: false; error: string};

/**
 * The chat pipeline: loads the person's tools, asks the model with the
 * agent's system prompt, runs only the tools the policy allows, and
 * reports each step through `onProgress`. Chats and routine runs both use
 * this, so they get the same tools and the same rules. The caller saves
 * the result.
 */
export async function generateAnswer(
  {db, vault, builtInTools, composio}: AnswerDeps,
  {engine, agent, userId, prompt, history, run}: AnswerRequest,
  onProgress: (progress: AnswerProgress) => void = () => {},
): Promise<AnswerOutcome> {
  // Built-in tools plus every app that answers. An app that's down is
  // left out, and the answer carries on without it.
  const tools = await loadUserToolbox(
    db,
    vault,
    userId,
    builtInTools(),
    composio,
  );
  const calls = new Map<string, ToolCallRecord>();
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
      tools: tools.toolbox.toToolSet(),
      maxSteps: MAX_STEPS,
    })) {
      if (part.type === 'text') {
        text += part.text;
        onProgress({type: 'delta', text: part.text});
      } else if (part.type === 'tool-call') {
        const risk = tools.toolbox.riskOf(part.name);
        const allowed = runsWithoutAsking(risk);
        report({
          id: part.id,
          name: part.name,
          risk,
          input: part.input,
          status: allowed ? 'running' : 'blocked',
          ...(allowed ? {} : {error: BLOCKED_FOR_PERSON}),
        });
      } else {
        const call = calls.get(part.id);
        // A blocked call stays blocked: nothing ran, whatever comes back.
        if (!call || call.status === 'blocked') {
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
  return {ok: true, text, toolCalls: [...calls.values()]};
}
