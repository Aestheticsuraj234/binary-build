import type {Database} from '@binary/db';
import {createDb, sql} from '@binary/db';
import {simulateReadableStream} from 'ai';
import {MockLanguageModelV4} from 'ai/test';

import {createApp} from '../src/app';
import {createAuth} from '../src/auth';
import type {ModelBuilder} from '../src/engine/factory';
import {createVault} from '../src/vault';
import {
  API_URL,
  TEST_DATABASE_URL,
  TEST_ENCRYPTION_KEY,
  TEST_SECRET,
  WEB_URL,
} from './test-env';

/** Builds the real app against the test database. */
export function createTestApp(options: {buildModel?: ModelBuilder} = {}) {
  const db: Database = createDb(TEST_DATABASE_URL);
  const trustedOrigins = [WEB_URL, 'binary://', 'exp://'];
  const auth = createAuth({
    db,
    secret: TEST_SECRET,
    baseUrl: API_URL,
    trustedOrigins,
  });
  const vault = createVault(TEST_ENCRYPTION_KEY);
  const app = createApp({
    auth,
    db,
    vault,
    trustedOrigins,
    buildModel: options.buildModel,
  });
  return {app, db, vault};
}

export type TestApp = ReturnType<typeof createTestApp>['app'];

/** Removes every user. Their sessions and keys go with them. */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE "user", verification CASCADE`);
}

/** Turns a response's Set-Cookie headers into a Cookie header. */
export function cookieFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ');
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
}

/** Calls the app the way the web app does: JSON, from the web origin. */
export function callApi(
  app: TestApp,
  path: string,
  {method = 'GET', body, cookie, headers = {}}: RequestOptions = {},
): Promise<Response> {
  const allHeaders: Record<string, string> = {origin: WEB_URL, ...headers};
  if (body !== undefined) {
    allHeaders['content-type'] = 'application/json';
  }
  if (cookie) {
    allHeaders.cookie = cookie;
  }
  return Promise.resolve(
    app.request(`${API_URL}${path}`, {
      method,
      headers: allHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

/** Creates an account and returns its session cookie. */
export async function signUp(
  app: TestApp,
  email = 'ada@example.com',
): Promise<{cookie: string; userId: string}> {
  const response = await callApi(app, '/api/auth/sign-up/email', {
    method: 'POST',
    body: {name: 'Ada Lovelace', email, password: 'correct horse battery'},
  });
  const {user} = (await response.json()) as {user: {id: string}};
  return {cookie: cookieFrom(response), userId: user.id};
}

/** Usage numbers for a fake model's `finish` part. */
const FAKE_USAGE = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {total: 5, text: 5, reasoning: undefined},
};

/**
 * A fake model that streams `reply` word by word. `delayMs` waits between
 * words, like a real model typing.
 */
export function fakeModel(
  reply: string,
  {delayMs = 0}: {delayMs?: number} = {},
): MockLanguageModelV4 {
  const words = reply.split(/(?<= )/);
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: delayMs,
        chunks: [
          {type: 'text-start', id: 'text-1'},
          ...words.map(word => ({
            type: 'text-delta' as const,
            id: 'text-1',
            delta: word,
          })),
          {type: 'text-end', id: 'text-1'},
          {
            type: 'finish',
            finishReason: {unified: 'stop', raw: undefined},
            usage: FAKE_USAGE,
          },
        ],
      }),
    }),
  });
}

/** A fake model that writes `partial`, then the provider fails. */
export function brokenModel(
  partial: string,
  error: Error,
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          {type: 'text-start', id: 'text-1'},
          ...partial.split(/(?<= )/).map(word => ({
            type: 'text-delta' as const,
            id: 'text-1',
            delta: word,
          })),
          {type: 'error', error},
        ],
      }),
    }),
  });
}

/** A fake model whose provider fails with an HTTP error. */
export function failingModel(error: Error): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw error;
    },
  });
}

/** Reads a streamed response into its list of events. */
export async function readEvents(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter(line => line !== '')
    .map(line => JSON.parse(line) as unknown);
}
