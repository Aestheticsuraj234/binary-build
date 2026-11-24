import type {LookupAddress} from 'node:dns';
import http from 'node:http';
import type {AddressInfo} from 'node:net';

import type {
  AgentSummary,
  ApprovalDecided,
  ChatEvent,
  ComputersOverview,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import {BrowserManager} from '../src/browser/manager';
import type {ModelBuilder} from '../src/engine/factory';
import {createHostResolver} from '../src/tools/safe-fetch';
import type {ScriptedStep, TestApp} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';

// --- A small site on this machine, standing in for the public web. -------

let port = 0;
const site = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://shop.test');
  const page = (title: string, body: string) => {
    response.writeHead(200, {'content-type': 'text/html'});
    response.end(`<!doctype html><title>${title}</title><body>${body}</body>`);
  };
  if (url.pathname === '/') {
    page(
      'Shop',
      `<h1>Welcome to the shop</h1>
       <a href="/next">More information</a>
       <form action="/search"><input name="q" aria-label="Search"><button>Go</button></form>
       <img src="http://127.0.0.2:${port}/pixel.png" alt="">`,
    );
  } else if (url.pathname === '/next') {
    page('Next', '<p>You followed the link.</p>');
  } else if (url.pathname === '/search') {
    page('Results', `<p>Results for ${url.searchParams.get('q') ?? ''}</p>`);
  } else if (url.pathname === '/redirect') {
    response.writeHead(302, {location: 'http://evil.test/'});
    response.end();
  } else {
    response.writeHead(404).end();
  }
});

/**
 * Test DNS: shop.test is the site above, evil.test is a private address.
 * Only 127.0.0.1 counts as "public" here, so the site can be reached and
 * everything else private is refused, exactly as in real use.
 */
const resolve = createHostResolver({
  isAllowedAddress: address => address === '127.0.0.1',
  lookup: ((
    host: string,
    _options: unknown,
    callback: (error: Error | null, addresses: LookupAddress[]) => void,
  ) => {
    const table: Record<string, string> = {
      'shop.test': '127.0.0.1',
      'evil.test': '10.0.0.5',
    };
    const address = table[host];
    if (!address) {
      callback(Object.assign(new Error('not found'), {code: 'ENOTFOUND'}), []);
    } else {
      callback(null, [{address, family: 4}]);
    }
  }) as never,
});

const browsers = new BrowserManager({resolve, available: true, maxOpen: 2});

// --- The app, with fake models. -------------------------------------------

let scripts: ScriptedStep[][] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(scripts.shift() ?? [{text: 'OK.'}]);
  models.push(model);
  return model;
};
const {app, db} = createTestApp({
  buildModel,
  builtInTools: () => [],
  browsers,
});
const noBrowsers = createTestApp({buildModel, builtInTools: () => []});

let cookie: string;
const shop = (path = '/') => `http://shop.test:${port}${path}`;

async function hire(target: TestApp = app): Promise<AgentSummary> {
  const response = await callApi(target, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Nova',
      role: 'Finds and reads sources.',
      instructions: '',
      avatar: 'nova',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      computers: ['browser'],
    },
    cookie,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

async function newChat(agentId: string, target: TestApp = app) {
  const response = await callApi(target, '/api/threads', {
    method: 'POST',
    body: {agentId},
    cookie,
  });
  return ((await response.json()) as {thread: ThreadSummary}).thread.id;
}

/** Sends a message that makes one tool call; returns its card. */
async function step(
  threadId: string,
  call: {name: string; input: object},
  target: TestApp = app,
): Promise<ToolCallRecord> {
  scripts.push([{toolCalls: [call]}, {text: 'There.'}]);
  const response = await callApi(target, `/api/threads/${threadId}/messages`, {
    method: 'POST',
    body: {message: 'Go on'},
    cookie,
  });
  const latest = new Map<string, ToolCallRecord>();
  for (const event of (await readEvents(response)) as ChatEvent[]) {
    if (event.type === 'tool') {
      latest.set(event.call.id, event.call);
    }
  }
  return [...latest.values()][0]!;
}

async function approve(call: ToolCallRecord): Promise<ApprovalDecided> {
  scripts.push([{text: 'Done.'}]);
  const response = await callApi(
    app,
    `/api/approvals/${call.approvalId}/approve`,
    {method: 'POST', cookie},
  );
  return (await response.json()) as ApprovalDecided;
}

async function computers(): Promise<ComputersOverview> {
  const response = await callApi(app, '/api/computers', {cookie});
  return (await response.json()) as ComputersOverview;
}

/** Opens the shop in a new chat with a browser character. */
async function openShop() {
  const agent = await hire();
  const threadId = await newChat(agent.id);
  const call = await step(threadId, {
    name: 'browser_open',
    input: {url: shop()},
  });
  return {threadId, call};
}

beforeAll(async () => {
  await new Promise<void>(done => site.listen(0, '127.0.0.1', done));
  port = (site.address() as AddressInfo).port;
});

beforeEach(async () => {
  await resetDatabase(db);
  await browsers.closeAll();
  scripts = [];
  models.length = 0;
  ({cookie} = await signUp(app));
  await callApi(app, '/api/keys/anthropic', {
    method: 'PUT',
    body: {key: 'sk-test-key-0000000000000000000000AAAA'},
    cookie,
  });
});

afterAll(async () => {
  await browsers.closeAll();
  site.close();
  await db.$client.end();
  await noBrowsers.db.$client.end();
});

describe('looking', {timeout: 30_000}, () => {
  it('opens a public page without asking; the person sees a screenshot', async () => {
    const {threadId, call} = await openShop();

    expect(call).toMatchObject({
      name: 'browser_open',
      risk: 'read',
      status: 'done',
      output: {title: 'Shop', url: shop()},
    });
    // The model gets the text and a numbered list, not the screenshot.
    const output = call.output as {text: string; elements: string};
    expect(output.text).toContain('Welcome to the shop');
    expect(output.elements).toBe(
      '[1] link "More information"\n[2] textbox "Search"\n[3] button "Go"',
    );
    expect(call.images).toEqual([
      {id: expect.any(String) as string, mime: 'image/jpeg'},
    ]);
    const image = await callApi(app, `/api/images/${call.images![0]!.id}`, {
      cookie,
    });
    expect(image.headers.get('content-type')).toBe('image/jpeg');
    expect(call.output).toMatchObject({
      images:
        "The person sees a screenshot of this page; you can't, so go by the text.",
    });
    const sent = JSON.stringify(models.at(-1)!.doStreamCalls[1]!.prompt);
    expect(sent).toContain('Welcome to the shop');
    expect(sent).not.toContain('/9j/'); // A JPEG's base64 start: no image.

    // Its browser is listed with the other computers.
    expect((await computers()).computers).toMatchObject([
      {kind: 'browser', threadId, agentName: 'Nova', url: shop()},
    ]);
  });
});

describe('acting', {timeout: 30_000}, () => {
  it('asks before clicking, then clicks in the same browser', async () => {
    const {threadId} = await openShop();
    const [before] = (await computers()).computers;

    const click = await step(threadId, {
      name: 'browser_click',
      input: {ref: 1, element: 'More information'},
    });
    expect(click).toMatchObject({status: 'waiting', risk: 'computer'});

    const decided = await approve(click);
    expect(decided.call).toMatchObject({
      status: 'done',
      output: {title: 'Next', url: shop('/next')},
    });
    expect(decided.call.images).toHaveLength(1);
    const [after] = (await computers()).computers;
    expect(after!.id).toBe(before!.id);
  });

  it('types into a field after approval', async () => {
    const {threadId} = await openShop();
    const type = await step(threadId, {
      name: 'browser_type',
      input: {ref: 2, element: 'Search', text: 'mugs', submit: true},
    });

    const decided = await approve(type);

    expect(decided.call).toMatchObject({
      status: 'done',
      output: {title: 'Results'},
    });
    expect((decided.call.output as {text: string}).text).toContain(
      'Results for mugs',
    );
  });

  it("does nothing when the element isn't what it said", async () => {
    const {threadId} = await openShop();
    const click = await step(threadId, {
      name: 'browser_click',
      input: {ref: 1, element: 'Delete my account'},
    });

    const decided = await approve(click);

    expect(decided.call.status).toBe('failed');
    expect(decided.call.error).toBe(
      'Element 1 is link "More information" now, not "Delete my account". ' +
        'Nothing was done. Read the page again.',
    );
  });
});

describe('only public addresses', {timeout: 30_000}, () => {
  it.each([
    ['a private network', 'http://10.0.0.1/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['this machine', 'http://127.0.0.2/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['a name that points somewhere private', 'http://evil.test/'],
  ])('refuses %s', async (_what, url) => {
    const agent = await hire();
    const threadId = await newChat(agent.id);

    const call = await step(threadId, {name: 'browser_open', input: {url}});

    expect(call).toMatchObject({
      status: 'failed',
      error: 'Binary only opens public web addresses.',
    });
  });

  it('refuses other kinds of address', async () => {
    const agent = await hire();
    const threadId = await newChat(agent.id);

    const call = await step(threadId, {
      name: 'browser_open',
      input: {url: 'file:///etc/passwd'},
    });

    expect(call).toMatchObject({
      status: 'failed',
      error: 'Binary only opens http and https addresses.',
    });
  });

  it('blocks a redirect to a private address', async () => {
    const agent = await hire();
    const threadId = await newChat(agent.id);

    const call = await step(threadId, {
      name: 'browser_open',
      input: {url: shop('/redirect')},
    });

    expect(call.status).toBe('failed');
    expect(await browsers.blockedHosts()).toContain('evil.test:80');
  });

  it('stops a page from loading anything from this machine or the network', async () => {
    await openShop();

    // The shop's <img> points at 127.0.0.2: the proxy refused it.
    expect(await browsers.blockedHosts()).toContain(`127.0.0.2:${port}`);
  });
});

describe('closing', {timeout: 30_000}, () => {
  it('Close closes it, and deleting the chat does too', async () => {
    const {threadId} = await openShop();
    const [browser] = (await computers()).computers;

    await callApi(app, `/api/computers/${browser!.id}/stop`, {
      method: 'POST',
      cookie,
    });
    expect((await computers()).computers).toEqual([]);

    await step(threadId, {name: 'browser_open', input: {url: shop()}});
    expect((await computers()).computers).toHaveLength(1);
    await callApi(app, `/api/threads/${threadId}`, {method: 'DELETE', cookie});
    expect((await computers()).computers).toEqual([]);
  });

  it('keeps at most a few open: the least recently used closes', async () => {
    const first = await openShop();
    const second = await openShop();
    await openShop();

    const open = (await computers()).computers.map(c => c.threadId);
    expect(open).toHaveLength(2);
    expect(open).not.toContain(first.threadId);
    expect(open).toContain(second.threadId);
  });

  it('closes by itself when idle', async () => {
    const quick = new BrowserManager({resolve, available: true, idleMs: 200});
    try {
      await quick.ensure({userId: 'u', threadId: 't', agentId: 'a'});
      expect(quick.listForUser('u')).toHaveLength(1);
      await new Promise(done => setTimeout(done, 500));
      expect(quick.listForUser('u')).toEqual([]);
    } finally {
      await quick.closeAll();
    }
  });
});

describe('without Chromium', () => {
  it('offers no browser tools, and says so', async () => {
    ({cookie} = await signUp(noBrowsers.app, 'lin@example.com'));
    await callApi(noBrowsers.app, '/api/keys/anthropic', {
      method: 'PUT',
      body: {key: 'sk-test-key-0000000000000000000000AAAA'},
      cookie,
    });
    const agent = await hire(noBrowsers.app);
    const threadId = await newChat(agent.id, noBrowsers.app);
    scripts.push([{text: "I can't open pages here."}]);

    const sent = await callApi(
      noBrowsers.app,
      `/api/threads/${threadId}/messages`,
      {method: 'POST', body: {message: 'Open example.com'}, cookie},
    );
    await sent.text();

    const call = models.at(-1)!.doStreamCalls[0]!;
    expect(call.tools ?? []).toEqual([]);
    expect(JSON.stringify(call.prompt)).toContain('there is no Chromium');
  });
});
