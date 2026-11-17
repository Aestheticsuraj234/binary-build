import {runMigrations} from '@binary/db';

import {TEST_DATABASE_URL} from './test-env';

/** Runs once before all tests: brings the test database up to date. */
export async function setup(): Promise<void> {
  await runMigrations(TEST_DATABASE_URL);
}
