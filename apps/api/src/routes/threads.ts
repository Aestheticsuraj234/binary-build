import type {AgentRow, Database, MessageRow, ThreadRow} from '@binary/db';
import {AgentRepository, ThreadRepository} from '@binary/db';
import type {
  ChatEvent,
  ChatMessage,
  ThreadDetail,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import {
  API_ERROR_CODES,
  CHAT_CONTEXT_MESSAGES,
  contextWindow,
  getProvider,
  sendMessageSchema,
  startChatSchema,
  titleFromMessage,
} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';

import {generateAnswer} from '../chat/answer';
import {modelTurns} from '../chat/history';
import type {Engine} from '../engine/engine';
import type {EngineFactory} from '../engine/factory';
import {MissingKeyError} from '../engine/factory';
import type {SignedInEnv} from '../middleware/require-user';
import {
  ConflictError,
  idParam,
  NoKeyError,
  NotFoundError,
  readJson,
} from '../errors';
import type {ComposioGateway} from '../tools/composio';
import type {BinaryTool} from '../tools/toolbox';
import type {Vault} from '../vault';
import {VaultError} from '../vault';
import {toAgentSummary} from './agents';
import {ndjsonResponse} from './stream-answer';

interface ThreadsRouteOptions {
  db: Database;
  vault: Vault;
  engineFor: EngineFactory;
  builtInTools: () => BinaryTool[];
  composio: ComposioGateway | null;
}

export function toThreadSummary(
  thread: ThreadRow,
  agent: Pick<AgentRow, 'name' | 'avatar'>,
): ThreadSummary {
  return {
    id: thread.id,
    title: thread.title,
    agentId: thread.agentId,
    agentName: agent.name,
    avatar: agent.avatar ?? 'pebble',
    updatedAt: thread.updatedAt.toISOString(),
  };
}

export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    toolCalls: row.toolCalls as ToolCallRecord[],
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Chat routes, mounted at /api/threads. A thread is one conversation with
 * one agent; every query is scoped to the signed-in person.
 */
export function threadsRoutes({
  db,
  vault,
  engineFor,
  builtInTools,
  composio,
}: ThreadsRouteOptions) {
  const threads = new ThreadRepository(db);
  const agents = new AgentRepository(db);
  const routes = new Hono<SignedInEnv>();

  /** One of this person's threads from the URL, or a 404. */
  async function findThread(c: Context<SignedInEnv>) {
    const found = await threads.findForUser(idParam(c, 'chat'), c.var.user.id);
    if (!found) {
      throw new NotFoundError('chat');
    }
    return found;
  }

  /** Recent chats, newest first. */
  routes.get('/', async c => {
    const rows = await threads.listForUser(c.var.user.id);
    return c.json({
      threads: rows.map(({thread, agent}) => toThreadSummary(thread, agent)),
    });
  });

  /** Starts a chat with one of your agents. */
  routes.post('/', async c => {
    const {agentId} = await readJson(c, startChatSchema);
    const agent = await agents.findForUser(agentId, c.var.user.id);
    if (!agent) {
      throw new NotFoundError('agent');
    }
    const thread = await threads.create(c.var.user.id, agent.id);
    return c.json({thread: toThreadSummary(thread, agent)}, 201);
  });

  /** A chat with all its messages, to pick it up again. */
  routes.get('/:id', async c => {
    const found = await findThread(c);
    const rows = await threads.listMessages(found.thread.id);
    const detail: ThreadDetail = {
      thread: toThreadSummary(found.thread, found.agent),
      agent: toAgentSummary(found.agent),
      isFired: found.agent.firedAt !== null,
      messages: rows.map(toChatMessage),
    };
    return c.json(detail);
  });

  routes.delete('/:id', async c => {
    if (!(await threads.deleteForUser(idParam(c, 'chat'), c.var.user.id))) {
      throw new NotFoundError('chat');
    }
    return c.json({ok: true});
  });

  /**
   * Sends a message and streams the answer. Everything that can be checked
   * up front is checked before the first byte, so those errors get a real
   * HTTP status. Once streaming starts, problems arrive as an `error` event.
   */
  routes.post('/:id/messages', async c => {
    const {thread, agent} = await findThread(c);
    const {message} = await readJson(c, sendMessageSchema);
    if (agent.firedAt) {
      throw new ConflictError(
        `${agent.name} was fired, so this chat is read-only.`,
        API_ERROR_CODES.readOnly,
      );
    }
    if (!agent.provider || !agent.model) {
      throw new NoKeyError(
        `${agent.name} has no model yet. Pick one on the edit page.`,
      );
    }
    const name = getProvider(agent.provider).name;
    const userId = c.var.user.id;
    let engine: Engine;
    try {
      engine = await engineFor(userId, agent.provider, agent.model);
    } catch (error) {
      if (error instanceof MissingKeyError || error instanceof VaultError) {
        throw new NoKeyError(
          `${agent.name} thinks with ${name}. Add your ${name} key on the API keys page.`,
        );
      }
      throw error;
    }

    // Your message is saved before the model is asked, so it is never lost.
    const question = await threads.addQuestion(
      thread.id,
      message,
      titleFromMessage(message),
    );
    // The model reads only the newest messages (this one included).
    const context = contextWindow(
      await threads.recentMessages(thread.id, CHAT_CONTEXT_MESSAGES),
    );
    const history = modelTurns(context.slice(0, -1));

    return ndjsonResponse<ChatEvent>(async send => {
      send({
        type: 'start',
        model: engine.model,
        userMessage: toChatMessage(question),
      });

      const outcome = await generateAnswer(
        {db, vault, builtInTools, composio},
        {engine, agent, userId, prompt: message, history},
        send,
      );
      if (!outcome.ok) {
        // A part-way answer stays on their screen, but isn't saved.
        send({type: 'error', message: outcome.error});
        return;
      }
      try {
        // Saved with any approval requests it made, all or nothing.
        const saved = await threads.addAnswer(
          thread.id,
          outcome.text,
          outcome.toolCalls,
          outcome.approvals,
        );
        send({type: 'done', message: toChatMessage(saved)});
      } catch (error) {
        // For example, the chat was deleted while the answer streamed.
        console.error('[threads] could not save an answer:', error);
        send({type: 'error', message: "The answer couldn't be saved."});
      }
    });
  });

  return routes;
}
