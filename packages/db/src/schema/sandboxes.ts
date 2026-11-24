import {sql} from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {agents} from './agents';
import {user} from './auth';
import {threads} from './chats';

/**
 * A chat's cloud sandbox (an E2B machine). It starts on the first approved
 * run and stops when it's idle too long, when someone stops it, or when
 * the chat is deleted. At most one runs per chat.
 */
export const sandboxes = pgTable(
  'sandboxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, {onDelete: 'cascade'}),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, {onDelete: 'cascade'}),
    /** A code sandbox, or a desktop you can watch. */
    kind: text('kind', {enum: ['sandbox', 'desktop']})
      .notNull()
      .default('sandbox'),
    /** Who runs it, and its id there. */
    provider: text('provider', {enum: ['e2b']}).notNull(),
    /** A desktop's view-only live stream, for its owner. */
    liveUrl: text('live_url'),
    externalId: text('external_id').notNull(),
    status: text('status', {enum: ['running', 'stopped']})
      .notNull()
      .default('running'),
    startedAt: timestamp('started_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp('last_used_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    /** When the provider stops it by itself unless it's used again. */
    expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
    stoppedAt: timestamp('stopped_at', {withTimezone: true}),
  },
  table => [
    // One running sandbox (and one desktop) per chat, even if two runs
    // start one at once.
    uniqueIndex('sandboxes_running_thread_kind_idx')
      .on(table.threadId, table.kind)
      .where(sql`${table.status} = 'running'`),
    index('sandboxes_user_id_status_idx').on(table.userId, table.status),
  ],
);

/**
 * An image a tool made for the person, like a chart. It's shown in the
 * chat and never sent to the model.
 */
export const toolImages = pgTable(
  'tool_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, {onDelete: 'cascade'}),
    mime: text('mime').notNull(),
    /** The image, base64-encoded. */
    data: text('data').notNull(),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
  },
  table => [index('tool_images_thread_id_idx').on(table.threadId)],
);

export type SandboxRow = typeof sandboxes.$inferSelect;
export type ToolImageRow = typeof toolImages.$inferSelect;
