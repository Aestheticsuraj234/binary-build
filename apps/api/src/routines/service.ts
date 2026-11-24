import type {
  Database,
  RoutineListItem,
  RoutineRow,
  RoutineRunRow,
} from '@binary/db';
import {
  RoutineRepository,
  RoutineRunRepository,
  UserSettingsRepository,
} from '@binary/db';
import type {RoutineRun, RoutineSummary, RunSource} from '@binary/shared';

import type {JobRunner} from '../jobs/job-runner';

export function toRoutineRun(row: RoutineRunRow): RoutineRun {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    threadId: row.threadId,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function toRoutineSummary({
  routine,
  agent,
  lastRun,
}: RoutineListItem): RoutineSummary {
  return {
    id: routine.id,
    name: routine.name,
    agentId: agent.id,
    agentName: agent.name,
    avatar: agent.avatar ?? 'pebble',
    instructions: routine.instructions,
    cron: routine.cron,
    webhook: routine.webhookSecretHash !== null,
    enabled: routine.enabled,
    scheduleWindowMinutes: routine.scheduleWindowMinutes,
    lastRun: lastRun ? toRoutineRun(lastRun) : null,
  };
}

/**
 * Starting runs and keeping schedules in step, for the routes and the
 * webhook. All of it goes through the job runner, so none of it knows
 * whether Trigger.dev is on.
 */
export class RoutineService {
  private readonly routines: RoutineRepository;
  private readonly runs: RoutineRunRepository;
  private readonly settings: UserSettingsRepository;

  constructor(
    db: Database,
    readonly jobs: JobRunner,
  ) {
    this.routines = new RoutineRepository(db);
    this.runs = new RoutineRunRepository(db);
    this.settings = new UserSettingsRepository(db);
  }

  /**
   * Queues a run and hands it to the job runner. With a `dedupeKey` used
   * before, the earlier run comes back and nothing new starts. If the
   * runner can't take it, the run is marked failed and the error thrown.
   */
  async startRun(
    routineId: string,
    source: RunSource,
    {payload, dedupeKey}: {payload?: string; dedupeKey?: string} = {},
  ): Promise<{run: RoutineRunRow; isNew: boolean}> {
    const created = await this.runs.create({
      routineId,
      source,
      payload,
      dedupeKey,
    });
    if (!created.isNew) {
      return created;
    }
    try {
      await this.jobs.enqueue(created.run.id);
    } catch (error) {
      await this.runs.fail(
        created.run.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
    return created;
  }

  /**
   * Makes the job runner's schedule match the routine: there while it's
   * switched on with a cron, gone otherwise. Without Trigger.dev, nothing
   * fires, so there is nothing to keep.
   */
  async syncSchedule(routine: RoutineRow): Promise<void> {
    if (!this.jobs.schedulesEnabled) {
      return;
    }
    if (routine.enabled && routine.cron) {
      const timeZone =
        (await this.settings.timeZoneOf(routine.userId)) ?? 'UTC';
      const saved = await this.jobs.saveSchedule({
        routineId: routine.id,
        cron: routine.cron,
        timeZone,
      });
      await this.routines.setSchedule(routine.id, {
        scheduleId: saved.scheduleId,
        scheduleWindowMinutes: saved.windowMinutes,
      });
    } else if (routine.scheduleId) {
      await this.jobs.removeSchedule(routine.scheduleId);
      await this.routines.setSchedule(routine.id, {
        scheduleId: null,
        scheduleWindowMinutes: null,
      });
    }
  }

  /** Removes a routine's schedule before the routine itself is deleted. */
  async dropSchedule(routine: RoutineRow): Promise<void> {
    if (this.jobs.schedulesEnabled && routine.scheduleId) {
      await this.jobs.removeSchedule(routine.scheduleId);
    }
  }

  /** After a time zone change, every schedule moves to the new zone. */
  async resyncSchedules(userId: string): Promise<void> {
    for (const routine of await this.routines.listScheduledForUser(userId)) {
      await this.syncSchedule(routine);
    }
  }
}
