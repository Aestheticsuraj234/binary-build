import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {user} from './auth';

/**
 * A computer of yours, paired through the Runner. The Runner asks the API
 * for work with its token; the API never connects to it. Only hashes of
 * the token and the one-time pairing code are stored.
 */
export const runners = pgTable(
  'runners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    name: text('name').notNull(),
    /** SHA-256 of the one-time pairing code, until it's used. */
    pairingCodeHash: text('pairing_code_hash'),
    pairingExpiresAt: timestamp('pairing_expires_at', {withTimezone: true}),
    /** SHA-256 of the Runner's token, once it has paired. */
    tokenHash: text('token_hash'),
    /** Paused: it gets no work until resumed. */
    pausedAt: timestamp('paused_at', {withTimezone: true}),
    /** What it said when it last started. */
    os: text('os'),
    version: text('version'),
    folders: text('folders').array().notNull().default([]),
    lastSeenAt: timestamp('last_seen_at', {withTimezone: true}),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
  },
  table => [
    index('runners_user_id_idx').on(table.userId),
    uniqueIndex('runners_token_hash_idx').on(table.tokenHash),
    uniqueIndex('runners_pairing_code_hash_idx').on(table.pairingCodeHash),
  ],
);

export type RunnerRow = typeof runners.$inferSelect;
