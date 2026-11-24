import {z} from 'zod';

import {MASTER_KEY_BYTES} from './vault';

/** Shortest auth secret we accept. 32 random bytes encode to 44 characters. */
export const MIN_SECRET_LENGTH = 32;

/** Words that mean someone copied the example value instead of a real one. */
const PLACEHOLDER_WORDS = [
  'replace',
  'change-me',
  'changeme',
  'placeholder',
  'example',
  'your-secret',
  'todo',
];

/** True when `secret` looks like a value from a template, not a real one. */
export function isPlaceholderSecret(secret: string): boolean {
  const lower = secret.toLowerCase();
  return PLACEHOLDER_WORDS.some(word => lower.includes(word));
}

/** True when `value` is base64 for exactly 32 bytes, as AES-256 needs. */
export function isValidMasterKey(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }
  return Buffer.from(value, 'base64').length === MASTER_KEY_BYTES;
}

const envSchema = z.object({
  DATABASE_URL: z.url({error: 'DATABASE_URL must be set to a Postgres URL.'}),
  ENCRYPTION_KEY: z
    .string({error: 'ENCRYPTION_KEY is missing.'})
    // `abort` stops here, so a placeholder gets one clear message.
    .refine(key => !isPlaceholderSecret(key), {
      message: 'ENCRYPTION_KEY is still a placeholder.',
      abort: true,
    })
    .refine(
      isValidMasterKey,
      'ENCRYPTION_KEY must be 32 random bytes, base64-encoded ' +
        '(make one with: openssl rand -base64 32).',
    ),
  BETTER_AUTH_SECRET: z
    .string({error: 'BETTER_AUTH_SECRET is missing.'})
    .min(
      MIN_SECRET_LENGTH,
      `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`,
    )
    .refine(
      secret => !isPlaceholderSecret(secret),
      'BETTER_AUTH_SECRET is still a placeholder.',
    ),
  BETTER_AUTH_URL: z.url().default('http://localhost:3001'),
  WEB_URL: z.url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3001),
  /**
   * Optional. Turns on Composio (Gmail, GitHub, Slack and more) for
   * everyone on this Binary. Each person still connects their own accounts.
   * A placeholder counts as not set.
   */
  COMPOSIO_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform(key => (key && !isPlaceholderSecret(key) ? key : undefined)),
  /**
   * Optional. Runs routines on Trigger.dev, with real schedules. Without
   * it, runs happen inside the API and schedules don't fire.
   */
  TRIGGER_SECRET_KEY: z
    .string()
    .trim()
    .optional()
    .transform(key => (key && !isPlaceholderSecret(key) ? key : undefined)),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

/** What the Trigger.dev worker needs: the database, the vault and Composio. */
const workerEnvSchema = envSchema.pick({
  DATABASE_URL: true,
  ENCRYPTION_KEY: true,
  COMPOSIO_API_KEY: true,
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** The API's checked configuration. */
export type Env = z.infer<typeof envSchema>;

/**
 * Checks the API's environment variables.
 *
 * Throws one error listing every problem, so a misconfigured API stops at
 * startup instead of failing later with a confusing message.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return checked(envSchema, source);
}

/** Checks the Trigger.dev worker's environment, the same way. */
export function parseWorkerEnv(
  source: Record<string, string | undefined>,
): WorkerEnv {
  return checked(workerEnvSchema, source);
}

function checked<T>(
  schema: z.ZodType<T>,
  source: Record<string, string | undefined>,
): T {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues.map(issue => `  - ${issue.message}`);
  throw new Error(
    [
      'The API cannot start because its configuration is invalid:',
      ...problems,
      'Run `pnpm run setup` to create a .env file with a random secret.',
    ].join('\n'),
  );
}

/** Web pages and app schemes allowed to call the auth routes. */
export function getTrustedOrigins(env: Env): string[] {
  const origins = [env.WEB_URL, 'binary://'];
  // Expo Go uses exp:// addresses while you develop on a phone.
  if (env.NODE_ENV !== 'production') {
    origins.push('exp://');
  }
  return origins;
}

/** Reads the repo-wide .env file (if there is one) and checks the result. */
export function loadEnv(): Env {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // No .env file (for example in CI): use the environment as it is.
  }
  return parseEnv(process.env);
}
