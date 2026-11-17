import {API_ERROR_CODES} from '@binary/shared';
import {createMiddleware} from 'hono/factory';

import type {Auth} from '../auth';

/** The signed-in person, as routes see it. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/** Hono settings for routes that need a signed-in person. */
export interface SignedInEnv {
  Variables: {user: CurrentUser};
}

/**
 * Lets the request through only when it carries a valid session, and makes
 * the person available as `c.var.user`.
 */
export function requireUser(auth: Auth) {
  return createMiddleware<SignedInEnv>(async (c, next) => {
    const session = await auth.api.getSession({headers: c.req.raw.headers});
    if (!session) {
      return c.json(
        {code: API_ERROR_CODES.unauthorized, message: 'Sign in first.'},
        401,
      );
    }
    const {id, name, email} = session.user;
    c.set('user', {id, name, email});
    await next();
  });
}
