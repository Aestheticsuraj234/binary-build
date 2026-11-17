import {pgTable, text, timestamp, uniqueIndex} from 'drizzle-orm/pg-core';

import {user} from './auth';

/**
 * Each person's own AI provider keys, one row per provider.
 *
 * `encryptedKey` is AES-256-GCM ciphertext made by the API's key vault. The
 * plain key is never stored. `last4` is kept so the API keys page can show
 * which key is saved without decrypting anything.
 */
export const providerKeys = pgTable(
  'provider_keys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    provider: text('provider', {
      enum: ['openai', 'anthropic', 'google'],
    }).notNull(),
    encryptedKey: text('encrypted_key').notNull(),
    last4: text('last4').notNull(),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true})
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('provider_keys_user_provider_idx').on(
      table.userId,
      table.provider,
    ),
  ],
);

export type ProviderKeyRow = typeof providerKeys.$inferSelect;
