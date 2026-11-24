import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import {agents} from './agents';
import {user} from './auth';
import {messages, threads} from './chats';
import {routineRuns} from './routines';

/**
 * Exactly which tool a request is for. The name the model saw isn't
 * enough: app tool names are made unique per answer, so the same name
 * could point at another tool later. Approving finds the tool by this.
 */
export type ToolSource =
  | {kind: 'built-in'; name: string}
  /** An MCP app's tool, by the app's id and the tool's own name. */
  | {kind: 'app'; appId: string; tool: string}
  /** A Composio tool, by its slug (e.g. GMAIL_SEND_EMAIL). */
  | {kind: 'composio'; slug: string}
  /** A cloud sandbox tool, run in the request's chat's sandbox. */
  | {kind: 'sandbox'; tool: string}
  /** A browser tool, run in the request's chat's browser. */
  | {kind: 'browser'; tool: string};

/**
 * A tool call waiting for the person's OK. It's a row, not a waiting
 * process: asking ends the answer, and approving (seconds or days later)
 * runs the saved call and lets the character carry on.
 */
export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, {onDelete: 'cascade'}),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, {onDelete: 'cascade'}),
    /** The answer whose tool card asks. */
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, {onDelete: 'cascade'}),
    /** Set when a routine run asked. */
    routineRunId: uuid('routine_run_id').references(() => routineRuns.id, {
      onDelete: 'set null',
    }),
    /** The call's id inside the answer's tool cards. */
    toolCallId: text('tool_call_id').notNull(),
    /** The name the model called it by. */
    toolName: text('tool_name').notNull(),
    toolSource: jsonb('tool_source').$type<ToolSource>().notNull(),
    risk: text('risk', {enum: ['read', 'write', 'computer']}).notNull(),
    /** Exactly what runs if it's approved. */
    input: jsonb('input').$type<unknown>().notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'done', 'failed', 'rejected'],
    })
      .notNull()
      .default('pending'),
    output: jsonb('output').$type<unknown>(),
    /** Why it failed, safe to show. */
    error: text('error'),
    createdAt: timestamp('created_at', {withTimezone: true})
      .defaultNow()
      .notNull(),
    decidedAt: timestamp('decided_at', {withTimezone: true}),
    finishedAt: timestamp('finished_at', {withTimezone: true}),
  },
  table => [
    index('approval_requests_user_id_status_idx').on(
      table.userId,
      table.status,
      table.createdAt.desc(),
    ),
  ],
);

export type ApprovalRow = typeof approvalRequests.$inferSelect;
export type NewApprovalRow = typeof approvalRequests.$inferInsert;

/** A request as an answer collects it, before the answer is saved. */
export type PendingApproval = Omit<
  NewApprovalRow,
  'threadId' | 'messageId' | 'status'
> & {id: string};
