import type {AgentRow, Database} from '@binary/db';
import {AgentRepository, AgentTemplateRepository} from '@binary/db';
import type {AgentSummary} from '@binary/shared';
import {agentInputSchema, API_ERROR_CODES, getProvider} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';

import {idParam, InvalidInputError, NotFoundError, readJson} from '../errors';
import {findEncryptedKey} from '../key-store';
import type {SignedInEnv} from '../middleware/require-user';

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
    approvalMode: row.approvalMode,
  };
}

/** Agent routes, mounted at /api/agents. Every query is scoped to the person. */
export function agentsRoutes(db: Database) {
  const agents = new AgentRepository(db);
  const templates = new AgentTemplateRepository(db);
  const routes = new Hono<SignedInEnv>();

  /** Reads and checks a hire/edit form, including that a key exists. */
  async function readAgentInput(c: Context<SignedInEnv>) {
    const input = await readJson(c, agentInputSchema);
    if (!(await findEncryptedKey(db, c.var.user.id, input.provider))) {
      const message = `Add your ${getProvider(input.provider).name} key on the API keys page first.`;
      throw new InvalidInputError(
        message,
        {provider: message},
        API_ERROR_CODES.noKey,
      );
    }
    return input;
  }

  /**
   * One of this person's agents from the URL. Missing and "someone else's"
   * get the same 404, so a stranger can't even learn an id is real.
   */
  async function findAgent(c: Context<SignedInEnv>): Promise<AgentRow> {
    const row = await agents.findForUser(idParam(c, 'agent'), c.var.user.id);
    if (!row) {
      throw new NotFoundError('agent');
    }
    return row;
  }

  routes.get('/', async c => {
    const rows = await agents.listForUser(c.var.user.id);
    return c.json({agents: rows.map(toAgentSummary)});
  });

  routes.post('/', async c => {
    const {templateId, ...fields} = await readAgentInput(c);
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
    return c.json({agent: toAgentSummary(await findAgent(c))});
  });

  routes.patch('/:id', async c => {
    const existing = await findAgent(c);
    const {templateId: _ignored, ...changes} = await readAgentInput(c);
    const row = await agents.updateForUser(existing.id, c.var.user.id, changes);
    if (!row) {
      throw new NotFoundError('agent');
    }
    return c.json({agent: toAgentSummary(row)});
  });

  /** Fires an agent. Its chats stay, read-only. */
  routes.delete('/:id', async c => {
    if (!(await agents.fireForUser(idParam(c, 'agent'), c.var.user.id))) {
      throw new NotFoundError('agent');
    }
    return c.json({ok: true});
  });

  return routes;
}
