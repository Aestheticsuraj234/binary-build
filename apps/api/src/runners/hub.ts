import {randomUUID} from 'node:crypto';

import type {
  RunnerEvent,
  RunnerJob,
  RunnerJobEnvelope,
  RunnerResult,
} from '@binary/shared';

interface Pending {
  id: string;
  runnerId: string;
  job: RunnerJob;
  done: (result: RunnerResult) => void;
  onEvent?: (event: RunnerEvent) => void;
  timer: NodeJS.Timeout;
  picked: boolean;
  /** How long it may run once picked up. */
  runMs: number;
}

export interface SubmitOptions {
  /** Live events while it runs (an engine job's text and tool calls). */
  onEvent?: (event: RunnerEvent) => void;
  /** How long the Runner has to pick it up. */
  pickupMs?: number;
  /** How long it may run once picked up. */
  runMs?: number;
}

const NOT_PICKED_UP =
  "Your computer didn't pick this up. Is the Runner running? Start it with `pnpm runner start`.";

/**
 * Jobs for Runners, in this API's memory. The Runner long-polls `next()`
 * for work and reports back with `event()` and `finish()`; the API never
 * connects to it. Restarting the API drops jobs in flight.
 */
export class RunnerHub {
  private readonly queues = new Map<string, Pending[]>();
  private readonly waiters = new Map<
    string,
    Array<(job: RunnerJobEnvelope | null) => void>
  >();
  private readonly jobs = new Map<string, Pending>();

  /** Hands a job to a Runner and waits for its result (never throws). */
  submit(
    runnerId: string,
    job: RunnerJob,
    {onEvent, pickupMs = 15_000, runMs = 120_000}: SubmitOptions = {},
  ): Promise<RunnerResult> {
    return new Promise(resolve => {
      const pending: Pending = {
        id: randomUUID(),
        runnerId,
        job,
        onEvent,
        picked: false,
        runMs,
        done: result => {
          clearTimeout(pending.timer);
          this.jobs.delete(pending.id);
          this.unqueue(pending);
          resolve(result);
        },
        timer: setTimeout(
          () => pending.done({ok: false, error: NOT_PICKED_UP}),
          pickupMs,
        ),
      };
      pending.timer.unref();
      this.jobs.set(pending.id, pending);
      // A long poll may be waiting already: hand it over at once.
      const waiter = this.waiters.get(runnerId)?.shift();
      if (waiter) {
        this.pick(pending);
        waiter({id: pending.id, job});
        return;
      }
      const queue = this.queues.get(runnerId) ?? [];
      queue.push(pending);
      this.queues.set(runnerId, queue);
    });
  }

  private pick(pending: Pending) {
    pending.picked = true;
    clearTimeout(pending.timer);
    pending.timer = setTimeout(
      () =>
        pending.done({
          ok: false,
          error:
            'Your computer took too long to finish this, so it was stopped.',
        }),
      pending.runMs,
    );
    pending.timer.unref();
  }

  private unqueue(pending: Pending) {
    const queue = this.queues.get(pending.runnerId);
    if (queue) {
      this.queues.set(
        pending.runnerId,
        queue.filter(other => other !== pending),
      );
    }
  }

  /** The Runner's long poll: the next job, or null after `waitMs`. */
  next(runnerId: string, waitMs: number): Promise<RunnerJobEnvelope | null> {
    const queued = this.queues.get(runnerId)?.shift();
    if (queued) {
      this.pick(queued);
      return Promise.resolve({id: queued.id, job: queued.job});
    }
    return new Promise(resolve => {
      const waiters = this.waiters.get(runnerId) ?? [];
      const waiter = (job: RunnerJobEnvelope | null) => {
        clearTimeout(timer);
        resolve(job);
      };
      const timer = setTimeout(() => {
        this.waiters.set(
          runnerId,
          (this.waiters.get(runnerId) ?? []).filter(other => other !== waiter),
        );
        resolve(null);
      }, waitMs);
      timer.unref();
      waiters.push(waiter);
      this.waiters.set(runnerId, waiters);
    });
  }

  /** A job this Runner was given, or undefined. */
  private ownJob(runnerId: string, jobId: string): Pending | undefined {
    const pending = this.jobs.get(jobId);
    return pending?.runnerId === runnerId && pending.picked
      ? pending
      : undefined;
  }

  /** Live events from a job. False if it isn't this Runner's job. */
  event(runnerId: string, jobId: string, events: RunnerEvent[]): boolean {
    const pending = this.ownJob(runnerId, jobId);
    if (!pending) {
      return false;
    }
    for (const event of events) {
      pending.onEvent?.(event);
    }
    return true;
  }

  /** A job's result. False if it isn't this Runner's job (or it timed out). */
  finish(runnerId: string, jobId: string, result: RunnerResult): boolean {
    const pending = this.ownJob(runnerId, jobId);
    if (!pending) {
      return false;
    }
    pending.done(result);
    return true;
  }

  /** Fails everything for a Runner (paused or removed), and ends its polls. */
  cancelAll(runnerId: string, reason: string): void {
    for (const pending of [...this.jobs.values()]) {
      if (pending.runnerId === runnerId) {
        pending.done({ok: false, error: reason});
      }
    }
    for (const waiter of this.waiters.get(runnerId) ?? []) {
      waiter(null);
    }
    this.waiters.delete(runnerId);
  }
}
