import type {Database} from '@binary/db';
import {Hono} from 'hono';
import {csrf} from 'hono/csrf';

import type {Auth} from './auth';
import type {ModelBuilder} from './engine/factory';
import {createEngineFactory} from './engine/factory';
import type {SignedInEnv} from './middleware/require-user';
import {requireUser} from './middleware/require-user';
import {agentTemplatesRoutes} from './routes/agent-templates';
import {agentsRoutes} from './routes/agents';
import {keysRoutes} from './routes/keys';
import {playgroundRoutes} from './routes/playground';
import type {Vault} from './vault';

/** Everything the routes need. Tests pass a fake `buildModel`. */
export interface AppOptions {
  auth: Auth;
  db: Database;
  vault: Vault;
  /** Web pages and app schemes allowed to call the API. */
  trustedOrigins: string[];
  buildModel?: ModelBuilder;
}

/**
 * Builds the HTTP routes. Kept separate from `index.ts` so tests can call the
 * app directly without opening a network port.
 */
export function createApp({
  auth,
  db,
  vault,
  trustedOrigins,
  buildModel,
}: AppOptions) {
  const app = new Hono();

  app.get('/health', c => c.json({ok: true}));

  // Better Auth handles everything under /api/auth: sign-up, sign-in,
  // sign-out and reading the current session.
  app.on(['GET', 'POST'], '/api/auth/*', c => auth.handler(c.req.raw));

  // Every other /api route needs a signed-in person. `csrf` refuses form
  // posts from websites that aren't ours.
  const signedIn = new Hono<SignedInEnv>();
  signedIn.use(csrf({origin: trustedOrigins}));
  signedIn.use(requireUser(auth));
  const engineFor = createEngineFactory({db, vault, buildModel});
  signedIn.route('/keys', keysRoutes({db, vault}));
  signedIn.route('/playground', playgroundRoutes(engineFor));
  signedIn.route('/agents', agentsRoutes({db, engineFor}));
  signedIn.route('/agent-templates', agentTemplatesRoutes(db));
  app.route('/api', signedIn);

  return app;
}
