import type {Database} from '@binary/db';
import {ToolImageRepository} from '@binary/db';
import {Hono} from 'hono';

import type {Computers} from '../computers';
import {NotFoundError} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';

/**
 * Every computer (cloud sandboxes and browsers), mounted at
 * /api/computers: what's on, what's running, and Stop. Scoped to the
 * signed-in person.
 */
export function computersRoutes(computers: Computers) {
  const routes = new Hono<SignedInEnv>();

  routes.get('/', async c => c.json(await computers.overview(c.var.user.id)));

  routes.post('/:id/stop', async c => {
    // Browser ids and sandbox ids are both UUIDs.
    const id = c.req.param('id');
    if (
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !(await computers.stop(id, c.var.user.id))
    ) {
      throw new NotFoundError('computer');
    }
    return c.json({ok: true});
  });

  return routes;
}

/** Images tools made for people (charts, screenshots), mounted at /api/images. */
export function imagesRoutes(db: Database) {
  const images = new ToolImageRepository(db);
  const routes = new Hono<SignedInEnv>();

  routes.get('/:id', async c => {
    const id = c.req.param('id');
    const image = /^[0-9a-f-]{36}$/i.test(id)
      ? await images.findForUser(id, c.var.user.id)
      : undefined;
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
