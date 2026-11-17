/** Settings shared by the API tests. */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // No .env file (for example in CI): use the environment as it is.
}

/** The test database. Never the dev database: tests delete every user. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://binary:binary@localhost:5433/binary_test';

/** A fixed secret that passes the startup checks. */
export const TEST_SECRET = 'test-secret-that-is-long-enough-0123456789';

export const API_URL = 'http://localhost:3001';
export const WEB_URL = 'http://localhost:3000';
