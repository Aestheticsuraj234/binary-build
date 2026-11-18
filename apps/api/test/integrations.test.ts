import type {
  AgentSummary,
  ChatEvent,
  IntegrationDetail,
  IntegrationsCatalog,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import type {ModelBuilder} from '../src/engine/factory';
import type {
  CatalogEntry,
  ComposioAccount,
  ComposioGateway,
  ComposioToolDefinition,
  ComposioTools,
} from '../src/tools/composio';
import {composioRisk} from '../src/tools/composio';
import {statusOf} from '../src/tools/integrations';
import type {ScriptedStep} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';
import {WEB_URL} from './test-env';

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
  slug: 'x',
  name: 'X',
  logo: null,
  description: '',
  categories: [],
  authSchemes: ['OAUTH2'],
  managedSchemes: ['OAUTH2'],
  noAuth: false,
  toolsCount: 1,
  ...overrides,
});

const CATALOG: CatalogEntry[] = [
  entry({
    slug: 'gmail',
    name: 'Gmail',
    description: 'Email by Google.',
    categories: [{slug: 'email', name: 'Email'}],
    toolsCount: 40,
  }),
  entry({
    slug: 'github',
    name: 'GitHub',
    categories: [{slug: 'developer-tools', name: 'Developer tools'}],
    authSchemes: ['OAUTH2', 'API_KEY'],
  }),
  entry({
    slug: 'perplexityai',
    name: 'Perplexity AI',
    categories: [{slug: 'ai', name: 'AI'}],
    authSchemes: ['API_KEY'],
    managedSchemes: [],
  }),
  entry({
    slug: 'hackernews',
    name: 'Hacker News',
    categories: [{slug: 'news', name: 'News'}],
    authSchemes: [],
    managedSchemes: [],
    noAuth: true,
  }),
];

const TOOLS: Record<string, ComposioToolDefinition[]> = {
  gmail: [
    {
      slug: 'GMAIL_FETCH_EMAILS',
      description: 'Fetch emails.',
      inputSchema: {type: 'object', properties: {query: {type: 'string'}}},
      tags: ['readOnlyHint'],
    },
    {
      slug: 'GMAIL_SEND_EMAIL',
      description: 'Send an email.',
      inputSchema: {type: 'object', properties: {to: {type: 'string'}}},
      tags: ['openWorldHint'],
    },
  ],
  hackernews: [
    {
      slug: 'HACKERNEWS_GET_TOP_STORIES',
      description: 'Top stories.',
      inputSchema: {type: 'object', properties: {}},
      tags: ['readOnlyHint'],
    },
  ],
};

/** A stand-in for Composio, so tests never call it. */
class FakeComposio implements ComposioGateway {
  accountList: ComposioAccount[] = [];
  executed: string[] = [];
  loadedToolkits: string[][] = [];
  connectCalls: Array<{toolkit: string; callbackUrl: string}> = [];
  disconnected: string[] = [];
  isDown = false;

  private check() {
    if (this.isDown) {
      throw new Error('down');
    }
  }

  async catalog() {
    this.check();
    return CATALOG;
  }

  async accounts() {
    this.check();
    return this.accountList;
  }

  async connect(_userId: string, toolkit: string, callbackUrl: string) {
    this.connectCalls.push({toolkit, callbackUrl});
    return {redirectUrl: `https://connect.composio.dev/${toolkit}`};
  }

  async disconnect(_userId: string, toolkit: string) {
    this.disconnected.push(toolkit);
  }

  async toolsOf(toolkit: string) {
    return TOOLS[toolkit] ?? [];
  }

  async loadTools(_userId: string, toolkits: string[]): Promise<ComposioTools> {
    this.check();
    this.loadedToolkits.push(toolkits);
    return {
      definitions: toolkits.flatMap(slug => TOOLS[slug] ?? []),
      execute: async (slug, input) => {
        this.executed.push(`${slug}:${JSON.stringify(input)}`);
        return {messages: [{subject: 'Lunch?'}]};
      },
    };
  }
}

const fake = new FakeComposio();
let steps: ScriptedStep[] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(steps);
  models.push(model);
  return model;
};
const {app, db} = createTestApp({buildModel, composio: fake});
const withoutComposio = createTestApp();
let cookie: string;

async function catalog(): Promise<IntegrationsCatalog> {
  const response = await callApi(app, '/api/integrations', {cookie});
  return (await response.json()) as IntegrationsCatalog;
}

function statusesOf(list: IntegrationsCatalog) {
  return Object.fromEntries(list.integrations.map(i => [i.slug, i.status]));
}

const active = (toolkit: string): ComposioAccount => ({
  id: `ca_${toolkit}`,
  toolkit,
  status: 'ACTIVE',
  createdAt: '2026-11-18T00:00:00Z',
});

/** Hires an agent, starts a chat and sends one message. */
async function ask(message: string) {
  await callApi(app, '/api/keys/anthropic', {
    method: 'PUT',
    body: {key: 'sk-test-key-0000000000000000000000AAAA'},
    cookie,
  });
  const hired = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Mimi',
      role: 'Sorts email.',
      instructions: '',
      avatar: 'mimi',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    },
    cookie,
  });
  const {agent} = (await hired.json()) as {agent: AgentSummary};
  const started = await callApi(app, '/api/threads', {
    method: 'POST',
    body: {agentId: agent.id},
    cookie,
  });
  const {thread} = (await started.json()) as {thread: ThreadSummary};
  const response = await callApi(app, `/api/threads/${thread.id}/messages`, {
    method: 'POST',
    body: {message},
    cookie,
  });
  const events = (await readEvents(response)) as ChatEvent[];
  const calls = new Map<string, ToolCallRecord>();
  for (const event of events) {
    if (event.type === 'tool') {
      calls.set(event.call.id, event.call);
    }
  }
  return {events, calls: [...calls.values()]};
}

beforeEach(async () => {
  await resetDatabase(db);
  Object.assign(fake, {
    accountList: [],
    executed: [],
    loadedToolkits: [],
    connectCalls: [],
    disconnected: [],
    isDown: false,
  });
  models.length = 0;
  ({cookie} = await signUp(app));
});

afterAll(async () => {
  await db.$client.end();
  await withoutComposio.db.$client.end();
});

describe('statusOf', () => {
  const gmail = CATALOG[0]!;
  const now = Date.parse('2026-11-18T12:00:00Z');
  const account = (status: string, createdAt = '2026-11-18T11:55:00Z') => ({
    id: status,
    toolkit: 'gmail',
    status,
    createdAt,
  });

  it('is connected when any account works', () => {
    expect(
      statusOf(gmail, [account('EXPIRED'), account('ACTIVE')], [], now),
    ).toBe('connected');
  });

  it('needs attention when the account expired or failed', () => {
    expect(statusOf(gmail, [account('EXPIRED')], [], now)).toBe(
      'needs-attention',
    );
  });

  it('is pending only for a recent sign-in', () => {
    expect(statusOf(gmail, [account('INITIATED')], [], now)).toBe('pending');
    expect(
      statusOf(gmail, [account('INITIATED', '2026-11-18T09:00:00Z')], [], now),
    ).toBe('not-connected');
  });

  it("only counts this toolkit's accounts", () => {
    expect(
      statusOf(gmail, [{...account('ACTIVE'), toolkit: 'github'}], [], now),
    ).toBe('not-connected');
  });
});

describe('composioRisk', () => {
  it('is read only for tools tagged readOnlyHint', () => {
    expect(composioRisk(['readOnlyHint'])).toBe('read');
    expect(composioRisk(['destructiveHint'])).toBe('write');
  });
});

describe('the catalog', () => {
  it('is off without an API key', async () => {
    const response = await callApi(withoutComposio.app, '/api/integrations', {
      cookie,
    });

    expect(await response.json()).toEqual({
      available: false,
      integrations: [],
      categories: [],
      error: null,
    });
  });

  it('lists every toolkit with its auth methods and status', async () => {
    fake.accountList = [active('gmail')];

    const list = await catalog();

    expect(list.integrations.map(i => i.slug)).toEqual([
      'gmail',
      'github',
      'perplexityai',
      'hackernews',
    ]);
    expect(list.integrations[1]).toEqual({
      slug: 'github',
      name: 'GitHub',
      logo: null,
      description: '',
      categories: ['Developer tools'],
      authMethods: ['OAuth2', 'API Key'],
      isManaged: true,
      needsNoAccount: false,
      toolsCount: 1,
      status: 'not-connected',
    });
    expect(list.integrations[2]).toMatchObject({isManaged: false});
    expect(list.integrations[3]).toMatchObject({
      authMethods: ['No Auth'],
      needsNoAccount: true,
    });
    expect(statusesOf(list)).toMatchObject({
      gmail: 'connected',
      github: 'not-connected',
    });
    expect(list.categories.map(c => c.name)).toEqual([
      'AI',
      'Developer tools',
      'Email',
      'News',
    ]);
  });

  it('shows why when Composio is down, without failing', async () => {
    fake.isDown = true;

    const response = await callApi(app, '/api/integrations', {cookie});

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      integrations: [],
      error: "Couldn't reach Composio.",
    });
  });
});

describe('connecting', () => {
  it('sends the person to Composio, and back to Integrations', async () => {
    const response = await callApi(app, '/api/integrations/github/connect', {
      method: 'POST',
      body: {},
      cookie,
    });

    expect(await response.json()).toEqual({
      redirectUrl: 'https://connect.composio.dev/github',
    });
    expect(fake.connectCalls).toEqual([
      {
        toolkit: 'github',
        callbackUrl: `${WEB_URL}/integrations?connected=github`,
      },
    ]);
  });

  it('sends the phone back into the app', async () => {
    await callApi(app, '/api/integrations/github/connect', {
      method: 'POST',
      body: {returnTo: 'phone'},
      cookie,
    });

    expect(fake.connectCalls[0]!.callbackUrl).toBe('binary://integrations');
  });

  it('switches a no-account toolkit on and off, without Composio sign-in', async () => {
    const on = await callApi(app, '/api/integrations/hackernews/connect', {
      method: 'POST',
      body: {},
      cookie,
    });
    expect(await on.json()).toEqual({redirectUrl: null});
    expect(fake.connectCalls).toEqual([]);
    expect(statusesOf(await catalog()).hackernews).toBe('connected');

    await callApi(app, '/api/integrations/hackernews', {
      method: 'DELETE',
      cookie,
    });
    expect(statusesOf(await catalog()).hackernews).toBe('not-connected');
    expect(fake.disconnected).toEqual([]);
  });

  it('disconnects an account', async () => {
    const response = await callApi(app, '/api/integrations/gmail', {
      method: 'DELETE',
      cookie,
    });

    expect(response.status).toBe(200);
    expect(fake.disconnected).toEqual(['gmail']);
  });

  it("answers 404 for a toolkit Composio doesn't have", async () => {
    for (const slug of ['bank', 'Not A Slug']) {
      const response = await callApi(
        app,
        `/api/integrations/${encodeURIComponent(slug)}/connect`,
        {method: 'POST', body: {}, cookie},
      );
      expect(response.status).toBe(404);
    }
  });

  it('explains how to turn Composio on', async () => {
    const response = await callApi(
      withoutComposio.app,
      '/api/integrations/gmail/connect',
      {method: 'POST', body: {}, cookie},
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      message: 'Composio is off. Add COMPOSIO_API_KEY to .env to turn it on.',
    });
  });
});

describe('Manage', () => {
  it('shows accounts and tools with their risk', async () => {
    fake.accountList = [active('gmail'), active('github')];

    const response = await callApi(app, '/api/integrations/gmail', {cookie});
    const detail = (await response.json()) as IntegrationDetail;

    expect(detail.integration).toMatchObject({
      slug: 'gmail',
      status: 'connected',
    });
    expect(detail.accounts).toEqual([
      {id: 'ca_gmail', status: 'ACTIVE', createdAt: '2026-11-18T00:00:00Z'},
    ]);
    expect(detail.tools.map(t => [t.name, t.risk])).toEqual([
      ['GMAIL_FETCH_EMAILS', 'read'],
      ['GMAIL_SEND_EMAIL', 'write'],
    ]);
  });
});

describe('Composio tools in a chat', () => {
  it('only offers toolkits that are connected or switched on', async () => {
    fake.accountList = [
      active('gmail'),
      {...active('github'), status: 'EXPIRED'},
    ];
    await callApi(app, '/api/integrations/hackernews/connect', {
      method: 'POST',
      body: {},
      cookie,
    });
    steps = [{text: 'Hi!'}];

    await ask('Hello');

    expect(fake.loadedToolkits).toEqual([['gmail', 'hackernews']]);
  });

  it('runs a read tool through Composio', async () => {
    fake.accountList = [active('gmail')];
    steps = [
      {toolCalls: [{name: 'GMAIL_FETCH_EMAILS', input: {query: 'is:unread'}}]},
      {text: 'One email about lunch.'},
    ];

    const {calls} = await ask('Any new email?');

    expect(fake.executed).toEqual(['GMAIL_FETCH_EMAILS:{"query":"is:unread"}']);
    expect(calls[0]).toMatchObject({risk: 'read', status: 'done'});
  });

  it('blocks a write tool, which never reaches Composio', async () => {
    fake.accountList = [active('gmail')];
    steps = [
      {toolCalls: [{name: 'GMAIL_SEND_EMAIL', input: {to: 'ada@example.com'}}]},
      {text: "I can't send email yet."},
    ];

    const {calls} = await ask('Email Ada');

    expect(fake.executed).toEqual([]);
    expect(calls[0]).toMatchObject({risk: 'write', status: 'blocked'});
  });

  it("doesn't ask Composio for tools when nothing is connected", async () => {
    steps = [{text: 'Hi!'}];

    await ask('Hello');

    expect(fake.loadedToolkits).toEqual([]);
  });

  it('keeps chatting when Composio is down, and tells the model', async () => {
    fake.isDown = true;
    steps = [{text: 'Composio is down right now.'}];

    const {events} = await ask('Any new email?');

    expect(events.at(-1)).toMatchObject({type: 'done'});
    const prompt = JSON.stringify(models.at(-1)!.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('Composio');
  });
});
