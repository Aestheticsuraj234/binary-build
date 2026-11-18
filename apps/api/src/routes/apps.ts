import type {Database} from '@binary/db';
import {AppRepository} from '@binary/db';
import type {ToolsOverview} from '@binary/shared';
import {connectAppSchema} from '@binary/shared';
import {Hono} from 'hono';

import {ConflictError, idParam, NotFoundError, readJson} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import {appOwner, openApp} from '../tools/mcp-apps';
import type {BinaryTool} from '../tools/toolbox';
import {toSummary} from '../tools/toolbox';
import {describeApp, toAppSummary} from '../tools/user-tools';
import type {Vault} from '../vault';

interface AppsRouteOptions {
  db: Database;
  vault: Vault;
  builtInTools: () => BinaryTool[];
}

/**
 * The Apps & tools page, mounted at /api/apps. An app's Authorization
 * header is encrypted before it's saved and never sent back.
 */
export function appsRoutes({db, vault, builtInTools}: AppsRouteOptions) {
  const apps = new AppRepository(db);
  const routes = new Hono<SignedInEnv>();

  /** Built-in tools, and every app with its tools (or why it's down). */
  routes.get('/', async c => {
    const rows = await apps.listForUser(c.var.user.id);
    const overview: ToolsOverview = {
      builtIn: builtInTools().map(toSummary),
      apps: await Promise.all(rows.map(row => describeApp(row, vault))),
    };
    return c.json(overview);
  });

  /** Connects an app. It's tested first: one that doesn't answer isn't saved. */
  routes.post('/', async c => {
    const {name, url, authorization} = await readJson(c, connectAppSchema);
    const userId = c.var.user.id;
    if (await apps.nameIsTaken(userId, name)) {
      throw new ConflictError(`You already have an app called ${name}.`);
    }

    // Throws AppUnreachableError (502) with a reason if it doesn't answer.
    const open = await openApp({name, url, authorization});
    const tools = open.tools.map(toSummary);
    await open.close().catch(() => {});

    const id = crypto.randomUUID();
    const row = await apps.create({
      id,
      userId,
      name,
      url,
      encryptedAuthorization: authorization
        ? vault.encrypt(authorization, appOwner(userId, id))
        : null,
    });
    return c.json({app: toAppSummary(row), tools, error: null}, 201);
  });

  /** One app's tools again, for "Try again" after it was down. */
  routes.get('/:id', async c => {
    const row = await apps.findForUser(idParam(c, 'app'), c.var.user.id);
    if (!row) {
      throw new NotFoundError('app');
    }
    return c.json(await describeApp(row, vault));
  });

  routes.delete('/:id', async c => {
    if (!(await apps.deleteForUser(idParam(c, 'app'), c.var.user.id))) {
      throw new NotFoundError('app');
    }
    return c.json({ok: true});
  });

  return routes;
}
