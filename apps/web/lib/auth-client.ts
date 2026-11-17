import {createAuthClient} from 'better-auth/react';

/**
 * Better Auth for the browser. With no base URL it calls /api/auth on this
 * site, which next.config.ts forwards to the API.
 */
export const authClient = createAuthClient();
