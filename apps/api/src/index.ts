import {createDb} from '@binary/db';
import {serve} from '@hono/node-server';

import {createApp} from './app';
import {createAuth} from './auth';
import type {Env} from './env';
import {getTrustedOrigins, loadEnv} from './env';
import type {JobRunner} from './jobs/job-runner';
import {InProcessRunner} from './jobs/job-runner';
import {TriggerDevRunner} from './jobs/trigger-dev-runner';
import {createRoutineExecutor} from './routines/run-routine';
import {createComposioGateway} from './tools/composio';
import {createVault} from './vault';

function main(): void {
  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const db = createDb(env.DATABASE_URL);
  const trustedOrigins = getTrustedOrigins(env);
  const auth = createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
    trustedOrigins,
  });
  const vault = createVault(env.ENCRYPTION_KEY);
  const composio = env.COMPOSIO_API_KEY
    ? createComposioGateway(env.COMPOSIO_API_KEY)
    : null;

  // Routines run on Trigger.dev when it's set up, otherwise in this process.
  let jobRunner: JobRunner;
  if (env.TRIGGER_SECRET_KEY) {
    jobRunner = new TriggerDevRunner(env.TRIGGER_SECRET_KEY);
    console.log(
      'Routines run on Trigger.dev. Keep `pnpm trigger:dev` running.',
    );
  } else {
    const inProcess = new InProcessRunner(
      db,
      createRoutineExecutor({db, vault, composio}),
    );
    jobRunner = inProcess;
    console.log(
      "Routines run inside the API; schedules won't fire without Trigger.dev.",
    );
    // Runs cut off by the last restart start again.
    void inProcess.recover().then(count => {
      if (count > 0) {
        console.log(`Picked up ${count} unfinished routine run(s).`);
      }
    });
  }

  const app = createApp({
    auth,
    db,
    vault,
    trustedOrigins,
    composio,
    webUrl: env.WEB_URL,
    apiUrl: env.BETTER_AUTH_URL,
    jobRunner,
  });

  // 0.0.0.0 makes the API reachable from a phone on the same Wi-Fi.
  const server = serve(
    {fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0'},
    () => console.log(`API listening on http://localhost:${env.PORT}`),
  );

  const shutDown = () => {
    server.close();
    void db.$client.end();
  };
  process.on('SIGINT', shutDown);
  process.on('SIGTERM', shutDown);
}

main();
