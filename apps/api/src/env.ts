import {z} from 'zod';

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

const envSchema = z.object({
  DATABASE_URL: z.url({error: 'DATABASE_URL must be set to a Postgres URL.'}),
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
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

/** The API's checked configuration. */
export type Env = z.infer<typeof envSchema>;

/**
 * Checks the API's environment variables.
 *
 * Throws one error listing every problem, so a misconfigured API stops at
 * startup instead of failing later with a confusing message.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
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
