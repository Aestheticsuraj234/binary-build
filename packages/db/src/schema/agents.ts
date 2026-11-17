import {index, pgTable, text, timestamp, uuid} from 'drizzle-orm/pg-core';

import {user} from './auth';

/** A ready-made starting point for a new agent, e.g. "Research Assistant". */
export const agentTemplates = pgTable('agent_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  instructions: text('instructions').notNull(),
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
