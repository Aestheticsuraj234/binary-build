import type {Database} from '@binary/db';
import {ApprovalRepository, RoutineRunRepository} from '@binary/db';
import type {TodayOverview} from '@binary/shared';
import {Hono} from 'hono';

import type {ApprovalDeps} from '../approvals/decide';
import {decideApproval, toApprovalSummary} from '../approvals/decide';
import {idParam} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import {toRoutineRun} from '../routines/service';

/** How far back Today looks for routine runs. */
const RECENT_RUNS_MS = 24 * 60 * 60 * 1000;

/**
 * Approval routes, mounted at /api/approvals. Every query is scoped to the
 * signed-in person; someone else's request is a 404.
 */
export function approvalsRoutes(deps: ApprovalDeps) {
  const approvals = new ApprovalRepository(deps.db);
  const routes = new Hono<SignedInEnv>();

  /** Requests waiting for the person, newest first. */
  routes.get('/', async c => {
    const rows = await approvals.listPendingForUser(c.var.user.id);
    return c.json({approvals: rows.map(toApprovalSummary)});
  });

  /** How many are waiting, for the Today badge. */
  routes.get('/count', async c =>
    c.json({pending: await approvals.countPendingForUser(c.var.user.id)}),
  );

  /**
   * Runs the requested tool once, then the character follows up. Waits
   * for both, so a slow tool makes this slow.
   */
  routes.post('/:id/approve', async c =>
    c.json(
      await decideApproval(
        deps,
        c.var.user.id,
        idParam(c, 'approval request'),
        'approve',
      ),
    ),
  );

  /** Runs nothing; the character acknowledges it. */
  routes.post('/:id/reject', async c =>
    c.json(
      await decideApproval(
        deps,
        c.var.user.id,
        idParam(c, 'approval request'),
        'reject',
      ),
    ),
  );

  return routes;
}

/** The Today inbox, mounted at /api/today. */
export function todayRoutes(db: Database) {
  const approvals = new ApprovalRepository(db);
  const runs = new RoutineRunRepository(db);
  const routes = new Hono<SignedInEnv>();

  routes.get('/', async c => {
    const userId = c.var.user.id;
    await runs.expireStale(userId);
    const [waiting, recent] = await Promise.all([
      approvals.listPendingForUser(userId),
      approvals.recentRunsForUser(
        userId,
        new Date(Date.now() - RECENT_RUNS_MS),
      ),
    ]);
    const overview: TodayOverview = {
      waiting: waiting.map(toApprovalSummary),
      recentRuns: recent.map(({run, routineName, avatar}) => ({
        ...toRoutineRun(run),
        routineId: run.routineId,
        routineName,
        avatar: avatar ?? 'pebble',
      })),
    };
    return c.json(overview);
  });

  return routes;
}
