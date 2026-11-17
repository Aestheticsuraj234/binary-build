import type {Database} from '@binary/db';
import {createDb, sql, user} from '@binary/db';
import {AUTH_MESSAGES} from '@binary/shared';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import {createApp} from '../src/app';
import {createAuth} from '../src/auth';
import {API_URL, TEST_DATABASE_URL, TEST_SECRET, WEB_URL} from './test-env';

const db: Database = createDb(TEST_DATABASE_URL);
const app = createApp(
  createAuth({
    db,
    secret: TEST_SECRET,
    baseUrl: API_URL,
    trustedOrigins: [WEB_URL, 'binary://', 'exp://'],
  }),
);

const ada = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct horse battery',
};

/** Sends a request to the app the way the web app would. */
function request(
  path: string,
  options: {
    body?: object;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    origin: WEB_URL,
    ...options.headers,
  };
  if (options.body) {
    headers['content-type'] = 'application/json';
  }
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return Promise.resolve(
    app.request(`${API_URL}/api/auth${path}`, {
      method: options.body ? 'POST' : 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

/** Turns a response's Set-Cookie headers into a Cookie header. */
function cookieFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ');
}

async function signUp(body: object = ada): Promise<Response> {
  return request('/sign-up/email', {body});
}

async function signIn(email: string, password: string): Promise<Response> {
  return request('/sign-in/email', {body: {email, password}});
}

async function getSession(cookie: string) {
  const response = await request('/get-session', {cookie});
  return response.json() as Promise<{user: {email: string}} | null>;
}

beforeEach(async () => {
  // Start every test with no users. Sessions and accounts cascade.
  await db.execute(sql`TRUNCATE TABLE "user", verification CASCADE`);
});

afterAll(async () => {
  await db.$client.end();
});

describe('sign-up', () => {
  it('creates an account and signs the person in', async () => {
    const response = await signUp({...ada, name: '  Ada Lovelace  '});

    expect(response.status).toBe(200);
    const session = await getSession(cookieFrom(response));
    expect(session?.user.email).toBe(ada.email);

    const [saved] = await db.select().from(user);
    expect(saved?.name).toBe('Ada Lovelace');
  });

  it('rejects invalid input with the shared message', async () => {
    const response = await signUp({...ada, password: 'short'});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_INPUT',
      message: AUTH_MESSAGES.passwordTooShort,
    });
    expect(await db.select().from(user)).toHaveLength(0);
  });

  it('rejects an email that is already registered', async () => {
    await signUp();

    const response = await signUp({...ada, name: 'Someone Else'});

    expect(response.status).toBe(422);
    expect(await db.select().from(user)).toHaveLength(1);
  });
});

describe('sign-in', () => {
  beforeEach(async () => {
    await signUp();
  });

  it('signs in with the right password', async () => {
    const response = await signIn(ada.email, ada.password);

    expect(response.status).toBe(200);
    const session = await getSession(cookieFrom(response));
    expect(session?.user.email).toBe(ada.email);
  });

  it('rejects a wrong password with a clear error', async () => {
    const response = await signIn(ada.email, 'wrong password');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      message: 'Invalid email or password',
    });
    expect(cookieFrom(response)).toBe('');
  });

  it('rejects an email nobody registered', async () => {
    const response = await signIn('nobody@example.com', ada.password);

    expect(response.status).toBe(401);
  });

  it('rejects invalid input with the shared message', async () => {
    const response = await signIn('not-an-email', ada.password);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: AUTH_MESSAGES.emailInvalid,
    });
  });
});

describe('sign-out', () => {
  it('ends the session', async () => {
    const cookie = cookieFrom(await signUp());
    expect(await getSession(cookie)).not.toBeNull();

    const response = await request('/sign-out', {body: {}, cookie});

    expect(response.status).toBe(200);
    expect(await getSession(cookie)).toBeNull();
  });
});

describe('origins', () => {
  it('accepts the Expo app, which sends its origin in expo-origin', async () => {
    await signUp();

    // A phone app sends no Origin header, only expo-origin.
    const response = await app.request(`${API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'expo-origin': 'exp://192.168.1.20:8081',
      },
      body: JSON.stringify({email: ada.email, password: ada.password}),
    });

    expect(response.status).toBe(200);
    expect(cookieFrom(response)).toContain('session_token');
  });

  it('refuses a website it does not trust', async () => {
    await signUp();
    const cookie = cookieFrom(await signIn(ada.email, ada.password));

    const response = await request('/sign-out', {
      body: {},
      cookie,
      headers: {origin: 'https://evil.example'},
    });

    expect(response.status).toBe(403);
  });
});
