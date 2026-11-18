import {primaryKey, pgTable, text, timestamp} from 'drizzle-orm/pg-core';

import {user} from './auth';

/**
 * Composio toolkits that need no account (like Hacker News), switched on by
 * one person. Toolkits with an account are tracked by Composio itself.
 */
export const enabledToolkits = pgTable(
  'enabled_toolkits',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
  },
  table => [primaryKey({columns: [table.userId, table.slug]})],
);
