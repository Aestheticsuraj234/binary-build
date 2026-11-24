import {ApiError, configure, schedules, tasks} from '@trigger.dev/sdk';

import {InvalidInputError, JobsUnavailableError} from '../errors';
import type {routineScheduleTask, runRoutineTask} from '../trigger/routines';
import type {JobRunner, SavedSchedule, Schedule} from './job-runner';

/** The two tasks in `src/trigger/routines.ts`. */
export const RUN_ROUTINE_TASK: (typeof runRoutineTask)['id'] = 'run-routine';
export const ROUTINE_SCHEDULE_TASK: (typeof routineScheduleTask)['id'] =
  'routine-schedule';

/** How long a queued run waits for a worker before Trigger.dev drops it. */
const QUEUE_TTL = '1h';

/**
 * A Trigger.dev 4xx (for example, the Free plan refusing a schedule that
 * fires more than once an hour) becomes a form error people can fix;
 * anything else means Trigger.dev couldn't be reached.
 */
function translate(error: unknown, what: string): Error {
  if (error instanceof ApiError && error.status !== undefined) {
    if (error.status >= 400 && error.status < 500 && error.status !== 401) {
      const message = `Trigger.dev refused the schedule: ${error.message}`;
      return new InvalidInputError(message, {cron: message});
    }
  }
  console.error(`[trigger.dev] ${what} failed:`, error);
  return new JobsUnavailableError(
    error instanceof ApiError && error.status === 401
      ? 'Trigger.dev refused the secret key. Check TRIGGER_SECRET_KEY in .env.'
      : "Couldn't reach Trigger.dev. Try again in a moment.",
  );
}

/**
 * Runs routines on Trigger.dev: durable (a run survives the API
 * restarting), retried by Trigger.dev, visible in its dashboard, and fired
 * by real cron schedules in the person's time zone.
 */
export class TriggerDevRunner implements JobRunner {
  readonly name = 'trigger.dev';
  readonly schedulesEnabled = true;

  constructor(secretKey: string) {
    configure({secretKey});
  }

  async enqueue(runId: string): Promise<void> {
    try {
      // The run id as idempotency key: enqueueing the same run twice (a
      // retried request) still makes one Trigger.dev run.
      await tasks.trigger<typeof runRoutineTask>(
        RUN_ROUTINE_TASK,
        {runId},
        {idempotencyKey: `routine-run-${runId}`, ttl: QUEUE_TTL},
      );
    } catch (error) {
      throw translate(error, 'queueing a run');
    }
  }

  /**
   * Creates the schedule, or updates it: Trigger.dev keeps one schedule per
   * deduplication key, and ours is the routine's id.
   */
  async saveSchedule({
    routineId,
    cron,
    timeZone,
  }: Schedule): Promise<SavedSchedule> {
    try {
      const saved = await schedules.create({
        task: ROUTINE_SCHEDULE_TASK,
        cron,
        timezone: timeZone,
        externalId: routineId,
        deduplicationKey: `routine-${routineId}`,
        // "9:00" means 9:00, not "some time in the next hour". The Free plan
        // overrides this with 60 minutes, and says so below.
        window: '0m',
      });
      const windowSeconds =
        saved.appliedSchedulePolicy?.minimumWindowSeconds ?? 0;
      return {
        scheduleId: saved.id,
        windowMinutes:
          windowSeconds > 0 ? Math.round(windowSeconds / 60) : null,
      };
    } catch (error) {
      throw translate(error, 'saving a schedule');
    }
  }

  async removeSchedule(scheduleId: string): Promise<void> {
    try {
      await schedules.del(scheduleId);
    } catch (error) {
      // Already gone is what we wanted.
      if (error instanceof ApiError && error.status === 404) {
        return;
      }
      throw translate(error, 'removing a schedule');
    }
  }
}
