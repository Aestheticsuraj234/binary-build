import type {Database} from '@binary/db';
import {ToolImageRepository} from '@binary/db';
import type {SandboxesOverview} from '@binary/shared';
import {SANDBOX_IDLE_MINUTES} from '@binary/shared';
import {Hono} from 'hono';

import {idParam, NotFoundError} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import type {SandboxManager} from '../sandbox/manager';

/**
 * Cloud sandboxes, mounted at /api/sandboxes: what's running, and Stop.
 * Every query is scoped to the signed-in person.
 */
export function sandboxesRoutes(sandboxes: SandboxManager) {
  const routes = new Hono<SignedInEnv>();

  routes.get('/', async c => {
    const overview: SandboxesOverview = {
      available: sandboxes.available,
      idleMinutes: SANDBOX_IDLE_MINUTES,
      sandboxes: sandboxes.available
        ? await sandboxes.listForUser(c.var.user.id)
        : [],
    };
    return c.json(overview);
  });

  routes.post('/:id/stop', async c => {
    if (!(await sandboxes.stop(idParam(c, 'sandbox'), c.var.user.id))) {
      throw new NotFoundError('sandbox');
    }
    return c.json({ok: true});
  });

  return routes;
}

/** Images tools made for people (charts), mounted at /api/images. */
export function imagesRoutes(db: Database) {
  const images = new ToolImageRepository(db);
  const routes = new Hono<SignedInEnv>();

  routes.get('/:id', async c => {
    const image = await images.findForUser(idParam(c, 'image'), c.var.user.id);
    if (!image) {
      throw new NotFoundError('image');
    }
    return c.body(Buffer.from(image.data, 'base64'), 200, {
      'content-type': image.mime,
      // An image never changes, but it's private to its owner.
      'cache-control': 'private, max-age=31536000, immutable',
    });
  });

  return routes;
}
