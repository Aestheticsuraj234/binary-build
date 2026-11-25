import type {Database} from '@binary/db';
import {AgentRepository, MemoryRepository} from '@binary/db';
import type {AddMemoryResult, MemoriesOverview} from '@binary/shared';
import {addMemorySchema} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';
import {z} from 'zod';

import type {Embedder, EmbedderFactory} from '../embeddings/embedder';
import {toEmbeddingStatus} from '../embeddings/embedder';
import {idParam, NoKeyError, NotFoundError, readJson} from '../errors';
import {
  reindexMemories,
  rememberFact,
  toMemorySummary,
} from '../memory/memories';
import type {SignedInEnv} from '../middleware/require-user';

const memoryIdSchema = z.uuid();

/**
 * A character's Memory page, mounted at /api/agents: `/:id/memories`. Only
 * the person's own (hired) characters, and only their memories.
 */
export function memoriesRoutes({
  db,
  embedders,
}: {
  db: Database;
  embedders: EmbedderFactory;
}) {
  const agents = new AgentRepository(db);
  const memories = new MemoryRepository(db);
  const routes = new Hono<SignedInEnv>();

  async function findAgentId(c: Context<SignedInEnv>): Promise<string> {
    const agent = await agents.findForUser(idParam(c, 'agent'), c.var.user.id);
    if (!agent) {
      throw new NotFoundError('agent');
    }
    return agent.id;
  }

  /** The embedder, or a 409 that says which key to add. */
  async function requireEmbedder(userId: string): Promise<Embedder> {
    const choice = await embedders(userId);
    if (!choice.ok) {
      throw new NoKeyError(choice.message);
    }
    return choice.embedder;
  }

  routes.get('/:id/memories', async c => {
    const userId = c.var.user.id;
    const agentId = await findAgentId(c);
    const [choice, rows] = await Promise.all([
      embedders(userId),
      memories.listForAgent(userId, agentId),
    ]);
    const model = choice.ok ? choice.embedder.model : null;
    const overview: MemoriesOverview = {
      status: toEmbeddingStatus(choice),
      memories: rows.map(row => toMemorySummary(row, model)),
      otherModelCount:
        model === null
          ? 0
          : rows.filter(r => r.embeddingModel !== model).length,
    };
    return c.json(overview);
  });

  routes.post('/:id/memories', async c => {
    const userId = c.var.user.id;
    const agentId = await findAgentId(c);
    const {content} = await readJson(c, addMemorySchema);
    const embedder = await requireEmbedder(userId);
    // The person knows what they mean: only a real duplicate is refused.
    const outcome = await rememberFact(db, embedder, {
      userId,
      agentId,
      content,
      source: 'person',
      allowSimilar: true,
    });
    if (outcome.status === 'similar') {
      throw new Error('A memory the person adds is never held back.');
    }
    const result: AddMemoryResult = {
      status: outcome.status,
      memory: toMemorySummary(outcome.memory, embedder.model),
    };
    return c.json(result, outcome.status === 'saved' ? 201 : 200);
  });

  routes.post('/:id/memories/reindex', async c => {
    const userId = c.var.user.id;
    const agentId = await findAgentId(c);
    const embedder = await requireEmbedder(userId);
    const reindexed = await reindexMemories(db, embedder, {userId, agentId});
    return c.json({reindexed});
  });

  routes.delete('/:id/memories/:memoryId', async c => {
    const agentId = await findAgentId(c);
    const memoryId = memoryIdSchema.safeParse(c.req.param('memoryId'));
    if (
      !memoryId.success ||
      !(await memories.deleteForAgent(memoryId.data, c.var.user.id, agentId))
    ) {
      throw new NotFoundError('memory');
    }
    return c.json({ok: true});
  });

  return routes;
}
