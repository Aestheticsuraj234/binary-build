import type {Database} from '@binary/db';
import {RoutineRunRepository} from '@binary/db';

import type {RoutineExecutor} from '../routines/run-routine';

/** A routine's schedule, as the job runner keeps it. */
export interface Schedule {
  routineId: string;
  /** Five-field cron, read in `timeZone`. */
  cron: string;
  /** IANA name, canonical (see `canonicalTimeZone`). */
  timeZone: string;
}

/** Where a schedule ended up. */
export interface SavedSchedule {
  scheduleId: string;
  /**
   * Minutes the runner may start a run after its cron time. Trigger.dev's
   * Free plan forces 60. Null: it starts on time.
   */
  windowMinutes: number | null;
}

/**
 * Where routine runs happen. The API only says "run this" or "keep this
 * schedule"; behind this interface it's either Trigger.dev (durable, with
 * real schedules) or the API's own process (no schedules).
 */
export interface JobRunner {
  /** Shown in logs and on the page. */
  readonly name: 'trigger.dev' | 'in-process';
  /** False when schedules are saved but nothing will fire them. */
  readonly schedulesEnabled: boolean;
  /** Starts a queued run, now or soon. */
  enqueue(runId: string): Promise<void>;
  /** Creates or updates a routine's schedule. */
  saveSchedule(schedule: Schedule): Promise<SavedSchedule>;
  removeSchedule(scheduleId: string): Promise<void>;
}

/**
 * Runs routines inside the API, right after they're queued. Used when
 * Trigger.dev isn't set up, and in tests. Run now and webhooks work, but
 * schedules never fire, and a run only survives an API restart because
 * `recover` picks unfinished runs up again on start.
 */
export class InProcessRunner implements JobRunner {
  readonly name = 'in-process';
  readonly schedulesEnabled = false;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly runs: RoutineRunRepository;

  constructor(
    db: Database,
    private readonly execute: RoutineExecutor,
  ) {
    this.runs = new RoutineRunRepository(db);
  }

  async enqueue(runId: string, {reclaim = false} = {}): Promise<void> {
    // Not awaited: the request answers "queued" at once, like a real queue.
    const running = this.execute(runId, {reclaim})
      .catch(async (error: unknown) => {
        // Nothing here retries, so an unexpected error ends the run.
        console.error(`[routines] run ${runId} failed:`, error);
        await this.runs
          .fail(runId, 'Something went wrong on our side.')
          .catch(() => {});
      })
      .finally(() => this.pending.delete(running));
    this.pending.add(running);
  }

  /**
   * Picks up runs that were queued or running when the API stopped. A
   * running run has no saved answer yet, so it's safe to run it again.
   */
  async recover(): Promise<number> {
    const unfinished = await this.runs.listUnfinished();
    for (const run of unfinished) {
      await this.enqueue(run.id, {reclaim: true});
    }
    return unfinished.length;
  }

  async saveSchedule(): Promise<SavedSchedule> {
    throw new Error('Schedules need Trigger.dev.');
  }

  async removeSchedule(): Promise<void> {}

  /** Resolves once every run started so far has finished (for tests). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }
}
