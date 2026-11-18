import {fetch} from 'expo/fetch';

import {authClient} from '@/lib/auth-client';

// Written to apps/mobile/.env.local by `pnpm run setup`.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/** An error the API sent back, with a message that is safe to show. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Calls the API as the signed-in person. The session cookie comes from
 * secure storage, where the Better Auth Expo client keeps it.
 *
 * Uses `expo/fetch`, whose responses can be read as a stream.
 */
export async function apiFetch(
  path: string,
  options: {method?: string; body?: unknown; signal?: AbortSignal} = {},
) {
  const headers: Record<string, string> = {
    cookie: await authClient.getCookie(),
  };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  try {
    return await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    throw new ApiError('Could not reach Binary. Is the API running?', 0);
  }
}

/** Calls the API and returns its JSON body, or throws `ApiError`. */
export async function apiJson<T>(
  path: string,
  options: {method?: string; body?: unknown} = {},
): Promise<T> {
  const response = await apiFetch(path, options);
  const body = (await response.json().catch(() => null)) as
    (T & {message?: string}) | null;
  if (!response.ok) {
    throw new ApiError(
      body?.message ?? 'Something went wrong. Please try again.',
      response.status,
    );
  }
  return body as T;
}
