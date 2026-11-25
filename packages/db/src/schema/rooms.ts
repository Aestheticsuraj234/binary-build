import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import {agents} from './agents';
import {user} from './auth';

/**
 * A group chat with a small team of one person's characters. Its one
 * conversation is a `threads` row with `roomId` set.
 */
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    name: text('name').notNull(),
    /**
     * Who answers a message: the ones you @mention (or the lead), or the
     * ones the lead's model picks (an @mention still wins).
     */
    mode: text('mode', {enum: ['mention', 'auto']})
      .notNull()
      .default('mention'),
    /** Answers when nobody is mentioned, and routes in automatic mode. */
    leadAgentId: uuid('lead_agent_id')
      .notNull()
      .references(() => agents.id, {onDelete: 'cascade'}),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true})
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [index('rooms_user_id_idx').on(table.userId)],
);

/** One character in a room, in the order the room lists them. */
export const roomMembers = pgTable(
  'room_members',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, {onDelete: 'cascade'}),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, {onDelete: 'cascade'}),
    position: integer('position').notNull(),
  },
  table => [
    primaryKey({columns: [table.roomId, table.agentId]}),
    index('room_members_agent_id_idx').on(table.agentId),
  ],
);

export type RoomRow = typeof rooms.$inferSelect;
export type RoomMemberRow = typeof roomMembers.$inferSelect;
