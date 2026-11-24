import type {Database} from '@binary/db';
import {Hono} from 'hono';
import {csrf} from 'hono/csrf';

import type {Auth} from './auth';
import {handleError} from './errors';
import type {ModelBuilder} from './engine/factory';
import {createEngineFactory} from './engine/factory';
import type {SignedInEnv} from './middleware/require-user';
import {requireUser} from './middleware/require-user';
import {agentTemplatesRoutes} from './routes/agent-templates';
import {agentsRoutes} from './routes/agents';
import {keysRoutes} from './routes/keys';
import {playgroundRoutes} from './routes/playground';
import {appsRoutes} from './routes/apps';
import {integrationsRoutes} from './routes/integrations';
import {approvalsRoutes, todayRoutes} from './routes/approvals';
import {hooksRoutes} from './routes/hooks';
import {imagesRoutes, sandboxesRoutes} from './routes/sandboxes';
import {SandboxManager} from './sandbox/manager';
import type {SandboxProvider} from './sandbox/provider';
import {routinesRoutes} from './routes/routines';
import {settingsRoutes} from './routes/settings';
import {threadsRoutes} from './routes/threads';
import type {JobRunner} from './jobs/job-runner';
import {InProcessRunner} from './jobs/job-runner';
import {createRoutineExecutor} from './routines/run-routine';
import {RoutineService} from './routines/service';
import {builtInTools as defaultBuiltInTools} from './tools/built-in';
import type {ComposioGateway} from './tools/composio';
import type {BinaryTool} from './tools/toolbox';
import type {Vault} from './vault';

/** Everything the routes need. Tests pass a fake `buildModel`. */
export interface AppOptions {
  auth: Auth;
  db: Database;
  vault: Vault;
  /** Web pages and app schemes allowed to call the API. */
  trustedOrigins: string[];
  buildModel?: ModelBuilder;
  /** The built-in tools. Tests pass ones with a fixed clock. */
  builtInTools?: () => BinaryTool[];
  /** Composio, or null when it's off. Tests pass a fake. */
  composio?: ComposioGateway | null;
  /** The web app's address, for links back after connecting an app. */
  webUrl?: string;
  /** The API's public address, for webhook URLs. */
  apiUrl?: string;
  /** Where cloud sandboxes come from, or null when they're off. */
  sandboxProvider?: SandboxProvider | null;
  /**
   * Where routines run: Trigger.dev, or (the default) inside the API with
   * no schedules.
   */
  jobRunner?: JobRunner;
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
  builtInTools = defaultBuiltInTools,
  composio = null,
  webUrl = 'http://localhost:3000',
  apiUrl = 'http://localhost:3001',
  jobRunner,
  sandboxProvider = null,
}: AppOptions) {
  const app = new Hono();
  // Typed errors thrown anywhere become `{code, message}` JSON.
  app.onError(handleError);

  app.get('/health', c => c.json({ok: true}));

  const sandboxes = new SandboxManager(db, sandboxProvider);
  const jobs =
    jobRunner ??
    new InProcessRunner(
      db,
      createRoutineExecutor({
        db,
        vault,
        buildModel,
        builtInTools,
        composio,
        sandboxes,
      }),
    );
  const routines = new RoutineService(db, jobs);

  // Webhooks come from other services, not a signed-in person: their
  // routine's secret is checked instead of a session. Mounted before the
  // signed-in routes, so their session and CSRF checks never run here.
  app.route('/api/hooks', hooksRoutes({db, service: routines}));

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
  signedIn.route('/agents', agentsRoutes(db));
  signedIn.route('/agent-templates', agentTemplatesRoutes(db));
  signedIn.route('/apps', appsRoutes({db, vault, builtInTools}));
  signedIn.route(
    '/threads',
    threadsRoutes({db, vault, engineFor, builtInTools, composio, sandboxes}),
  );
  signedIn.route('/integrations', integrationsRoutes({db, composio, webUrl}));
  signedIn.route('/routines', routinesRoutes({db, service: routines, apiUrl}));
  signedIn.route('/settings', settingsRoutes({db, service: routines}));
  signedIn.route(
    '/approvals',
    approvalsRoutes({db, vault, builtInTools, composio, engineFor, sandboxes}),
  );
  signedIn.route('/sandboxes', sandboxesRoutes(sandboxes));
  signedIn.route('/images', imagesRoutes(db));
  signedIn.route('/today', todayRoutes(db));
  app.route('/api', signedIn);

  return app;
}
