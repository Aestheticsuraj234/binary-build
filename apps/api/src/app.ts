import {Hono} from 'hono';

import type {Auth} from './auth';

/**
 * Builds the HTTP routes. Kept separate from `index.ts` so tests can call the
 * app directly without opening a network port.
 */
export function createApp(auth: Auth) {
  const app = new Hono();

  app.get('/health', c => c.json({ok: true}));

  // Better Auth handles everything under /api/auth: sign-up, sign-in,
  // sign-out and reading the current session.
  app.on(['GET', 'POST'], '/api/auth/*', c => auth.handler(c.req.raw));

  return app;
}
