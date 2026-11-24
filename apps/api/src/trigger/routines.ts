// Trigger.dev tasks. `pnpm trigger:dev` bundles this folder and runs these
// tasks in a worker on your machine, connected to your Trigger.dev project.
// They run the same `runRoutine` as the API does without Trigger.dev.
import type {Database} from '@binary/db';
import {createDb, RoutineRepository, RoutineRunRepository} from '@binary/db';
import {logger, schedules, task} from '@trigger.dev/sdk';

import {parseWorkerEnv} from '../env';
import type {RoutineExecutor} from '../routines/run-routine';
import {createRoutineExecutor} from '../routines/run-routine';
import {BrowserManager} from '../browser/manager';
import {E2BProvider} from '../sandbox/e2b';
import {SandboxManager} from '../sandbox/manager';
import {createComposioGateway} from '../tools/composio';
import {createVault} from '../vault';

/**
 * A routine is one answer plus a few tool calls. Ten minutes is plenty, and
 * stops a stuck run from holding a worker forever.
 */
const MAX_DURATION_SECONDS = 600;

/**
 * Retries are safe: a retry may take back a run its earlier attempt left
 * `running` (no answer is saved until the run is done), and the attempt
 * number stops a slow earlier attempt from saving a second answer.
 */
const RETRY = {maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 20000};

const FAILED_MESSAGE = 'Something went wrong on our side.';

let worker: {db: Database; execute: RoutineExecutor} | undefined;

/** Connects once per worker process, from the .env `trigger:dev` loads. */
function workerDeps() {
  if (!worker) {
    const env = parseWorkerEnv(process.env);
    const db = createDb(env.DATABASE_URL);
    worker = {
      db,
      execute: createRoutineExecutor({
        db,
        vault: createVault(env.ENCRYPTION_KEY),
        composio: env.COMPOSIO_API_KEY
          ? createComposioGateway(env.COMPOSIO_API_KEY)
          : null,
        sandboxes: new SandboxManager(
          db,
          env.E2B_API_KEY ? new E2BProvider(env.E2B_API_KEY) : null,
        ),
        // A routine's browser lives in this worker while the run lasts.
        browsers: new BrowserManager(),
      }),
    };
  }
  return worker;
}

export interface RunRoutinePayload {
  runId: string;
}

/** Runs one queued run. Queued by Run now and by webhooks. */
export const runRoutineTask = task({
  id: 'run-routine',
  maxDuration: MAX_DURATION_SECONDS,
  retry: RETRY,
  run: async ({runId}: RunRoutinePayload, {ctx}) => {
    const result = await workerDeps().execute(runId, {
      reclaim: ctx.attempt.number > 1,
    });
    logger.info('Routine run finished', {runId, ...result});
    return result;
  },
  // Out of retries: say so on the run instead of leaving it "Running".
  onFailure: async ({payload}) => {
    await new RoutineRunRepository(workerDeps().db).fail(
      payload.runId,
      FAILED_MESSAGE,
    );
  },
});

/** The run a scheduled tick makes: one per routine and cron time. */
async function runForTick(routineId: string, timestamp: Date | string) {
  return new RoutineRunRepository(workerDeps().db).create({
    routineId,
    source: 'schedule',
    // Delivered twice, the same tick still makes one run.
    // (The payload's Date can arrive as a string, so normalise it.)
    dedupeKey: `schedule:${new Date(timestamp).toISOString()}`,
  });
}

/**
 * Fired by Trigger.dev on each routine's schedule. The schedule's external
 * id is the routine's id. The run happens right here, in this task.
 */
export const routineScheduleTask = schedules.task({
  id: 'routine-schedule',
  maxDuration: MAX_DURATION_SECONDS,
  retry: RETRY,
  run: async (payload, {ctx}) => {
    const routineId = payload.externalId;
    const found = routineId
      ? await new RoutineRepository(workerDeps().db).findWithAgent(routineId)
      : undefined;
    // Switched off or deleted since the schedule was made.
    if (!found || !found.routine.enabled || !found.routine.cron) {
      logger.info('Skipped: the routine is gone or switched off', {routineId});
      return {status: 'skipped' as const};
    }
    const {run} = await runForTick(found.routine.id, payload.timestamp);
    const result = await workerDeps().execute(run.id, {
      reclaim: ctx.attempt.number > 1,
    });
    logger.info('Scheduled run finished', {runId: run.id, ...result});
    return {runId: run.id, ...result};
  },
  onFailure: async ({payload}) => {
    if (!payload.externalId) {
      return;
    }
    try {
      const {run} = await runForTick(payload.externalId, payload.timestamp);
      await new RoutineRunRepository(workerDeps().db).fail(
        run.id,
        FAILED_MESSAGE,
      );
    } catch (error) {
      // The routine was deleted, so there's no run to mark.
      logger.warn('Could not mark the scheduled run failed', {error});
    }
  },
});
