import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {agents} from './agents';
import {user} from './auth';
import {threads} from './chats';

/** One person's preferences. For now, the time zone their schedules use. */
export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, {onDelete: 'cascade'}),
  /** An IANA name, like "Asia/Calcutta". "9:00" in a schedule means 9:00 here. */
  timeZone: text('time_zone').notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true})
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * A job one agent does again and again: on a schedule, when a webhook
 * calls, or when the person presses Run now.
 */
export const routines = pgTable(
  'routines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, {onDelete: 'cascade'}),
    name: text('name').notNull(),
    /** What to do on each run. It becomes the run's first message. */
    instructions: text('instructions').notNull(),
    /** Five-field cron in the person's time zone, or null for no schedule. */
    cron: text('cron'),
    /** Off: the schedule and the webhook do nothing. Run now still works. */
    enabled: boolean('enabled').notNull().default(true),
    /**
     * SHA-256 of the webhook secret, or null when the webhook is off. The
     * secret itself is shown once and never stored.
     */
    webhookSecretHash: text('webhook_secret_hash'),
    /** The Trigger.dev schedule that fires this routine, when there is one. */
    scheduleId: text('schedule_id'),
    /** Minutes Trigger.dev may spread a run after its cron time (Free plan). */
    scheduleWindowMinutes: integer('schedule_window_minutes'),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {withTimezone: true})
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [index('routines_user_id_idx').on(table.userId)],
);

/**
 * One run of a routine. It is claimed before it starts and finished in the
 * same transaction that saves the answer, so a run answers at most once,
 * however many times its job is delivered.
 */
export const routineRuns = pgTable(
  'routine_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, {onDelete: 'cascade'}),
    source: text('source', {
      enum: ['manual', 'schedule', 'webhook'],
    }).notNull(),
    status: text('status', {enum: ['queued', 'running', 'done', 'failed']})
      .notNull()
      .default('queued'),
    /** The transcript chat, once the run has started one. */
    threadId: uuid('thread_id').references(() => threads.id, {
      onDelete: 'set null',
    }),
    /** The webhook's body, kept as plain text. Someone else's words. */
    payload: text('payload'),
    /**
     * Stops one event from making two runs: the schedule time for scheduled
     * runs, or the webhook's Idempotency-Key header.
     */
    dedupeKey: text('dedupe_key'),
    /** Goes up each time a worker claims the run; only that worker may finish it. */
    attempt: integer('attempt').notNull().default(0),
    /** Why it failed, safe to show. */
    error: text('error'),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', {withTimezone: true}),
    finishedAt: timestamp('finished_at', {withTimezone: true}),
  },
  table => [
    index('routine_runs_routine_id_created_at_idx').on(
      table.routineId,
      table.createdAt.desc(),
    ),
    uniqueIndex('routine_runs_routine_id_dedupe_key_idx').on(
      table.routineId,
      table.dedupeKey,
    ),
    index('routine_runs_status_idx').on(table.status),
  ],
);

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type RoutineRow = typeof routines.$inferSelect;
export type NewRoutineRow = typeof routines.$inferInsert;
export type RoutineRunRow = typeof routineRuns.$inferSelect;
