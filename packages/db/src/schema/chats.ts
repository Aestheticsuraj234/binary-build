import {sql} from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {agents} from './agents';
import {user} from './auth';
import {rooms} from './rooms';

/**
 * One conversation with one agent, or a room's conversation (`roomId` set,
 * `agentId` its lead).
 */
export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, {onDelete: 'cascade'}),
    /** Set for a room's one conversation. Deleting the room deletes it. */
    roomId: uuid('room_id').references(() => rooms.id, {onDelete: 'cascade'}),
    /** Named after the first message; null until there is one. */
    title: text('title'),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    /** Moves forward with every message, so Recent chats can sort by it. */
    updatedAt: timestamp('updated_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
  },
  table => [
    index('threads_user_id_updated_at_idx').on(
      table.userId,
      table.updatedAt.desc(),
    ),
    uniqueIndex('threads_room_id_idx').on(table.roomId),
  ],
);

/**
 * One message in a thread: from the person, the agent, or a `note` from
 * Binary itself ("You approved shop refund order.").
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, {onDelete: 'cascade'}),
    role: text('role', {enum: ['user', 'assistant', 'note']}).notNull(),
    /**
     * Who wrote an answer (or a note about one) in a room. Null in a chat
     * with one agent, where it's always the thread's agent.
     */
    agentId: uuid('agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    /**
     * Tools the agent used while answering (a `ToolCallRecord[]`). A note
     * carries the one call it's about.
     */
    toolCalls: jsonb('tool_calls').$type<unknown[]>().default([]).notNull(),
    // The real clock, not the transaction start, so two messages saved in
    // one transaction still sort in the order they were written.
    createdAt: timestamp('created_at', {withTimezone: true})
      .default(sql`clock_timestamp()`)
      .notNull(),
  },
  table => [
    index('messages_thread_id_created_at_idx').on(
      table.threadId,
      table.createdAt,
    ),
  ],
);

export type ThreadRow = typeof threads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
