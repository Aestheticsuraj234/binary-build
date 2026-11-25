import type {Database} from '@binary/db';
import {KnowledgeRepository} from '@binary/db';
import type {KnowledgeOverview} from '@binary/shared';
import {addKnowledgeSchema, knowledgeSearchSchema} from '@binary/shared';
import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';

import type {Embedder, EmbedderFactory} from '../embeddings/embedder';
import {toEmbeddingStatus} from '../embeddings/embedder';
import {
  idParam,
  NoKeyError,
  NotFoundError,
  readJson,
  TooLargeError,
} from '../errors';
import type {PageFetcher} from '../knowledge/library';
import {
  addDocument,
  reindexKnowledge,
  searchKnowledge,
  toDocumentSummary,
} from '../knowledge/library';
import type {SignedInEnv} from '../middleware/require-user';

/** Room for the longest document, written in any script, as JSON. */
const MAX_BODY_BYTES = 3 * 1024 * 1024;

/**
 * The person's knowledge library, mounted at /api/knowledge. It's theirs
 * and shared by all their characters.
 */
export function knowledgeRoutes({
  db,
  embedders,
  fetchPage,
}: {
  db: Database;
  embedders: EmbedderFactory;
  fetchPage: PageFetcher;
}) {
  const documents = new KnowledgeRepository(db);
  const routes = new Hono<SignedInEnv>();

  async function requireEmbedder(userId: string): Promise<Embedder> {
    const choice = await embedders(userId);
    if (!choice.ok) {
      throw new NoKeyError(choice.message);
    }
    return choice.embedder;
  }

  routes.get('/', async c => {
    const userId = c.var.user.id;
    const choice = await embedders(userId);
    const rows = await documents.listForUser(
      userId,
      choice.ok ? choice.embedder.model : null,
    );
    const overview: KnowledgeOverview = {
      status: toEmbeddingStatus(choice),
      documents: rows.map(toDocumentSummary),
    };
    return c.json(overview);
  });

  routes.post(
    '/',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new TooLargeError('That document is too big to add.');
      },
    }),
    async c => {
      const userId = c.var.user.id;
      const input = await readJson(c, addKnowledgeSchema);
      const embedder = await requireEmbedder(userId);
      const document = await addDocument(
        db,
        embedder,
        fetchPage,
        userId,
        input,
      );
      return c.json({document}, 201);
    },
  );

  /** "Try a question": the passages a character would find. */
  routes.post('/search', async c => {
    const userId = c.var.user.id;
    const {query} = await readJson(c, knowledgeSearchSchema);
    const embedder = await requireEmbedder(userId);
    return c.json({
      matches: await searchKnowledge(db, embedder, userId, query),
    });
  });

  routes.post('/reindex', async c => {
    const userId = c.var.user.id;
    const embedder = await requireEmbedder(userId);
    return c.json({reindexed: await reindexKnowledge(db, embedder, userId)});
  });

  routes.delete('/:id', async c => {
    const id = idParam(c, 'document');
    if (!(await documents.deleteForUser(id, c.var.user.id))) {
      throw new NotFoundError('document');
    }
    return c.json({ok: true});
  });

  return routes;
}
