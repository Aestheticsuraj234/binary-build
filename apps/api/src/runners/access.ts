import type {Database, RunnerRow} from '@binary/db';
import {RunnerRepository} from '@binary/db';
import type {RunnerJob, RunnerResult, RunnerSummary} from '@binary/shared';

import type {RunnerHub, SubmitOptions} from './hub';

/** A Runner counts as online if it asked for work this recently. */
export const ONLINE_MS = 45_000;

export function runnerStatus(
  row: RunnerRow,
  now = Date.now(),
): RunnerSummary['status'] {
  if (!row.tokenHash) {
    return 'pairing';
  }
  if (row.pausedAt) {
    return 'paused';
  }
  return row.lastSeenAt && now - row.lastSeenAt.getTime() < ONLINE_MS
    ? 'online'
    : 'offline';
}

export function toRunnerSummary(row: RunnerRow): RunnerSummary {
  return {
    id: row.id,
    name: row.name,
    os: row.os,
    folders: row.folders,
    status: runnerStatus(row),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Sends jobs to a person's Runner, after checking it's theirs, paired, not
 * paused and online. Failures come back as a result with a reason that's
 * safe to show; nothing throws.
 */
export class RunnerAccess {
  private readonly runners: RunnerRepository;

  constructor(
    db: Database,
    readonly hub: RunnerHub,
    /** Set where Runners can't be reached at all (the routine worker). */
    private readonly unreachable?: string,
  ) {
    this.runners = new RunnerRepository(db);
  }

  async run(
    userId: string,
    runnerId: string,
    job: RunnerJob,
    options?: SubmitOptions,
  ): Promise<RunnerResult> {
    if (this.unreachable) {
      return {ok: false, error: this.unreachable};
    }
    const runner = await this.runners.findForUser(runnerId, userId);
    if (!runner) {
      return {ok: false, error: "That computer isn't paired anymore."};
    }
    const status = runnerStatus(runner);
    if (status === 'paused') {
      return {
        ok: false,
        error: `${runner.name} is paused, so nothing ran. Resume it on Your computers.`,
      };
    }
    if (status !== 'online') {
      return {
        ok: false,
        error: `${runner.name} is offline. Start the Runner there with \`pnpm runner start\`.`,
      };
    }
    return this.hub.submit(runner.id, job, options);
  }
}
