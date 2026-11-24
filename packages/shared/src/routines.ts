import {z} from 'zod';

export const ROUTINE_NAME_MAX_LENGTH = 60;
export const ROUTINE_INSTRUCTIONS_MAX_LENGTH = 4000;
/** The biggest webhook body a routine accepts, in bytes. */
export const WEBHOOK_BODY_MAX_BYTES = 32 * 1024;

/** Where a run is up to. */
export const RUN_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** What started a run. */
export const RUN_SOURCES = ['manual', 'schedule', 'webhook'] as const;
export type RunSource = (typeof RUN_SOURCES)[number];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

export const RUN_SOURCE_LABELS: Record<RunSource, string> = {
  manual: 'Run now',
  schedule: 'Schedule',
  webhook: 'Webhook',
};

/** Messages for the routine form. */
export const ROUTINE_MESSAGES = {
  nameRequired: 'Give the routine a name.',
  nameTooLong: `Keep the name under ${ROUTINE_NAME_MAX_LENGTH} characters.`,
  agentRequired: 'Choose who runs it.',
  instructionsRequired: 'Say what to do on each run.',
  instructionsTooLong: `Keep it under ${ROUTINE_INSTRUCTIONS_MAX_LENGTH} characters.`,
  cronInvalid:
    'That isn\'t a schedule we understand. Use five cron fields, like "0 9 * * 1-5".',
  timeInvalid: 'Use a time like 9:00 or 17:30.',
  timeZoneInvalid: "That isn't a time zone we know.",
} as const;

// ---------------------------------------------------------------------------
// Cron

/** Allowed numbers for each of the five cron fields. */
const CRON_FIELDS = [
  {name: 'minute', min: 0, max: 59},
  {name: 'hour', min: 0, max: 23},
  {name: 'day of month', min: 1, max: 31},
  {name: 'month', min: 1, max: 12},
  {name: 'day of week', min: 0, max: 7},
] as const;

/** One comma-separated part of a cron field: `*`, `5`, `1-5`, `*\/2`, `3-9/2`. */
const CRON_PART = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/;

function isValidCronPart(
  part: string,
  {min, max}: {min: number; max: number},
  index: number,
): boolean {
  // "L" (last day of the month, or the last Monday as "1L").
  if (index === 2 && part === 'L') {
    return true;
  }
  if (index === 4 && /^[0-7]L$/.test(part)) {
    return true;
  }
  const match = CRON_PART.exec(part);
  if (!match) {
    return false;
  }
  const [, , from, to, step] = match;
  const inRange = (value: string | undefined) =>
    value === undefined || (Number(value) >= min && Number(value) <= max);
  if (!inRange(from) || !inRange(to)) {
    return false;
  }
  if (from !== undefined && to !== undefined && Number(from) > Number(to)) {
    return false;
  }
  return step === undefined || Number(step) >= 1;
}

/**
 * Whether `cron` is a five-field cron expression (no seconds), the syntax
 * Trigger.dev schedules use.
 */
export function isValidCron(cron: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== CRON_FIELDS.length) {
    return false;
  }
  return fields.every((field, index) =>
    field
      .split(',')
      .every(part => isValidCronPart(part, CRON_FIELDS[index]!, index)),
  );
}

// ---------------------------------------------------------------------------
// Schedule presets: what the form offers, turned into cron and back.

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** The schedule choices the form offers. */
export type SchedulePreset =
  | {kind: 'none'}
  | {kind: 'hourly'; minute: number}
  | {kind: 'daily'; time: string}
  | {kind: 'weekdays'; time: string}
  | {kind: 'weekly'; weekday: number; time: string}
  | {kind: 'custom'; cron: string};

export type ScheduleKind = SchedulePreset['kind'];

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  none: 'No schedule',
  hourly: 'Every hour',
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Once a week',
  custom: 'Custom (cron)',
};

/** "9:00" or "09:00" → [9, 0], or null if it isn't a time of day. */
export function parseTime(time: string): [number, number] | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? [hour, minute] : null;
}

/** [9, 5] → "9:05". */
export function formatTime(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/**
 * The cron expression for a preset, or null for "No schedule". Throws if a
 * time isn't valid; check with `parseTime` first.
 */
export function presetToCron(preset: SchedulePreset): string | null {
  const at = (time: string) => {
    const parsed = parseTime(time);
    if (!parsed) {
      throw new Error(ROUTINE_MESSAGES.timeInvalid);
    }
    return `${parsed[1]} ${parsed[0]}`;
  };
  switch (preset.kind) {
    case 'none':
      return null;
    case 'hourly':
      return `${preset.minute} * * * *`;
    case 'daily':
      return `${at(preset.time)} * * *`;
    case 'weekdays':
      return `${at(preset.time)} * * 1-5`;
    case 'weekly':
      return `${at(preset.time)} * * ${preset.weekday}`;
    case 'custom':
      return preset.cron.trim();
  }
}

/** Reads a cron expression back into the preset the form shows. */
export function cronToPreset(cron: string | null): SchedulePreset {
  if (cron === null) {
    return {kind: 'none'};
  }
  const fields = cron.trim().split(/\s+/);
  const number = (value: string | undefined, max: number) =>
    value !== undefined && /^\d+$/.test(value) && Number(value) <= max
      ? Number(value)
      : null;
  if (fields.length === 5) {
    const [minuteField, hourField, dom, month, dow] = fields;
    const minute = number(minuteField, 59);
    const hour = number(hourField, 23);
    if (minute !== null && dom === '*' && month === '*') {
      if (hourField === '*' && dow === '*') {
        return {kind: 'hourly', minute};
      }
      if (hour !== null) {
        const time = formatTime(hour, minute);
        if (dow === '*') {
          return {kind: 'daily', time};
        }
        if (dow === '1-5') {
          return {kind: 'weekdays', time};
        }
        const weekday = number(dow, 7);
        if (weekday !== null) {
          return {kind: 'weekly', weekday: weekday % 7, time};
        }
      }
    }
  }
  return {kind: 'custom', cron: cron.trim()};
}

/** "Weekdays at 9:00", "Mondays at 8:30", "Every hour at :15"… */
export function describeSchedule(cron: string | null): string {
  const preset = cronToPreset(cron);
  switch (preset.kind) {
    case 'none':
      return 'No schedule';
    case 'hourly':
      return `Every hour at :${String(preset.minute).padStart(2, '0')}`;
    case 'daily':
      return `Every day at ${preset.time}`;
    case 'weekdays':
      return `Weekdays at ${preset.time}`;
    case 'weekly':
      return `${WEEKDAY_NAMES[preset.weekday]}s at ${preset.time}`;
    case 'custom':
      return `Cron: ${preset.cron}`;
  }
}

// ---------------------------------------------------------------------------
// Time zones

/** Whether `timeZone` is an IANA time zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en', {timeZone});
    return true;
  } catch {
    return false;
  }
}

/** The device's own time zone, or UTC when it can't tell. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ---------------------------------------------------------------------------
// Request bodies

/** Everything a person sets when creating or editing a routine. */
export const routineInputSchema = z.object({
  name: z
    .string({error: ROUTINE_MESSAGES.nameRequired})
    .trim()
    .min(1, ROUTINE_MESSAGES.nameRequired)
    .max(ROUTINE_NAME_MAX_LENGTH, ROUTINE_MESSAGES.nameTooLong),
  agentId: z.uuid({error: ROUTINE_MESSAGES.agentRequired}),
  instructions: z
    .string({error: ROUTINE_MESSAGES.instructionsRequired})
    .trim()
    .min(1, ROUTINE_MESSAGES.instructionsRequired)
    .max(ROUTINE_INSTRUCTIONS_MAX_LENGTH, ROUTINE_MESSAGES.instructionsTooLong),
  /** Five-field cron, read in the person's time zone. Null: no schedule. */
  cron: z
    .string()
    .trim()
    .nullable()
    .refine(cron => cron === null || isValidCron(cron), {
      message: ROUTINE_MESSAGES.cronInvalid,
    }),
  /** Whether a webhook can start it. */
  webhook: z.boolean(),
  /** Off: the schedule and webhook do nothing. Run now still works. */
  enabled: z.boolean(),
});

export type RoutineInput = z.infer<typeof routineInputSchema>;

export const timeZoneInputSchema = z.object({
  timeZone: z
    .string({error: ROUTINE_MESSAGES.timeZoneInvalid})
    .trim()
    .refine(isValidTimeZone, {message: ROUTINE_MESSAGES.timeZoneInvalid}),
});

// ---------------------------------------------------------------------------
// What the API sends back

/** One run of a routine. */
export interface RoutineRun {
  id: string;
  source: RunSource;
  status: RunStatus;
  /** The transcript chat, once the run has started one. */
  threadId: string | null;
  /** Why it failed, safe to show. */
  error: string | null;
  /** ISO dates. */
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** A routine as lists and forms show it. */
export interface RoutineSummary {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  /** The character that plays the agent (a `CharacterId`). */
  avatar: string;
  instructions: string;
  cron: string | null;
  webhook: boolean;
  enabled: boolean;
  /**
   * Set when Trigger.dev spreads the run over a window after its cron time
   * (the Free plan uses 60 minutes). Null: it starts on time.
   */
  scheduleWindowMinutes: number | null;
  lastRun: RoutineRun | null;
}

/** The Routines page. */
export interface RoutinesOverview {
  routines: RoutineSummary[];
  /** False without Trigger.dev: schedules are saved but never fire. */
  schedulesEnabled: boolean;
  /** The person's time zone, or null until it's been set. */
  timeZone: string | null;
}

/** One routine with its run history. */
export interface RoutineDetail {
  routine: RoutineSummary;
  runs: RoutineRun[];
  schedulesEnabled: boolean;
  timeZone: string | null;
  /** Where to send webhooks, when the webhook is on. */
  webhookUrl: string | null;
}

/** After saving: the routine, plus a new webhook secret shown only now. */
export interface RoutineSaved {
  routine: RoutineSummary;
  webhookSecret: string | null;
}

/** How long a run took, like "2.4s" or "1m 05s", or null if it hasn't ended. */
export function runDuration(run: RoutineRun): string | null {
  if (!run.startedAt || !run.finishedAt) {
    return null;
  }
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
