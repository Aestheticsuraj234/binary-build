/**
 * Used only by `pnpm --filter api auth:schema`, which writes the database
 * tables Better Auth needs to packages/db/src/schema/auth.ts.
 * Nothing connects to this database: the CLI only reads the configuration.
 */
import {createDb} from '@binary/db';

import {createAuth} from './auth';

export const auth = createAuth({
  db: createDb('postgres://unused@localhost/unused'),
  secret: 'schema-generation-only-0000000000000000',
  baseUrl: 'http://localhost:3001',
  trustedOrigins: [],
});
