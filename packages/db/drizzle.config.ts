import {defineConfig} from 'drizzle-kit';

// Read the repo-wide .env when it exists. Real environment variables win.
try {
  // drizzle-kit always runs from packages/db, so this path is the repo root.
  process.loadEnvFile('../../.env');
} catch {
  // No .env file (for example in CI): use the environment as it is.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Run `pnpm run setup` first.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {url: databaseUrl},
});
