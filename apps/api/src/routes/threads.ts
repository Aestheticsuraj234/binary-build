import type {AgentRow, Database, MessageRow, ThreadRow} from '@binary/db';
import {AgentRepository, ThreadRepository} from '@binary/db';
import type {
  ChatEvent,
  ChatMessage,
  ThreadDetail,
  ThreadSummary,
} from '@binary/shared';
import {
  API_ERROR_CODES,
  CHAT_CONTEXT_MESSAGES,
  contextWindow,
  getProvider,
  sendMessageSchema,
  startChatSchema,
  titleFromMessage,
  validate,
} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';
import {z} from 'zod';

import {buildSystemPrompt} from '../agents/system-prompt';
import type {Engine} from '../engine/engine';
import type {EngineFactory} from '../engine/factory';
import {MissingKeyError} from '../engine/factory';
import type {SignedInEnv} from '../middleware/require-user';
import {VaultError} from '../vault';
import {toAgentSummary} from './agents';
import {engineErrorMessage, ndjsonResponse} from './stream-answer';

interface ThreadsRouteOptions {
  db: Database;
  engineFor: EngineFactory;
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
    createdAt: row.createdAt.toISOString(),
  };
}

/** The same answer for "doesn't exist" and "belongs to someone else". */
function notFound(c: Context, what: 'chat' | 'agent' = 'chat') {
  return c.json(
    {code: API_ERROR_CODES.notFound, message: `There is no ${what} here.`},
    404,
  );
}

function conflict(c: Context, code: string, message: string) {
  return c.json({code, message}, 409);
}

const threadIdSchema = z.uuid();

/**
 * Chat routes, mounted at /api/threads. A thread is one conversation with
 * one agent; every query is scoped to the signed-in person.
 */
export function threadsRoutes({db, engineFor}: ThreadsRouteOptions) {
  const threads = new ThreadRepository(db);
  const agents = new AgentRepository(db);
  const routes = new Hono<SignedInEnv>();

  /** Finds one of this person's threads from the URL, or undefined. */
  async function findThread(c: Context<SignedInEnv>) {
    const id = threadIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return undefined;
    }
    return threads.findForUser(id.data, c.var.user.id);
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
    const result = validate(
      startChatSchema,
      await c.req.json().catch(() => null),
    );
    if (!result.success) {
      return c.json(
        {
          code: API_ERROR_CODES.invalidInput,
          message: result.firstError,
          fieldErrors: result.errors,
        },
        400,
      );
    }
    const agent = await agents.findForUser(result.data.agentId, c.var.user.id);
    if (!agent) {
      return notFound(c, 'agent');
    }
    const thread = await threads.create(c.var.user.id, agent.id);
    return c.json({thread: toThreadSummary(thread, agent)}, 201);
  });

  /** A chat with all its messages, to pick it up again. */
  routes.get('/:id', async c => {
    const found = await findThread(c);
    if (!found) {
      return notFound(c);
    }
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
    const id = threadIdSchema.safeParse(c.req.param('id'));
    const deleted =
      id.success && (await threads.deleteForUser(id.data, c.var.user.id));
    return deleted ? c.json({ok: true}) : notFound(c);
  });

  /**
   * Sends a message and streams the answer. Everything that can be checked
   * up front is checked before the first byte, so those errors get a real
   * HTTP status. Once streaming starts, problems arrive as an `error` event.
   */
  routes.post('/:id/messages', async c => {
    const found = await findThread(c);
    if (!found) {
      return notFound(c);
    }
    const result = validate(
      sendMessageSchema,
      await c.req.json().catch(() => null),
    );
    if (!result.success) {
      return c.json(
        {
          code: API_ERROR_CODES.invalidInput,
          message: result.firstError,
          fieldErrors: result.errors,
        },
        400,
      );
    }

    const {thread, agent} = found;
    if (agent.firedAt) {
      return conflict(
        c,
        API_ERROR_CODES.readOnly,
        `${agent.name} was fired, so this chat is read-only.`,
      );
    }
    if (!agent.provider || !agent.model) {
      return conflict(
        c,
        API_ERROR_CODES.noKey,
        `${agent.name} has no model yet. Pick one on the edit page.`,
      );
    }
    const name = getProvider(agent.provider).name;
    let engine: Engine;
    try {
      engine = await engineFor(c.var.user.id, agent.provider, agent.model);
    } catch (error) {
      if (error instanceof MissingKeyError || error instanceof VaultError) {
        return conflict(
          c,
          API_ERROR_CODES.noKey,
          `${agent.name} thinks with ${name}. Add your ${name} key on the API keys page.`,
        );
      }
      throw error;
    }

    // Your message is saved before the model is asked, so it is never lost.
    const {message} = result.data;
    const question = await threads.addQuestion(
      thread.id,
      message,
      titleFromMessage(message),
    );
    // The model reads only the newest messages (this one included).
    const context = contextWindow(
      await threads.recentMessages(thread.id, CHAT_CONTEXT_MESSAGES),
    );
    const history = context
      .slice(0, -1)
      .map(({role, content}) => ({role, content}));
    // Rebuilt from the saved profile every time, so edits apply at once.
    const system = buildSystemPrompt(agent);

    return ndjsonResponse<ChatEvent>(async send => {
      send({
        type: 'start',
        model: engine.model,
        userMessage: toChatMessage(question),
      });
      let answer = '';
      try {
        // No abort signal on purpose: if the person closes the tab, the
        // answer still finishes and is saved for when they come back.
        for await (const text of engine.stream({
          prompt: message,
          history,
          system,
        })) {
          answer += text;
          send({type: 'delta', text});
        }
      } catch (error) {
        // A part-way answer stays on their screen, but isn't saved.
        send({type: 'error', message: engineErrorMessage(error)});
        return;
      }

      if (!answer.trim()) {
        send({type: 'error', message: `${name} sent back an empty answer.`});
        return;
      }
      try {
        const saved = await threads.addAnswer(thread.id, answer);
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
