import {apps as appsTable} from '@binary/db';
import type {AppWithTools, ToolsOverview} from '@binary/shared';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import {callApi, createTestApp, resetDatabase, signUp} from './helpers';
import type {TestShop} from './mcp-test-server';
import {closedUrl, SHOP_AUTHORIZATION, startTestShop} from './mcp-test-server';

const {app, db} = createTestApp();
let shop: TestShop;
let cookie: string;

function connect(body: object, as = cookie) {
  return callApi(app, '/api/apps', {method: 'POST', body, cookie: as});
}

async function overview(as = cookie): Promise<ToolsOverview> {
  const response = await callApi(app, '/api/apps', {cookie: as});
  return (await response.json()) as ToolsOverview;
}

beforeAll(async () => {
  shop = await startTestShop();
});

beforeEach(async () => {
  await resetDatabase(db);
  ({cookie} = await signUp(app));
});

afterAll(async () => {
  await shop.close();
  await db.$client.end();
});

describe('connecting an app', () => {
  it('tests the app, then saves it and lists its tools with their risk', async () => {
    const response = await connect({
      name: 'Shop',
      url: shop.url,
      authorization: SHOP_AUTHORIZATION,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as AppWithTools;
    expect(body.app).toMatchObject({
      name: 'Shop',
      url: shop.url,
      hasAuthorization: true,
    });
    expect(body.tools).toEqual([
      {
        name: 'shop_lookup_order',
        description: 'Look up an order by its number.',
        risk: 'read',
      },
      {
        name: 'shop_refund_order',
        description: 'Refund an order in full.',
        risk: 'write',
      },
    ]);
    // Listing tools never runs them.
    expect(shop.calls).toEqual([]);
  });

  it('encrypts the token and never sends it back', async () => {
    await connect({
      name: 'Shop',
      url: shop.url,
      authorization: SHOP_AUTHORIZATION,
    });

    const [row] = await db.select().from(appsTable);
    expect(row!.encryptedAuthorization).toMatch(/^v1\./);
    expect(row!.encryptedAuthorization).not.toContain('shop-secret');
    const listed = JSON.stringify(await overview());
    expect(listed).not.toContain('shop-secret');
    expect(listed).not.toContain('v1.');
  });

  it("doesn't save an app that refuses the token", async () => {
    const response = await connect({
      name: 'Shop',
      url: shop.url,
      authorization: 'Bearer wrong',
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: 'APP_UNREACHABLE',
      message: expect.stringContaining(
        'Check the Authorization header',
      ) as string,
    });
    expect(await db.select().from(appsTable)).toEqual([]);
  });

  it("doesn't save an app that can't be reached", async () => {
    const response = await connect({name: 'Gone', url: await closedUrl()});

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({code: 'APP_UNREACHABLE'});
    expect(await db.select().from(appsTable)).toEqual([]);
  });

  it('rejects a bad URL and a name already in use', async () => {
    const bad = await connect({name: 'Shop', url: 'ftp://example.com'});
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({code: 'INVALID_INPUT'});

    await connect({
      name: 'Shop',
      url: shop.url,
      authorization: SHOP_AUTHORIZATION,
    });
    const twice = await connect({
      name: 'Shop',
      url: shop.url,
      authorization: SHOP_AUTHORIZATION,
    });
    expect(twice.status).toBe(409);
    expect(await twice.json()).toEqual({
      code: 'CONFLICT',
      message: 'You already have an app called Shop.',
    });
  });
});

describe('the Apps & tools page', () => {
  it('lists the built-in tools', async () => {
    const {builtIn, apps} = await overview();

    expect(builtIn.map(t => [t.name, t.risk])).toEqual([
      ['get_current_time', 'read'],
      ['fetch_web_page', 'read'],
    ]);
    expect(apps).toEqual([]);
  });

  it('shows an app that went down with an error, and the others still work', async () => {
    await connect({
      name: 'Shop',
      url: shop.url,
      authorization: SHOP_AUTHORIZATION,
    });
    const [user] = await db.select().from(appsTable);
    await db.insert(appsTable).values({
      userId: user!.userId,
      name: 'Gone',
      url: await closedUrl(),
    });

    const {apps} = await overview();

    expect(
      apps.map(a => [a.app.name, a.tools.length, Boolean(a.error)]),
    ).toEqual([
      ['Shop', 2, false],
      ['Gone', 0, true],
    ]);
    expect(apps[1]!.error).toContain("Couldn't reach 127.0.0.1");
  });

  it('removes an app', async () => {
    const created = await connect({
      name: 'Shop',
      url: shop.url,
      authorization: SHOP_AUTHORIZATION,
    });
    const {app: summary} = (await created.json()) as AppWithTools;

    const response = await callApi(app, `/api/apps/${summary.id}`, {
      method: 'DELETE',
      cookie,
    });

    expect(response.status).toBe(200);
    expect((await overview()).apps).toEqual([]);
  });

  it("treats another person's app like a missing one", async () => {
    const created = await connect({
      name: 'Shop',
      url: shop.url,
      authorization: SHOP_AUTHORIZATION,
    });
    const {app: summary} = (await created.json()) as AppWithTools;
    const grace = await signUp(app, 'grace@example.com');

    for (const method of ['GET', 'DELETE']) {
      const response = await callApi(app, `/api/apps/${summary.id}`, {
        method,
        cookie: grace.cookie,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: 'NOT_FOUND',
        message: 'There is no app here.',
      });
    }
    expect((await overview(grace.cookie)).apps).toEqual([]);
    expect((await overview()).apps).toHaveLength(1);
  });
});
