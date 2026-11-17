// `pnpm db:seed`: adds the agent templates and the demo account.
import {createDb} from '@binary/db';

import {createAuth} from '../src/auth';
import {getTrustedOrigins, loadEnv} from '../src/env';
import {seed} from '../src/seed';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseUrl: env.BETTER_AUTH_URL,
  trustedOrigins: getTrustedOrigins(env),
});

try {
  await seed({db, auth, isProduction: env.NODE_ENV === 'production'});
} finally {
  await db.$client.end();
}
