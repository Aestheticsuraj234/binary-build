import {createDb} from '@binary/db';
import {serve} from '@hono/node-server';

import {createApp} from './app';
import {createAuth} from './auth';
import type {Env} from './env';
import {getTrustedOrigins, loadEnv} from './env';
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
  const app = createApp({auth, db, vault, trustedOrigins});

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
