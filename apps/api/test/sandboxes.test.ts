import {eq, sandboxes, sql} from '@binary/db';
import type {
  AgentSummary,
  ApprovalDecided,
  ChatEvent,
  SandboxesOverview,
  ThreadDetail,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import type {ModelBuilder} from '../src/engine/factory';
import {FAKE_PNG, FakeSandboxProvider} from './fake-sandbox';
import type {ScriptedStep, TestApp} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';

/** One script per model built: the answer, then each follow-up. */
let scripts: ScriptedStep[][] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(scripts.shift() ?? [{text: 'OK.'}]);
  models.push(model);
  return model;
};

const provider = new FakeSandboxProvider();
// No built-in tools, so each test sees only the sandbox's.
const withE2B = createTestApp({
  buildModel,
  builtInTools: () => [],
  sandboxProvider: provider,
});
const withoutE2B = createTestApp({buildModel, builtInTools: () => []});
const db = withE2B.db;

let cookie: string;

const PLOT = 'import matplotlib.pyplot as plt\nplt.plot([1, 4, 9])\nplt.show()';

async function hire(
  app: TestApp = withE2B.app,
  as = cookie,
): Promise<AgentSummary> {
  const response = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Bolt',
      role: 'Writes and runs code.',
      instructions: '',
      avatar: 'bolt',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      computer: 'cloud_sandbox',
    },
    cookie: as,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

async function newChat(agentId: string, app = withE2B.app): Promise<string> {
  const response = await callApi(app, '/api/threads', {
    method: 'POST',
    body: {agentId},
    cookie,
  });
  return ((await response.json()) as {thread: ThreadSummary}).thread.id;
}

/** Sends a message; returns the tool cards as they ended up. */
async function send(threadId: string, message: string, app = withE2B.app) {
  const response = await callApi(app, `/api/threads/${threadId}/messages`, {
    method: 'POST',
    body: {message},
    cookie,
  });
  const latest = new Map<string, ToolCallRecord>();
  for (const event of (await readEvents(response)) as ChatEvent[]) {
    if (event.type === 'tool') {
      latest.set(event.call.id, event.call);
    }
  }
  return [...latest.values()];
}

async function approve(id: string, as = cookie): Promise<ApprovalDecided> {
  const response = await callApi(withE2B.app, `/api/approvals/${id}/approve`, {
    method: 'POST',
    cookie: as,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as ApprovalDecided;
}

async function getThread(id: string): Promise<ThreadDetail> {
  const response = await callApi(withE2B.app, `/api/threads/${id}`, {cookie});
  return (await response.json()) as ThreadDetail;
}

async function overview(app = withE2B.app): Promise<SandboxesOverview> {
  const response = await callApi(app, '/api/sandboxes', {cookie});
  return (await response.json()) as SandboxesOverview;
}

/** Bolt asks to run `code` in a new chat; returns the chat and request. */
async function askToRun(code = PLOT) {
  const agent = await hire();
  const threadId = await newChat(agent.id);
  scripts.push([
    {toolCalls: [{name: 'run_code', input: {language: 'python', code}}]},
    {text: "I'd like to run some Python. Approve it and I'll show you."},
  ]);
  const [call] = await send(threadId, 'Plot the squares of 1 to 3');
  return {agent, threadId, call: call!};
}

beforeEach(async () => {
  await resetDatabase(db);
  provider.reset();
  scripts = [];
  models.length = 0;
  ({cookie} = await signUp(withE2B.app));
  await callApi(withE2B.app, '/api/keys/anthropic', {
    method: 'PUT',
    body: {key: 'sk-test-key-0000000000000000000000AAAA'},
    cookie,
  });
});

afterAll(async () => {
  await db.$client.end();
  await withoutE2B.db.$client.end();
});

describe('running code', () => {
  it('asks first and shows the exact code, before any sandbox starts', async () => {
    const {call} = await askToRun();

    expect(call).toMatchObject({
      name: 'run_code',
      risk: 'computer',
      status: 'waiting',
      input: {language: 'python', code: PLOT},
    });
    expect(provider.created).toBe(0);
  });

  it('asks even when the character may accept edits', async () => {
    const agent = await hire();
    await callApi(withE2B.app, `/api/agents/${agent.id}`, {
      method: 'PATCH',
      body: {
        name: 'Bolt',
        role: 'Writes and runs code.',
        instructions: '',
        avatar: 'bolt',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        computer: 'cloud_sandbox',
        approvalMode: 'accept_edits',
      },
      cookie,
    });
    const threadId = await newChat(agent.id);
    scripts.push([
      {toolCalls: [{name: 'run_command', input: {command: 'ls'}}]},
      {text: 'Asked.'},
    ]);

    const [call] = await send(threadId, 'List the files');

    expect(call).toMatchObject({status: 'waiting', risk: 'computer'});
    expect(provider.runs).toEqual([]);
  });

  it('approving starts the sandbox and runs the code; the chart is for the person only', async () => {
    const {threadId, call} = await askToRun();
    scripts.push([{text: 'Here are the squares, plotted.'}]);

    const decided = await approve(call.approvalId!);

    expect(provider.created).toBe(1);
    expect(provider.runs).toEqual([PLOT]);
    expect(decided.call.status).toBe('done');
    expect(decided.call.images).toEqual([
      {id: expect.any(String) as string, mime: 'image/png'},
    ]);
    // The model reads a note about the chart, never the image.
    expect(decided.call.output).toMatchObject({
      charts: 'Made 1 chart. The person can see it in the chat; you cannot.',
    });
    expect(JSON.stringify(decided.call.output)).not.toContain(FAKE_PNG);
    const followUp = JSON.stringify(models.at(-1)!.doStreamCalls[0]!.prompt);
    expect(followUp).toContain('Made 1 chart');
    expect(followUp).not.toContain(FAKE_PNG);

    // The person gets the image itself.
    const image = await callApi(
      withE2B.app,
      `/api/images/${decided.call.images![0]!.id}`,
      {cookie},
    );
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await image.arrayBuffer()).toString('base64')).toBe(
      FAKE_PNG,
    );

    // The chat shows its sandbox is on.
    const thread = await getThread(threadId);
    expect(thread.sandbox).toMatchObject({threadId, agentName: 'Bolt'});
    expect(thread.messages[1]!.toolCalls[0]!.images).toHaveLength(1);
  });

  it('keeps a file written in one message for the next', async () => {
    const agent = await hire();
    const threadId = await newChat(agent.id);
    scripts.push([
      {
        toolCalls: [
          {name: 'write_file', input: {path: 'notes.txt', content: 'hello'}},
        ],
      },
      {text: 'May I write it?'},
    ]);
    const [write] = await send(threadId, 'Save "hello" to notes.txt');
    scripts.push([{text: 'Saved.'}]);
    await approve(write!.approvalId!);

    scripts.push([
      {toolCalls: [{name: 'read_file', input: {path: 'notes.txt'}}]},
      {text: 'It says hello.'},
    ]);
    const [read] = await send(threadId, 'What does notes.txt say?');

    // Reading is a read tool: it runs at once, in the same sandbox.
    expect(read).toMatchObject({
      status: 'done',
      output: {path: '/home/user/notes.txt', content: 'hello'},
    });
    expect(provider.created).toBe(1);
  });

  it('reading never starts a sandbox, and says nothing has run', async () => {
    const agent = await hire();
    const threadId = await newChat(agent.id);
    scripts.push([
      {toolCalls: [{name: 'list_files', input: {}}]},
      {text: 'Nothing yet.'},
    ]);

    const [call] = await send(threadId, 'What files are there?');

    expect(call!.status).toBe('done');
    expect(JSON.stringify(call!.output)).toContain('nothing has run yet');
    expect(provider.created).toBe(0);
  });

  it('starts one sandbox per chat, even when two runs start it at once', async () => {
    const agent = await hire();
    const threadId = await newChat(agent.id);
    scripts.push([
      {
        toolCalls: [
          {name: 'run_code', input: {code: 'print(1)'}},
          {name: 'run_code', input: {code: 'print(2)'}},
        ],
      },
      {text: 'Two runs, please.'},
    ]);
    const calls = await send(threadId, 'Run both');
    provider.createDelayMs = 30;
    scripts.push([{text: 'One.'}], [{text: 'Two.'}]);

    await Promise.all(calls.map(call => approve(call.approvalId!)));

    const running = await db
      .select()
      .from(sandboxes)
      .where(eq(sandboxes.status, 'running'));
    expect(running).toHaveLength(1);
    // Both ran, in the sandbox that won; the spare one was stopped.
    expect(provider.machines.get(running[0]!.externalId)!.runs.sort()).toEqual([
      'print(1)',
      'print(2)',
    ]);
    expect(provider.killed).toHaveLength(provider.created - 1);
  });
});

describe('stopping', () => {
  async function runningSandbox() {
    const {threadId, call} = await askToRun('print(1)');
    scripts.push([{text: 'Done.'}]);
    await approve(call.approvalId!);
    const [sandbox] = (await overview()).sandboxes;
    return {threadId, sandbox: sandbox!};
  }

  it('lists what runs, and Stop stops it', async () => {
    const {threadId, sandbox} = await runningSandbox();
    expect(sandbox).toMatchObject({threadId, agentName: 'Bolt'});

    const response = await callApi(
      withE2B.app,
      `/api/sandboxes/${sandbox.id}/stop`,
      {method: 'POST', cookie},
    );

    expect(response.status).toBe(200);
    expect(provider.killed).toEqual(['sbx_1']);
    expect((await overview()).sandboxes).toEqual([]);
    expect((await getThread(threadId)).sandbox).toBeNull();
  });

  it('deleting a chat stops its sandbox', async () => {
    const {threadId} = await runningSandbox();

    await callApi(withE2B.app, `/api/threads/${threadId}`, {
      method: 'DELETE',
      cookie,
    });

    expect(provider.killed).toEqual(['sbx_1']);
    expect((await overview()).sandboxes).toEqual([]);
  });

  it('an idle sandbox is gone, and the next run starts a fresh one', async () => {
    const {threadId} = await runningSandbox();
    // Past its idle time: E2B has stopped it.
    await db
      .update(sandboxes)
      .set({expiresAt: sql`now() - interval '1 minute'`});
    provider.machines.get('sbx_1')!.alive = false;
    expect((await overview()).sandboxes).toEqual([]);

    scripts.push([
      {toolCalls: [{name: 'run_code', input: {code: 'print(2)'}}]},
      {text: 'Again?'},
    ]);
    const [call] = await send(threadId, 'Run it again');
    scripts.push([{text: 'Done.'}]);
    await approve(call!.approvalId!);

    expect(provider.created).toBe(2);
  });

  it("keeps someone else's sandboxes out of reach", async () => {
    const {sandbox} = await runningSandbox();
    const {cookie: other} = await signUp(withE2B.app, 'grace@example.com');

    const stop = await callApi(
      withE2B.app,
      `/api/sandboxes/${sandbox.id}/stop`,
      {method: 'POST', cookie: other},
    );
    expect(stop.status).toBe(404);
    expect(provider.killed).toEqual([]);
  });

  it("keeps someone else's charts out of reach", async () => {
    const {call} = await askToRun(PLOT);
    scripts.push([{text: 'Plotted.'}]);
    const decided = await approve(call.approvalId!);
    const {cookie: other} = await signUp(withE2B.app, 'grace@example.com');

    const image = await callApi(
      withE2B.app,
      `/api/images/${decided.call.images![0]!.id}`,
      {cookie: other},
    );
    expect(image.status).toBe(404);
  });
});

describe('without an E2B key', () => {
  it('offers no sandbox tools, and nothing breaks', async () => {
    ({cookie} = await signUp(withoutE2B.app, 'lin@example.com'));
    await callApi(withoutE2B.app, '/api/keys/anthropic', {
      method: 'PUT',
      body: {key: 'sk-test-key-0000000000000000000000AAAA'},
      cookie,
    });
    const agent = await hire(withoutE2B.app);
    expect(agent.computer).toBe('cloud_sandbox');
    const threadId = await newChat(agent.id, withoutE2B.app);
    scripts.push([{text: "I can't run code here."}]);

    await send(threadId, 'Plot something', withoutE2B.app);

    const call = models.at(-1)!.doStreamCalls[0]!;
    expect(call.tools ?? []).toEqual([]);
    expect(JSON.stringify(call.prompt)).toContain("there's no E2B key");
    expect(await overview(withoutE2B.app)).toEqual({
      available: false,
      idleMinutes: 5,
      sandboxes: [],
    });
  });
});
