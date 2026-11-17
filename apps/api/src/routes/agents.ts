import type {AgentRow, Database} from '@binary/db';
import {AgentRepository, AgentTemplateRepository} from '@binary/db';
import type {AgentSummary, FieldErrors} from '@binary/shared';
import {
  agentInputSchema,
  API_ERROR_CODES,
  getProvider,
  replySchema,
  validate,
} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';
import {z} from 'zod';

import {buildSystemPrompt} from '../agents/system-prompt';
import type {Engine} from '../engine/engine';
import type {EngineFactory} from '../engine/factory';
import {MissingKeyError} from '../engine/factory';
import {findEncryptedKey} from '../key-store';
import type {SignedInEnv} from '../middleware/require-user';
import {VaultError} from '../vault';
import {streamAnswer} from './stream-answer';

interface AgentsRouteOptions {
  db: Database;
  engineFor: EngineFactory;
}

/** Only the fields the apps need; the owner and timestamps stay here. */
export function toAgentSummary(row: AgentRow): AgentSummary {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar ?? 'pebble',
    role: row.role,
    instructions: row.instructions,
    provider: row.provider,
    model: row.model,
    templateId: row.templateId,
  };
}

/**
 * The same answer for "doesn't exist" and "belongs to someone else", so a
 * stranger can't even learn that an agent id is real.
 */
function notFound(c: Context) {
  return c.json(
    {code: API_ERROR_CODES.notFound, message: 'There is no agent here.'},
    404,
  );
}

function invalidInput(
  c: Context,
  message: string,
  fieldErrors: FieldErrors<Record<string, unknown>>,
) {
  return c.json(
    {code: API_ERROR_CODES.invalidInput, message, fieldErrors},
    400,
  );
}

const agentIdSchema = z.uuid();

/** Agent routes, mounted at /api/agents. Every query is scoped to the person. */
export function agentsRoutes({db, engineFor}: AgentsRouteOptions) {
  const agents = new AgentRepository(db);
  const templates = new AgentTemplateRepository(db);
  const routes = new Hono<SignedInEnv>();

  /** Reads and checks a hire/edit form, including that a key exists. */
  async function readAgentInput(c: Context<SignedInEnv>) {
    const result = validate(
      agentInputSchema,
      await c.req.json().catch(() => null),
    );
    if (!result.success) {
      return {response: invalidInput(c, result.firstError, result.errors)};
    }
    const {provider} = result.data;
    if (!(await findEncryptedKey(db, c.var.user.id, provider))) {
      const message = `Add your ${getProvider(provider).name} key on the API keys page first.`;
      return {
        response: c.json(
          {
            code: API_ERROR_CODES.noKey,
            message,
            fieldErrors: {provider: message},
          },
          400,
        ),
      };
    }
    return {input: result.data};
  }

  /** Finds one of this person's agents from the URL, or undefined. */
  async function findAgent(c: Context<SignedInEnv>) {
    const id = agentIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return undefined;
    }
    return agents.findForUser(id.data, c.var.user.id);
  }

  routes.get('/', async c => {
    const rows = await agents.listForUser(c.var.user.id);
    return c.json({agents: rows.map(toAgentSummary)});
  });

  routes.post('/', async c => {
    const {input, response} = await readAgentInput(c);
    if (!input) {
      return response;
    }
    const {templateId, ...fields} = input;
    // Only link real templates; a made-up id is dropped, not trusted.
    const template = templateId
      ? await templates.findById(templateId)
      : undefined;
    const row = await agents.create(c.var.user.id, {
      ...fields,
      templateId: template?.id ?? null,
    });
    return c.json({agent: toAgentSummary(row)}, 201);
  });

  routes.get('/:id', async c => {
    const row = await findAgent(c);
    return row ? c.json({agent: toAgentSummary(row)}) : notFound(c);
  });

  routes.patch('/:id', async c => {
    const existing = await findAgent(c);
    if (!existing) {
      return notFound(c);
    }
    const {input, response} = await readAgentInput(c);
    if (!input) {
      return response;
    }
    const {templateId: _ignored, ...changes} = input;
    const row = await agents.updateForUser(existing.id, c.var.user.id, changes);
    return row ? c.json({agent: toAgentSummary(row)}) : notFound(c);
  });

  routes.delete('/:id', async c => {
    const id = agentIdSchema.safeParse(c.req.param('id'));
    const deleted =
      id.success && (await agents.deleteForUser(id.data, c.var.user.id));
    return deleted ? c.json({ok: true}) : notFound(c);
  });

  /** Streams the agent's answer to a message, in character. */
  routes.post('/:id/reply', async c => {
    const agent = await findAgent(c);
    if (!agent) {
      return notFound(c);
    }
    const result = validate(replySchema, await c.req.json().catch(() => null));
    if (!result.success) {
      return invalidInput(c, result.firstError, result.errors);
    }
    if (!agent.provider || !agent.model) {
      return c.json(
        {
          code: API_ERROR_CODES.noKey,
          message: `${agent.name} has no model yet. Pick one on the edit page.`,
        },
        409,
      );
    }

    const name = getProvider(agent.provider).name;
    let engine: Engine;
    try {
      engine = await engineFor(c.var.user.id, agent.provider, agent.model);
    } catch (error) {
      if (error instanceof MissingKeyError || error instanceof VaultError) {
        return c.json(
          {
            code: API_ERROR_CODES.noKey,
            message: `${agent.name} thinks with ${name}. Add your ${name} key on the API keys page.`,
          },
          409,
        );
      }
      throw error;
    }

    return streamAnswer(engine, {
      prompt: result.data.message,
      history: result.data.history,
      // Rebuilt from the saved profile on every message, so edits apply
      // to the very next answer.
      system: buildSystemPrompt(agent),
      signal: c.req.raw.signal,
    });
  });

  return routes;
}
