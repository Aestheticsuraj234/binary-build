import {z} from 'zod';

import type {ChatMessage} from './api-types';
import type {RoutineRun} from './routines';
import type {ToolCallRecord, ToolRisk} from './tools';

/**
 * How freely a character may use its tools.
 *
 * - `plan_only`: no tools at all. It plans and explains.
 * - `ask_first`: every tool asks first, even reads.
 * - `auto_reads`: reads run; anything that changes things asks.
 * - `accept_edits`: reads and writes run; only `computer` tools ask.
 */
export const APPROVAL_MODES = [
  'plan_only',
  'ask_first',
  'auto_reads',
  'accept_edits',
] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** New characters start here. */
export const DEFAULT_APPROVAL_MODE: ApprovalMode = 'auto_reads';

export const approvalModeSchema = z.enum(APPROVAL_MODES, {
  error: 'Choose how much this character may do without asking.',
});

/** How each mode is described when hiring or editing a character. */
export const APPROVAL_MODE_INFO: Record<
  ApprovalMode,
  {label: string; description: string}
> = {
  plan_only: {
    label: 'Plan only',
    description: "Uses no tools. It plans and explains, and doesn't act.",
  },
  ask_first: {
    label: 'Ask first',
    description: 'Asks before every tool, even ones that only look things up.',
  },
  auto_reads: {
    label: 'Auto-approve reads',
    description:
      'Looks things up on its own. Asks before changing anything outside Binary.',
  },
  accept_edits: {
    label: 'Accept edits',
    description:
      'Reads and changes things on its own. Asks only before using a computer.',
  },
};

/** What happens when a character wants a tool. */
export type ToolDecision = 'run' | 'ask' | 'never';

/**
 * The whole approval policy, in one table: an approval mode and a tool's
 * risk give run, ask or never.
 */
export const APPROVAL_POLICY: Record<
  ApprovalMode,
  Record<ToolRisk, ToolDecision>
> = {
  plan_only: {read: 'never', write: 'never', computer: 'never'},
  ask_first: {read: 'ask', write: 'ask', computer: 'ask'},
  auto_reads: {read: 'run', write: 'ask', computer: 'ask'},
  accept_edits: {read: 'run', write: 'run', computer: 'ask'},
};

/** Whether a tool of `risk` runs, asks first, or isn't offered at all. */
export function decideTool(mode: ApprovalMode, risk: ToolRisk): ToolDecision {
  return APPROVAL_POLICY[mode][risk];
}

/**
 * Where an approval request is up to. `pending` waits for the person;
 * approving moves it to `running`, then `done` or `failed`. Rejecting
 * makes it `rejected`. Each step happens once.
 */
export const APPROVAL_STATUSES = [
  'pending',
  'running',
  'done',
  'failed',
  'rejected',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** One request, as Today and the chat show it. */
export interface ApprovalSummary {
  id: string;
  status: ApprovalStatus;
  /** The name the model called the tool by, e.g. `shop_refund_order`. */
  toolName: string;
  risk: ToolRisk;
  /** Exactly what will run if it's approved. */
  input: unknown;
  agentId: string;
  agentName: string;
  /** The character that plays the agent (a `CharacterId`). */
  avatar: string;
  threadId: string;
  threadTitle: string | null;
  /** Set when a routine run asked, rather than a chat. */
  routineName: string | null;
  /** Set when it was asked in a room: open the room, not a chat. */
  room: {id: string; name: string} | null;
  /** Why it failed, safe to show. */
  error: string | null;
  /** ISO dates. */
  createdAt: string;
  decidedAt: string | null;
}

/** What approving or rejecting sends back, for the chat to show. */
export interface ApprovalDecided {
  approval: ApprovalSummary;
  /** The answer whose tool card changed. */
  messageId: string;
  /** The tool card as it is now: done, failed or rejected. */
  call: ToolCallRecord;
  /** "You approved shop refund order." */
  note: ChatMessage;
  /** The character's follow-up, or null if it couldn't answer. */
  reply: ChatMessage | null;
  /** Why there's no follow-up, safe to show. */
  replyError: string | null;
}

/** A recent routine run, for Today. */
export interface TodayRun extends RoutineRun {
  routineId: string;
  routineName: string;
  avatar: string;
}

/** The Today inbox. */
export interface TodayOverview {
  /** Requests waiting for the person, newest first. */
  waiting: ApprovalSummary[];
  /** Routine runs from the last 24 hours, newest first. */
  recentRuns: TodayRun[];
}

/** "shop_refund_order" reads as "shop refund order". */
export function readableToolName(name: string): string {
  return name.replace(/[_-]+/g, ' ').trim();
}
