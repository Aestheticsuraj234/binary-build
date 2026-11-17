import type {Database} from '@binary/db';
import {
  API_ERROR_CODES,
  isProviderId,
  saveKeySchema,
  validate,
} from '@binary/shared';
import {Hono} from 'hono';

import {listKeyStatuses, removeKey, saveKey} from '../key-store';
import type {SignedInEnv} from '../middleware/require-user';
import type {Vault} from '../vault';

interface KeysRouteOptions {
  db: Database;
  vault: Vault;
}

const UNKNOWN_PROVIDER = {
  code: API_ERROR_CODES.notFound,
  message: 'Binary does not support that provider.',
};

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
    const provider = c.req.param('provider');
    if (!isProviderId(provider)) {
      return c.json(UNKNOWN_PROVIDER, 404);
    }

    const body: unknown = await c.req.json().catch(() => null);
    const result = validate(saveKeySchema, body);
    if (!result.success) {
      return c.json(
        {
          code: API_ERROR_CODES.invalidInput,
          message: result.firstError,
          fieldErrors: result.errors,
        },
        400,
      );
    }

    const status = await saveKey(
      db,
      vault,
      c.var.user.id,
      provider,
      result.data.key,
    );
    return c.json({key: status});
  });

  routes.delete('/:provider', async c => {
    const provider = c.req.param('provider');
    if (!isProviderId(provider)) {
      return c.json(UNKNOWN_PROVIDER, 404);
    }
    return c.json({key: await removeKey(db, c.var.user.id, provider)});
  });

  return routes;
}
