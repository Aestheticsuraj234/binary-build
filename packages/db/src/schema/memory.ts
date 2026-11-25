import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import {agents} from './agents';
import {user} from './auth';

/**
 * How long every embedding is. OpenAI and Google are both asked for this
 * size, so their vectors fit the same columns. Vectors from different
 * models still can't be compared: every search also matches
 * `embeddingModel`.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * A lasting fact one character knows about its person, like "prefers short
 * answers". Saved by the character (its `remember` tool) or by the person
 * on the Memory page.
 */
export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, {onDelete: 'cascade'}),
    content: text('content').notNull(),
    /** Who saved it: the character, or the person themselves. */
    source: text('source', {enum: ['character', 'person']}).notNull(),
    embedding: vector('embedding', {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    /** The model that made `embedding`, e.g. "openai/text-embedding-3-small". */
    embeddingModel: text('embedding_model').notNull(),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
  },
  table => [
    index('memories_agent_id_idx').on(table.agentId),
    index('memories_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

/** One document in a person's knowledge library, shared by every character. */
export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    title: text('title').notNull(),
    /** Where it came from: pasted text, an uploaded file or a web page. */
    kind: text('kind', {enum: ['text', 'file', 'url']}).notNull(),
    /** The page's address, for `url` documents. */
    url: text('url'),
    /** How long the whole text is, in characters. */
    characters: integer('characters').notNull(),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
  },
  table => [index('knowledge_documents_user_id_idx').on(table.userId)],
);

/** A passage of a document, with its embedding: what a search finds. */
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, {onDelete: 'cascade'}),
    /** Kept here too, so a search never has to join to stay scoped. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    /** Its place in the document, from 0. */
    position: integer('position').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    embeddingModel: text('embedding_model').notNull(),
  },
  table => [
    index('knowledge_chunks_document_id_idx').on(table.documentId),
    index('knowledge_chunks_user_id_idx').on(table.userId),
    index('knowledge_chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

export type MemoryRow = typeof memories.$inferSelect;
export type KnowledgeDocumentRow = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeChunkRow = typeof knowledgeChunks.$inferSelect;
