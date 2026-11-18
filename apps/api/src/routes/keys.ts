import type {Database} from '@binary/db';
import type {ProviderId} from '@binary/shared';
import {API_ERROR_CODES, isProviderId, saveKeySchema} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';

import {AppError, readJson} from '../errors';
import {listKeyStatuses, removeKey, saveKey} from '../key-store';
import type {SignedInEnv} from '../middleware/require-user';
import type {Vault} from '../vault';

interface KeysRouteOptions {
  db: Database;
  vault: Vault;
}

/** The provider from the URL, or a 404 for one Binary doesn't support. */
function providerParam(c: Context): ProviderId {
  const provider = c.req.param('provider');
  if (!isProviderId(provider)) {
    throw new AppError(
      API_ERROR_CODES.notFound,
      404,
      'Binary does not support that provider.',
    );
  }
  return provider;
}

/**
 * Routes for the API keys page, mounted at /api/keys. Responses only ever
 * describe a key (connected, last 4 characters), never the key itself.
 */
export function keysRoutes({db, vault}: KeysRouteOptions) {
  const routes = new Hono<SignedInEnv>();

  routes.get('/', async c => {
    return c.json({keys: await listKeyStatuses(db, c.var.user.id)});
  });

  routes.put('/:provider', async c => {
    const provider = providerParam(c);
    const {key} = await readJson(c, saveKeySchema);
    const status = await saveKey(db, vault, c.var.user.id, provider, key);
    return c.json({key: status});
  });

  routes.delete('/:provider', async c => {
    const provider = providerParam(c);
    return c.json({key: await removeKey(db, c.var.user.id, provider)});
  });

  return routes;
}
