import {fileURLToPath} from 'node:url';

import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema';

export * from './schema';
export {schema};
// Re-exported so other packages can write raw SQL without their own copy.
export {and, eq, sql} from 'drizzle-orm';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Connects to Postgres and returns a Drizzle client.
 * Call `db.$client.end()` to close the connection when you are done.
 */
export function createDb(databaseUrl: string) {
  // `onnotice` hides harmless Postgres notices, which are just noise here.
  const client = postgres(databaseUrl, {onnotice: () => {}});
  return drizzle({client});
}

/** A connected Drizzle client, as returned by `createDb`. */
export type Database = ReturnType<typeof createDb>;

/** Applies every migration in packages/db/drizzle that has not run yet. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, {max: 1, onnotice: () => {}});
  try {
    await migrate(drizzle({client}), {migrationsFolder: MIGRATIONS_FOLDER});
  } finally {
    await client.end();
  }
}
