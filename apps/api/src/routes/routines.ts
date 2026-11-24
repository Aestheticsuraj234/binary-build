import type {Database, RoutineRow} from '@binary/db';
import {
  AgentRepository,
  RoutineRepository,
  RoutineRunRepository,
  UserSettingsRepository,
} from '@binary/db';
import type {
  RoutineDetail,
  RoutineInput,
  RoutineSaved,
  RoutinesOverview,
} from '@binary/shared';
import {routineInputSchema, ROUTINE_MESSAGES} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';

import {idParam, InvalidInputError, NotFoundError, readJson} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import type {RoutineService} from '../routines/service';
import {toRoutineRun, toRoutineSummary} from '../routines/service';
import {newWebhookSecret} from '../routines/webhook-secret';

interface RoutinesRouteOptions {
  db: Database;
  service: RoutineService;
  /** The API's public address, for webhook URLs. */
  apiUrl: string;
}

/** Where a routine's webhook is called. */
export function webhookUrl(apiUrl: string, routineId: string): string {
  return `${apiUrl.replace(/\/$/, '')}/api/hooks/routines/${routineId}`;
}

/**
 * Routine routes, mounted at /api/routines. Every query is scoped to the
 * signed-in person.
 */
export function routinesRoutes({db, service, apiUrl}: RoutinesRouteOptions) {
  const routines = new RoutineRepository(db);
  const runs = new RoutineRunRepository(db);
  const agents = new AgentRepository(db);
  const settings = new UserSettingsRepository(db);
  const routes = new Hono<SignedInEnv>();

  /** One of this person's routines from the URL, or a 404. */
  async function findRoutine(c: Context<SignedInEnv>) {
    const found = await routines.findForUser(
      idParam(c, 'routine'),
      c.var.user.id,
    );
    if (!found) {
      throw new NotFoundError('routine');
    }
    return found;
  }

  /** Reads the form, checking the agent is on this person's crew. */
  async function readInput(c: Context<SignedInEnv>): Promise<RoutineInput> {
    const input = await readJson(c, routineInputSchema);
    if (!(await agents.findForUser(input.agentId, c.var.user.id))) {
      throw new InvalidInputError(ROUTINE_MESSAGES.agentRequired, {
        agentId: ROUTINE_MESSAGES.agentRequired,
      });
    }
    return input;
  }

  async function detail(c: Context<SignedInEnv>): Promise<RoutineDetail> {
    const found = await findRoutine(c);
    return {
      routine: toRoutineSummary(found),
      runs: (await runs.listForRoutine(found.routine.id)).map(toRoutineRun),
      schedulesEnabled: service.jobs.schedulesEnabled,
      timeZone: await settings.timeZoneOf(c.var.user.id),
      webhookUrl:
        found.routine.webhookSecretHash === null
          ? null
          : webhookUrl(apiUrl, found.routine.id),
    };
  }

  /** The routine as saved, plus a new secret if one was just made. */
  async function saved(
    c: Context<SignedInEnv>,
    routine: RoutineRow,
    webhookSecret: string | null,
  ): Promise<RoutineSaved> {
    const found = await routines.findForUser(routine.id, c.var.user.id);
    return {routine: toRoutineSummary(found!), webhookSecret};
  }

  routes.get('/', async c => {
    const userId = c.var.user.id;
    await runs.expireStale(userId);
    const overview: RoutinesOverview = {
      routines: (await routines.listForUser(userId)).map(toRoutineSummary),
      schedulesEnabled: service.jobs.schedulesEnabled,
      timeZone: await settings.timeZoneOf(userId),
    };
    return c.json(overview);
  });

  routes.post('/', async c => {
    const {webhook, ...input} = await readInput(c);
    const secret = webhook ? newWebhookSecret() : null;
    const routine = await routines.create(c.var.user.id, {
      ...input,
      webhookSecretHash: secret?.hash ?? null,
    });
    try {
      await service.syncSchedule(routine);
    } catch (error) {
      // Trigger.dev refused the schedule: don't keep half a routine.
      await routines.deleteForUser(routine.id, c.var.user.id);
      throw error;
    }
    return c.json(await saved(c, routine, secret?.secret ?? null), 201);
  });

  /** A routine with its newest runs. The page polls this while runs move. */
  routes.get('/:id', async c => {
    await runs.expireStale(c.var.user.id);
    return c.json(await detail(c));
  });

  routes.patch('/:id', async c => {
    const {routine: before} = await findRoutine(c);
    const {webhook, ...input} = await readInput(c);
    // Turning the webhook on makes a secret; keeping it on keeps the old one.
    const secret =
      webhook && before.webhookSecretHash === null ? newWebhookSecret() : null;
    const webhookSecretHash = webhook
      ? (secret?.hash ?? before.webhookSecretHash)
      : null;
    const routine = (await routines.updateForUser(before.id, c.var.user.id, {
      ...input,
      webhookSecretHash,
    }))!;
    try {
      await service.syncSchedule(routine);
    } catch (error) {
      // Put it back as it was, so the page and the schedule still agree.
      await routines.updateForUser(before.id, c.var.user.id, {
        agentId: before.agentId,
        name: before.name,
        instructions: before.instructions,
        cron: before.cron,
        enabled: before.enabled,
        webhookSecretHash: before.webhookSecretHash,
      });
      throw error;
    }
    return c.json(await saved(c, routine, secret?.secret ?? null));
  });

  routes.delete('/:id', async c => {
    const {routine} = await findRoutine(c);
    await service.dropSchedule(routine);
    await routines.deleteForUser(routine.id, c.var.user.id);
    return c.json({ok: true});
  });

  /** Run now. Works even when the routine is switched off. */
  routes.post('/:id/run', async c => {
    const {routine} = await findRoutine(c);
    const {run} = await service.startRun(routine.id, 'manual');
    return c.json({run: toRoutineRun(run)}, 202);
  });

  /** A new webhook secret, shown once. The old one stops working. */
  routes.post('/:id/webhook-secret', async c => {
    const {routine} = await findRoutine(c);
    const secret = newWebhookSecret();
    const updated = (await routines.updateForUser(routine.id, c.var.user.id, {
      webhookSecretHash: secret.hash,
    }))!;
    return c.json(await saved(c, updated, secret.secret));
  });

  return routes;
}
