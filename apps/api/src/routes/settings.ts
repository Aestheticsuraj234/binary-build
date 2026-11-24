import type {Database} from '@binary/db';
import {UserSettingsRepository} from '@binary/db';
import {timeZoneInputSchema} from '@binary/shared';
import {Hono} from 'hono';

import {readJson} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import type {RoutineService} from '../routines/service';
import {canonicalTimeZone} from '../routines/timezone';

/**
 * The person's settings, mounted at /api/settings. For now, the time zone
 * that every routine schedule is read in.
 */
export function settingsRoutes({
  db,
  service,
}: {
  db: Database;
  service: RoutineService;
}) {
  const settings = new UserSettingsRepository(db);
  const routes = new Hono<SignedInEnv>();

  routes.get('/', async c =>
    c.json({timeZone: await settings.timeZoneOf(c.var.user.id)}),
  );

  /** Sets the time zone. Every schedule moves with it. */
  routes.put('/', async c => {
    const input = await readJson(c, timeZoneInputSchema);
    const timeZone = canonicalTimeZone(input.timeZone);
    await settings.setTimeZone(c.var.user.id, timeZone);
    await service.resyncSchedules(c.var.user.id);
    return c.json({timeZone});
  });

  return routes;
}
