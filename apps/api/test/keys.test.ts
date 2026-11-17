import {providerKeys, sql} from '@binary/db';
import {ENGINE_MESSAGES} from '@binary/shared';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import {callApi, createTestApp, resetDatabase, signUp} from './helpers';

const {app, db, vault} = createTestApp();

const openAiKey = 'sk-proj-test-AAAAAAAAAAAAAAAAAAAA1234';
const newOpenAiKey = 'sk-proj-test-BBBBBBBBBBBBBBBBBBBB9876';

let cookie: string;
let userId: string;

beforeEach(async () => {
  await resetDatabase(db);
  ({cookie, userId} = await signUp(app));
});

afterAll(async () => {
  await db.$client.end();
});

function saveKey(provider: string, key: string, as = cookie) {
  return callApi(app, `/api/keys/${provider}`, {
    method: 'PUT',
    body: {key},
    cookie: as,
  });
}

async function listKeys(as = cookie) {
  const response = await callApi(app, '/api/keys', {cookie: as});
  return (await response.json()) as {
    keys: Array<{provider: string; connected: boolean; last4: string | null}>;
  };
}

describe('GET /api/keys', () => {
  it('lists every provider as not connected at first', async () => {
    const {keys} = await listKeys();

    expect(keys).toEqual([
      {provider: 'openai', connected: false, last4: null, updatedAt: null},
      {provider: 'anthropic', connected: false, last4: null, updatedAt: null},
      {provider: 'google', connected: false, last4: null, updatedAt: null},
    ]);
  });

  it('needs a signed-in person', async () => {
    const response = await callApi(app, '/api/keys');

    expect(response.status).toBe(401);
  });
});

describe('PUT /api/keys/:provider', () => {
  it('saves a key and only ever shows its last 4 characters', async () => {
    const response = await saveKey('openai', openAiKey);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      key: {provider: 'openai', connected: true, last4: '1234'},
    });
    expect(body).not.toContain(openAiKey);

    const listed = JSON.stringify(await listKeys());
    expect(listed).toContain('"last4":"1234"');
    expect(listed).not.toContain(openAiKey);
  });

  it('stores only the encrypted key in the database', async () => {
    await saveKey('openai', openAiKey);

    const rows = await db.select().from(providerKeys);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.encryptedKey).not.toContain(openAiKey);
    expect(row?.encryptedKey.startsWith('v1.')).toBe(true);
    expect(row?.last4).toBe('1234');
    // And it really is this person's key, readable only with the master key.
    expect(vault.decrypt(row!.encryptedKey, {userId, provider: 'openai'})).toBe(
      openAiKey,
    );

    // Nothing in the whole table contains the plain key.
    const dump = await db.execute(sql`SELECT * FROM provider_keys`);
    expect(JSON.stringify(dump)).not.toContain(openAiKey);
  });

  it('replaces a key that was already saved', async () => {
    await saveKey('openai', openAiKey);

    const response = await saveKey('openai', newOpenAiKey);

    expect(await response.json()).toMatchObject({key: {last4: '9876'}});
    const rows = await db.select().from(providerKeys);
    expect(rows).toHaveLength(1);
    expect(
      vault.decrypt(rows[0]!.encryptedKey, {userId, provider: 'openai'}),
    ).toBe(newOpenAiKey);
  });

  it('keeps each provider separate', async () => {
    await saveKey('openai', openAiKey);
    await saveKey('google', 'AIzaTestKey-000000000000000000wxyz');

    const {keys} = await listKeys();

    expect(keys.map(k => [k.provider, k.connected, k.last4])).toEqual([
      ['openai', true, '1234'],
      ['anthropic', false, null],
      ['google', true, 'wxyz'],
    ]);
  });

  it("does not show one person's keys to another", async () => {
    await saveKey('openai', openAiKey);
    const grace = await signUp(app, 'grace@example.com');

    const {keys} = await listKeys(grace.cookie);

    expect(keys.every(k => !k.connected)).toBe(true);
  });

  it('rejects a key that is too short, with the shared message', async () => {
    const response = await saveKey('openai', 'sk-short');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_INPUT',
      message: ENGINE_MESSAGES.keyTooShort,
    });
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it('rejects an unknown provider', async () => {
    const response = await saveKey('acme', openAiKey);

    expect(response.status).toBe(404);
  });

  it('needs a signed-in person', async () => {
    const response = await saveKey('openai', openAiKey, '');

    expect(response.status).toBe(401);
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it('refuses a form posted from another website', async () => {
    const response = await callApi(app, '/api/keys/openai', {
      method: 'PUT',
      cookie,
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/keys/:provider', () => {
  it('removes a saved key', async () => {
    await saveKey('anthropic', 'sk-ant-test-CCCCCCCCCCCCCCCCCCCC5555');

    const response = await callApi(app, '/api/keys/anthropic', {
      method: 'DELETE',
      cookie,
    });

    expect(await response.json()).toEqual({
      key: {
        provider: 'anthropic',
        connected: false,
        last4: null,
        updatedAt: null,
      },
    });
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it('is fine when there is nothing to remove', async () => {
    const response = await callApi(app, '/api/keys/google', {
      method: 'DELETE',
      cookie,
    });

    expect(response.status).toBe(200);
  });
});
