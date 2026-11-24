import type {Database, RunnerRow} from '@binary/db';
import {RunnerRepository} from '@binary/db';
import type {
  RunnerAdded,
  RunnerEvent,
  RunnerHello,
  RunnerResult,
} from '@binary/shared';
import {addRunnerSchema} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {z} from 'zod';

import {
  idParam,
  InvalidInputError,
  NotFoundError,
  readJson,
  UnauthorizedError,
} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import {toRunnerSummary} from '../runners/access';
import type {RunnerHub} from '../runners/hub';
import {
  hashSecret,
  newPairingCode,
  newRunnerToken,
  normaliseCode,
  PAIRING_CODE_MS,
} from '../runners/tokens';
import {secretFromAuthorization} from '../routines/webhook-secret';

/** How long a Runner's long poll waits for work. */
export const LONG_POLL_MS = 25_000;

const PAUSED = 'Paused on Your computers.';
const REMOVED = 'This computer was removed.';

/**
 * Your computers, mounted at /api/runners for the signed-in person: add
 * one (a one-time pairing code), list, pause, resume and remove.
 */
export function runnersRoutes({db, hub}: {db: Database; hub: RunnerHub}) {
  const runners = new RunnerRepository(db);
  const routes = new Hono<SignedInEnv>();

  routes.get('/', async c =>
    c.json({
      runners: (await runners.listForUser(c.var.user.id)).map(toRunnerSummary),
    }),
  );

  routes.post('/', async c => {
    const {name} = await readJson(c, addRunnerSchema);
    const code = newPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_MS);
    const row = await runners.create({
      userId: c.var.user.id,
      name,
      pairingCodeHash: hashSecret(code),
      pairingExpiresAt: expiresAt,
    });
    const added: RunnerAdded = {
      runner: toRunnerSummary(row),
      code,
      expiresAt: expiresAt.toISOString(),
    };
    return c.json(added, 201);
  });

  const pause = (paused: boolean) => async (c: Context<SignedInEnv>) => {
    const row = await runners.setPausedForUser(
      idParam(c, 'computer'),
      c.var.user.id,
      paused,
    );
    if (!row) {
      throw new NotFoundError('computer');
    }
    if (paused) {
      // Everything waiting or running for it stops now.
      hub.cancelAll(row.id, `${row.name} was paused, so this was stopped.`);
    }
    return c.json({runner: toRunnerSummary(row)});
  };
  routes.post('/:id/pause', pause(true));
  routes.post('/:id/resume', pause(false));

  routes.delete('/:id', async c => {
    const id = idParam(c, 'computer');
    if (!(await runners.deleteForUser(id, c.var.user.id))) {
      throw new NotFoundError('computer');
    }
    hub.cancelAll(id, REMOVED);
    return c.json({ok: true});
  });

  return routes;
}

interface RunnerEnv {
  Variables: {runner: RunnerRow};
}

const pairSchema = z.object({code: z.string().trim().min(1).max(20)});
const helloSchema = z.object({
  os: z.string().max(100),
  version: z.string().max(40),
  folders: z.array(z.string().max(1000)).max(20),
});
const eventsSchema = z.object({
  events: z.array(z.record(z.string(), z.unknown())).max(500),
});
const resultSchema = z.union([
  z.object({ok: z.literal(true), output: z.unknown()}),
  z.object({ok: z.literal(false), error: z.string().max(4000)}),
]);

/**
 * What the Runner calls, mounted at /api/runner. No session: pairing takes
 * a one-time code, and everything else the Runner's token. The Runner
 * asks; the API never connects to it.
 */
export function runnerApiRoutes({db, hub}: {db: Database; hub: RunnerHub}) {
  const runners = new RunnerRepository(db);
  const routes = new Hono<RunnerEnv>();

  routes.use(bodyLimit({maxSize: 2 * 1024 * 1024}));

  /** Swaps a one-time code for a token. The code works once. */
  routes.post('/pair', async c => {
    const {code} = await readJson(c, pairSchema);
    const token = newRunnerToken();
    const row = await runners.pair(
      hashSecret(normaliseCode(code)),
      hashSecret(token),
    );
    if (!row) {
      throw new InvalidInputError(
        "That code doesn't work. It may have expired or been used: add the computer again for a new one.",
      );
    }
    return c.json({token, runnerId: row.id, name: row.name});
  });

  // Everything else needs the Runner's token.
  routes.use('*', async (c, next) => {
    const token = secretFromAuthorization(c.req.header('authorization'));
    const row = token
      ? await runners.findByToken(hashSecret(token))
      : undefined;
    if (!row) {
      throw new UnauthorizedError(
        "This Runner isn't paired (or was removed). Pair it again with `pnpm runner pair <code>`.",
      );
    }
    c.set('runner', row);
    await next();
  });

  routes.post('/hello', async c => {
    const hello: RunnerHello = await readJson(c, helloSchema);
    await runners.hello(c.var.runner.id, hello);
    return c.json({
      name: c.var.runner.name,
      paused: c.var.runner.pausedAt !== null,
    });
  });

  /** The long poll: the next job, or nothing after a while. */
  routes.post('/jobs/next', async c => {
    const runner = c.var.runner;
    await runners.seen(runner.id);
    if (runner.pausedAt) {
      return c.json({job: null, paused: true, message: PAUSED});
    }
    const job = await hub.next(runner.id, LONG_POLL_MS);
    return c.json({job, paused: false});
  });

  routes.post('/jobs/:jobId/events', async c => {
    const {events} = await readJson(c, eventsSchema);
    const ok = hub.event(
      c.var.runner.id,
      c.req.param('jobId'),
      events as unknown as RunnerEvent[],
    );
    if (!ok) {
      throw new NotFoundError('job');
    }
    return c.json({ok: true});
  });

  routes.post('/jobs/:jobId/result', async c => {
    const result = (await readJson(c, resultSchema)) as RunnerResult;
    if (!hub.finish(c.var.runner.id, c.req.param('jobId'), result)) {
      throw new NotFoundError('job');
    }
    return c.json({ok: true});
  });

  return routes;
}
