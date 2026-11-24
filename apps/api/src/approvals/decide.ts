import type {
  ApprovalListItem,
  ApprovalRow,
  MessageRow,
  ToolSource,
} from '@binary/db';
import {AppRepository, ApprovalRepository, ThreadRepository} from '@binary/db';
import type {
  ApprovalDecided,
  ApprovalSummary,
  ChatMessage,
  ToolCallRecord,
} from '@binary/shared';
import {
  API_ERROR_CODES,
  CHAT_CONTEXT_MESSAGES,
  contextWindow,
  getProvider,
} from '@binary/shared';

import type {AnswerDeps} from '../chat/answer';
import {generateAnswer} from '../chat/answer';
import {modelTurns, noteForModel, noteForPerson} from '../chat/history';
import type {Engine} from '../engine/engine';
import type {EngineFactory} from '../engine/factory';
import {MissingKeyError} from '../engine/factory';
import {ConflictError, NotFoundError} from '../errors';
import {toChatMessage} from '../routes/threads';
import {toBinaryTools} from '../tools/composio';
import {activeToolkits} from '../tools/integrations';
import {authorizationOf, openApp} from '../tools/mcp-apps';
import type {BinaryTool} from '../tools/toolbox';
import {sourceOf} from '../tools/toolbox';
import {VaultError} from '../vault';

/** What deciding needs: the chat pipeline's deps plus an engine factory. */
export interface ApprovalDeps extends AnswerDeps {
  engineFor: EngineFactory;
}

/** What a rejected tool card says. */
export const REJECTED_FOR_PERSON = 'You rejected this, so it never ran.';

export function toApprovalSummary({
  approval,
  agent,
  threadTitle,
  routineName,
}: ApprovalListItem): ApprovalSummary {
  return {
    id: approval.id,
    status: approval.status,
    toolName: approval.toolName,
    risk: approval.risk,
    input: approval.input,
    agentId: agent.id,
    agentName: agent.name,
    avatar: agent.avatar ?? 'pebble',
    threadId: approval.threadId,
    threadTitle,
    routineName,
    error: approval.error,
    createdAt: approval.createdAt.toISOString(),
    decidedAt: approval.decidedAt?.toISOString() ?? null,
  };
}

/** A tool found again, and how to let go of its connection. */
interface FoundTool {
  tool: BinaryTool;
  close(): Promise<void>;
}

function sameSource(a: ToolSource, b: ToolSource): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Finds exactly the tool a request was made for: the same built-in, the
 * same app's tool by its own name, or the same Composio slug. Never a
 * tool that merely has the same name now. Throws a reason that's safe to
 * show if it's gone.
 */
async function findExactTool(
  deps: ApprovalDeps,
  userId: string,
  source: ToolSource,
): Promise<FoundTool> {
  const gone = (what: string) =>
    new Error(`${what} isn't available anymore, so nothing ran.`);

  if (source.kind === 'built-in') {
    const tool = deps
      .builtInTools()
      .find(candidate => sameSource(sourceOf(candidate), source));
    if (!tool) {
      throw gone(`The ${source.name} tool`);
    }
    return {tool, close: async () => {}};
  }

  if (source.kind === 'app') {
    const app = await new AppRepository(deps.db).findForUser(
      source.appId,
      userId,
    );
    if (!app) {
      throw gone('That app');
    }
    const open = await openApp({
      appId: app.id,
      name: app.name,
      url: app.url,
      authorization: authorizationOf(app, deps.vault),
    });
    const tool = open.tools.find(candidate =>
      sameSource(sourceOf(candidate), source),
    );
    if (!tool) {
      await open.close().catch(() => {});
      throw gone(`${app.name}'s ${source.tool} tool`);
    }
    return {tool, close: () => open.close()};
  }

  if (!deps.composio) {
    throw gone('Composio');
  }
  const toolkits = await activeToolkits(deps.composio, deps.db, userId);
  const tools = toBinaryTools(await deps.composio.loadTools(userId, toolkits));
  const tool = tools.find(candidate => sameSource(sourceOf(candidate), source));
  if (!tool) {
    throw gone(`The ${source.slug} tool`);
  }
  return {tool, close: async () => {}};
}

/** Runs an approved request once, with exactly its saved input. */
async function runApproved(
  deps: ApprovalDeps,
  approval: ApprovalRow,
): Promise<
  {status: 'done'; output: unknown} | {status: 'failed'; error: string}
> {
  let found: FoundTool | undefined;
  try {
    found = await findExactTool(deps, approval.userId, approval.toolSource);
    const output = await found.tool.run(approval.input, undefined);
    return {status: 'done', output};
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await found?.close().catch(() => {});
  }
}

/**
 * The character's next turn after a decision: it reads the note (what was
 * decided and what happened) and tells the person. It goes through the
 * same pipeline as any answer, so it can ask again for a next step.
 */
async function followUp(
  deps: ApprovalDeps,
  userId: string,
  threadId: string,
  note: MessageRow,
): Promise<{reply: ChatMessage | null; replyError: string | null}> {
  const threads = new ThreadRepository(deps.db);
  const found = await threads.findForUser(threadId, userId);
  if (!found) {
    return {reply: null, replyError: 'This chat was deleted.'};
  }
  const {agent} = found;
  if (agent.firedAt) {
    return {
      reply: null,
      replyError: `${agent.name} was fired, so it can't follow up.`,
    };
  }
  if (!agent.provider || !agent.model) {
    return {reply: null, replyError: `${agent.name} has no model yet.`};
  }
  let engine: Engine;
  try {
    engine = await deps.engineFor(userId, agent.provider, agent.model);
  } catch (error) {
    if (error instanceof MissingKeyError || error instanceof VaultError) {
      const name = getProvider(agent.provider).name;
      return {
        reply: null,
        replyError: `${agent.name} thinks with ${name}. Add your ${name} key on the API keys page to hear back.`,
      };
    }
    throw error;
  }

  const recent = contextWindow(
    await threads.recentMessages(threadId, CHAT_CONTEXT_MESSAGES),
  ).filter(message => message.id !== note.id);
  const outcome = await generateAnswer(deps, {
    engine,
    agent,
    userId,
    prompt: noteForModel(note, {followUp: true}),
    history: modelTurns(recent),
  });
  if (!outcome.ok) {
    return {reply: null, replyError: outcome.error};
  }
  const saved = await threads.addAnswer(
    threadId,
    outcome.text,
    outcome.toolCalls,
    outcome.approvals,
  );
  return {reply: toChatMessage(saved), replyError: null};
}

/**
 * Approves or rejects one request.
 *
 * 1. **Decide once.** A conditional update moves it out of `pending`; of
 *    two decisions at once (two clicks, two devices), exactly one wins.
 *    The other gets "already decided" and nothing runs for it.
 * 2. **Approve runs exactly what was asked**: the same tool (found by its
 *    saved source, not its name) with the saved input, once.
 * 3. The tool card in the chat changes, a note says what was decided, and
 *    the character follows up in the same chat.
 */
export async function decideApproval(
  deps: ApprovalDeps,
  userId: string,
  id: string,
  decision: 'approve' | 'reject',
): Promise<ApprovalDecided> {
  const approvals = new ApprovalRepository(deps.db);
  const found = await approvals.findForUser(id, userId);
  if (!found) {
    throw new NotFoundError('approval request');
  }
  const decided = await approvals.decide(
    id,
    userId,
    decision === 'approve' ? 'running' : 'rejected',
  );
  if (!decided) {
    throw new ConflictError(
      'This request was already decided.',
      API_ERROR_CODES.alreadyDecided,
    );
  }

  let final = decided;
  if (decision === 'approve') {
    const result = await runApproved(deps, decided);
    final = (await approvals.finish(id, result)) ?? decided;
  }

  const change = (call: ToolCallRecord): ToolCallRecord => {
    const {error: _waiting, output: _none, ...rest} = call;
    if (final.status === 'done') {
      return {...rest, status: 'done', output: final.output};
    }
    if (final.status === 'failed') {
      return {...rest, status: 'failed', error: final.error ?? 'It failed.'};
    }
    return {...rest, status: 'rejected', error: REJECTED_FOR_PERSON};
  };
  const call =
    (await approvals.updateToolCall<ToolCallRecord>(
      final.messageId,
      final.toolCallId,
      change,
    )) ??
    change({
      id: final.toolCallId,
      name: final.toolName,
      risk: final.risk,
      input: final.input,
      status: 'waiting',
      approvalId: final.id,
    });

  const note = await approvals.addNote(
    final.threadId,
    noteForPerson(call),
    call,
  );
  const {reply, replyError} = await followUp(
    deps,
    userId,
    final.threadId,
    note,
  );
  return {
    approval: toApprovalSummary({...found, approval: final}),
    messageId: final.messageId,
    call,
    note: toChatMessage(note),
    reply,
    replyError,
  };
}
