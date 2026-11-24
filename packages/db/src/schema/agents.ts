import {sql} from 'drizzle-orm';
import {index, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';

import {user} from './auth';

/** A ready-made starting point for a new agent, e.g. "Research Assistant". */
export const agentTemplates = pgTable('agent_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  instructions: text('instructions').notNull(),
  /** The computers characters hired from it start with. */
  computers: text('computers', {enum: ['cloud_sandbox', 'browser']})
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', {withTimezone: true})
    .defaultNow()
    .notNull(),
});

/**
 * An AI coworker owned by one person. Hiring from a template copies the
 * template's text into here, so editing the agent never changes the template.
 */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    templateId: uuid('template_id').references(() => agentTemplates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    /** The character that plays this agent, e.g. "nova". */
    avatar: text('avatar'),
    role: text('role').notNull(),
    instructions: text('instructions').notNull().default(''),
    provider: text('provider', {enum: ['openai', 'anthropic', 'google']}),
    model: text('model'),
    /**
     * How freely it may use tools (see `APPROVAL_POLICY` in
     * @binary/shared). Characters hired before approvals get the same.
     */
    approvalMode: text('approval_mode', {
      enum: ['plan_only', 'ask_first', 'auto_reads', 'accept_edits'],
    })
      .notNull()
      .default('auto_reads'),
    /** Its computers: a cloud sandbox and/or a browser, one per chat. */
    computers: text('computers', {enum: ['cloud_sandbox', 'browser']})
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * Set when the agent is fired. A fired agent leaves the crew, but its
     * chats can still be read, so the row stays.
     */
    firedAt: timestamp('fired_at', {withTimezone: true}),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true})
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [index('agents_user_id_idx').on(table.userId)],
);

export type AgentRow = typeof agents.$inferSelect;
export type NewAgentRow = typeof agents.$inferInsert;
export type AgentTemplateRow = typeof agentTemplates.$inferSelect;
