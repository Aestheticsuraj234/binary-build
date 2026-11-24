import type {Database} from '@binary/db';
import {AgentTemplateRepository} from '@binary/db';
import type {AgentTemplateSummary} from '@binary/shared';
import {TEMPLATE_CHARACTERS} from '@binary/shared';
import {Hono} from 'hono';

import type {SignedInEnv} from '../middleware/require-user';

/** The shared templates, mounted at /api/agent-templates. */
export function agentTemplatesRoutes(db: Database) {
  const templates = new AgentTemplateRepository(db);
  const routes = new Hono<SignedInEnv>();

  routes.get('/', async c => {
    const rows = await templates.list();
    const summaries: AgentTemplateSummary[] = rows.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      instructions: row.instructions,
      character: TEMPLATE_CHARACTERS[row.slug] ?? 'pebble',
      computer: row.computer,
    }));
    return c.json({templates: summaries});
  });

  return routes;
}
