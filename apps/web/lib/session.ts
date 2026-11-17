import 'server-only';

import {API_URL} from './api-url';

/** The signed-in person, as the API describes them. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Asks the API who owns the given cookies. Returns null when nobody is
 * signed in or the session has expired.
 */
export async function getSessionUser(
  cookieHeader: string | null,
): Promise<SessionUser | null> {
  if (!cookieHeader) {
    return null;
  }
  const response = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: {cookie: cookieHeader},
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  const session = (await response.json()) as {user: SessionUser} | null;
  return session?.user ?? null;
}
