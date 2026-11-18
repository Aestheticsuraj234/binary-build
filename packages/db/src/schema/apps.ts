import {pgTable, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';

import {user} from './auth';

/**
 * An MCP server someone connected, like Gmail through Composio. Its tools
 * become available to every one of their agents.
 *
 * `encryptedAuthorization` is the Authorization header, encrypted by the
 * API's vault like the provider keys. It is never sent back to the apps.
 */
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    name: text('name').notNull(),
    url: text('url').notNull(),
    encryptedAuthorization: text('encrypted_authorization'),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
  },
  table => [uniqueIndex('apps_user_id_name_idx').on(table.userId, table.name)],
);

export type AppRow = typeof apps.$inferSelect;
