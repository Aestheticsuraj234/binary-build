import {expo} from '@better-auth/expo';
import type {Database} from '@binary/db';
import {schema} from '@binary/db';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  signInSchema,
  signUpSchema,
  validate,
} from '@binary/shared';
import {betterAuth} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {APIError, createAuthMiddleware} from 'better-auth/api';

/** Everything Better Auth needs to know to run. */
export interface AuthConfig {
  db: Database;
  secret: string;
  /** The public URL of this API, for example http://localhost:3001. */
  baseUrl: string;
  /** Web pages and app schemes that may call the auth routes. */
  trustedOrigins: string[];
}

/**
 * Runs the shared form rules before Better Auth handles a sign-up or sign-in,
 * so the API rejects bad input with the same messages the apps show.
 */
const checkAuthForms = createAuthMiddleware(async ctx => {
  let formSchema;
  if (ctx.path === '/sign-up/email') {
    formSchema = signUpSchema;
  } else if (ctx.path === '/sign-in/email') {
    formSchema = signInSchema;
  } else {
    return;
  }

  const result = validate(formSchema, ctx.body);
  if (!result.success) {
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_INPUT',
      message: result.firstError,
      fieldErrors: result.errors,
    });
  }
  // Hand the cleaned-up values (trimmed name and email) to Better Auth.
  return {context: {body: {...ctx.body, ...result.data}}};
});

/** Creates the Better Auth server: email and password, stored in Postgres. */
export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(config.db, {provider: 'pg', schema}),
    secret: config.secret,
    baseURL: config.baseUrl,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },
    // Lets the Expo app sign in and keep its session in secure storage.
    plugins: [expo()],
    hooks: {before: checkAuthForms},
    // Better Auth skips its origin check when NODE_ENV is "test". Keep it on
    // everywhere, so the tests exercise the same protection as real use.
    advanced: {disableOriginCheck: false},
    telemetry: {enabled: false},
  });
}

/** The auth server returned by `createAuth`. */
export type Auth = ReturnType<typeof createAuth>;
