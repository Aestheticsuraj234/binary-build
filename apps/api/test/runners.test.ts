import type {
  AgentSummary,
  ApprovalDecided,
  ChatEvent,
  RunnerAdded,
  RunnerEvent,
  RunnerJobEnvelope,
  RunnerResult,
  RunnerSummary,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import type {ModelBuilder} from '../src/engine/factory';
import type {ScriptedStep} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';
import {API_URL} from './test-env';

let scripts: ScriptedStep[][] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(scripts.shift() ?? [{text: 'OK.'}]);
  models.push(model);
  return model;
};
const {app, db} = createTestApp({buildModel, builtInTools: () => []});

let cookie: string;

// --- A fake Runner: the real Runner endpoints, answered by the test. -----

function runnerCall(path: string, token: string | null, body: unknown = {}) {
  return app.request(`${API_URL}/api/runner${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? {authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Adds a computer, pairs it with its code, and says hello (online). */
async function pairRunner(name = 'Test Mac') {
  const added = (await (
    await callApi(app, '/api/runners', {method: 'POST', body: {name}, cookie})
  ).json()) as RunnerAdded;
  const paired = (await (
    await runnerCall('/pair', null, {code: added.code.toLowerCase()})
  ).json()) as {token: string; runnerId: string};
  await runnerCall('/hello', paired.token, {
    os: 'macOS 27.0.0',
    version: '0.1.0',
    folders: ['/Users/test/project'],
  });
  return {...paired, code: added.code};
}

/** Waits for the next job, like the Runner's long poll. */
async function takeJob(token: string): Promise<RunnerJobEnvelope> {
  const response = await runnerCall('/jobs/next', token);
  const body = (await response.json()) as {job: RunnerJobEnvelope | null};
  if (!body.job) {
    throw new Error('No job came.');
  }
  return body.job;
}

async function answerJob(
  token: string,
  id: string,
  result: RunnerResult,
  events: RunnerEvent[] = [],
) {
  if (events.length > 0) {
    await runnerCall(`/jobs/${id}/events`, token, {events});
  }
  await runnerCall(`/jobs/${id}/result`, token, result);
}

// --- Characters and chats. --------------------------------------------------

async function hire(extra: object): Promise<AgentSummary> {
  const response = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Bolt',
      role: 'Works on my code.',
      instructions: '',
      avatar: 'bolt',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      ...extra,
    },
    cookie,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

async function newChat(agentId: string) {
  const response = await callApi(app, '/api/threads', {
    method: 'POST',
    body: {agentId},
    cookie,
  });
  return ((await response.json()) as {thread: ThreadSummary}).thread.id;
}

/** Sends a message; returns every event and the tool cards as they ended. */
async function send(threadId: string, message: string) {
  const response = await callApi(app, `/api/threads/${threadId}/messages`, {
    method: 'POST',
    body: {message},
    cookie,
  });
  const events = (await readEvents(response)) as ChatEvent[];
  const latest = new Map<string, ToolCallRecord>();
  for (const event of events) {
    if (event.type === 'tool') {
      latest.set(event.call.id, event.call);
    }
  }
  return {events, calls: [...latest.values()]};
}

async function runners(): Promise<RunnerSummary[]> {
  const response = await callApi(app, '/api/runners', {cookie});
  return ((await response.json()) as {runners: RunnerSummary[]}).runners;
}

beforeEach(async () => {
  await resetDatabase(db);
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
  await db.$client.end();
});

describe('pairing', () => {
  it('pairs with a one-time code, then shows online with its folders', async () => {
    const added = (await (
      await callApi(app, '/api/runners', {
        method: 'POST',
        body: {name: 'Test Mac'},
        cookie,
      })
    ).json()) as RunnerAdded;
    expect(added.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await runners())[0]!.status).toBe('pairing');

    const paired = await runnerCall('/pair', null, {code: added.code});
    expect(paired.status).toBe(200);
    const {token} = (await paired.json()) as {token: string};
    expect(token).toMatch(/^brt_/);
    // The code works once.
    expect((await runnerCall('/pair', null, {code: added.code})).status).toBe(
      400,
    );
    expect((await runners())[0]!.status).toBe('offline');

    await runnerCall('/hello', token, {
      os: 'macOS 27.0.0',
      version: '0.1.0',
      folders: ['/Users/test/project'],
    });
    expect((await runners())[0]).toMatchObject({
      name: 'Test Mac',
      status: 'online',
      os: 'macOS 27.0.0',
      folders: ['/Users/test/project'],
    });
  });

  it('refuses a wrong code, and a missing or wrong token', async () => {
    expect((await runnerCall('/pair', null, {code: 'AAAA-AAAA'})).status).toBe(
      400,
    );
    expect((await runnerCall('/jobs/next', null)).status).toBe(401);
    expect((await runnerCall('/jobs/next', 'brt_nope')).status).toBe(401);
  });

  it('Pause stops work at once; Remove revokes the token', async () => {
    const {token, runnerId} = await pairRunner();

    await callApi(app, `/api/runners/${runnerId}/pause`, {
      method: 'POST',
      cookie,
    });
    const next = (await (await runnerCall('/jobs/next', token)).json()) as {
      paused: boolean;
    };
    expect(next.paused).toBe(true);
    expect((await runners())[0]!.status).toBe('paused');

    await callApi(app, `/api/runners/${runnerId}`, {method: 'DELETE', cookie});
    expect((await runnerCall('/jobs/next', token)).status).toBe(401);
  });

  it("keeps someone else's computers out of reach", async () => {
    const {runnerId} = await pairRunner();
    const {cookie: other} = await signUp(app, 'grace@example.com');
    for (const path of [`/api/runners/${runnerId}/pause`]) {
      const response = await callApi(app, path, {
        method: 'POST',
        cookie: other,
      });
      expect(response.status).toBe(404);
    }
    const theirs = await callApi(app, '/api/runners', {cookie: other});
    expect(((await theirs.json()) as {runners: unknown[]}).runners).toEqual([]);
  });
});

describe('your computer', () => {
  it('reads at once, and runs an approved command exactly as asked', async () => {
    const {token, runnerId} = await pairRunner();
    const agent = await hire({computers: ['runner'], runnerId});
    const threadId = await newChat(agent.id);

    // Reading runs straight away, on the Runner.
    scripts.push([
      {toolCalls: [{name: 'computer_list_files', input: {path: '.'}}]},
      {text: 'You have notes.md.'},
    ]);
    const listing = send(threadId, 'What files do I have?');
    const listJob = await takeJob(token);
    expect(listJob.job).toEqual({type: 'list_files', path: '.'});
    await answerJob(token, listJob.id, {
      ok: true,
      output: {entries: [{name: 'notes.md', type: 'file'}]},
    });
    const {calls: listed} = await listing;
    expect(listed[0]).toMatchObject({status: 'done', risk: 'read'});

    // A command asks first; nothing reaches the Runner until approved.
    scripts.push([
      {
        toolCalls: [
          {name: 'computer_run_command', input: {command: 'cat notes.md'}},
        ],
      },
      {text: 'That step needs your OK.'},
    ]);
    const {calls: asked} = await send(threadId, 'Show me my notes');
    expect(asked[0]).toMatchObject({status: 'waiting', risk: 'computer'});

    scripts.push([{text: 'Your notes say: Ship the Runner.'}]);
    const approving = callApi(
      app,
      `/api/approvals/${asked[0]!.approvalId}/approve`,
      {
        method: 'POST',
        cookie,
      },
    );
    const runJob = await takeJob(token);
    expect(runJob.job).toEqual({
      type: 'run_command',
      command: 'cat notes.md',
      cwd: null,
    });
    await answerJob(token, runJob.id, {
      ok: true,
      output: {exitCode: 0, stdout: 'Ship the Runner', stderr: ''},
    });
    const decided = (await (await approving).json()) as ApprovalDecided;
    expect(decided.call).toMatchObject({
      status: 'done',
      output: {exitCode: 0, stdout: 'Ship the Runner'},
    });
    expect(decided.reply?.content).toBe('Your notes say: Ship the Runner.');
  });

  it("shows the Runner's refusal of a path outside the shared folders", async () => {
    const {token, runnerId} = await pairRunner();
    const agent = await hire({computers: ['runner'], runnerId});
    const threadId = await newChat(agent.id);
    scripts.push([
      {toolCalls: [{name: 'computer_read_file', input: {path: '/etc/passwd'}}]},
      {text: 'That was refused.'},
    ]);

    const reading = send(threadId, 'Read /etc/passwd');
    const job = await takeJob(token);
    await answerJob(token, job.id, {
      ok: false,
      error:
        '/etc/passwd is outside the folders you shared, so this computer refused it.',
    });

    const {calls} = await reading;
    expect(calls[0]).toMatchObject({
      status: 'failed',
      error:
        '/etc/passwd is outside the folders you shared, so this computer refused it.',
    });
  });

  it('says so when the computer is paused or offline', async () => {
    const {runnerId} = await pairRunner();
    const agent = await hire({computers: ['runner'], runnerId});
    const threadId = await newChat(agent.id);
    await callApi(app, `/api/runners/${runnerId}/pause`, {
      method: 'POST',
      cookie,
    });
    scripts.push([
      {toolCalls: [{name: 'computer_list_files', input: {}}]},
      {text: 'It is paused.'},
    ]);

    const {calls} = await send(threadId, 'What files do I have?');

    expect(calls[0]).toMatchObject({
      status: 'failed',
      error: 'Test Mac is paused, so nothing ran. Resume it on Your computers.',
    });
  });

  it('needs a computer of yours to be chosen', async () => {
    const response = await callApi(app, '/api/agents', {
      method: 'POST',
      body: {
        name: 'Bolt',
        role: 'Works on my code.',
        instructions: '',
        avatar: 'bolt',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        computers: ['runner'],
      },
      cookie,
    });
    expect(response.status).toBe(400);
  });
});

describe('Claude Code', () => {
  it('streams what it says and does into the chat, with no API key', async () => {
    const {token, runnerId} = await pairRunner();
    await callApi(app, '/api/keys/anthropic', {method: 'DELETE', cookie});
    const agent = await hire({engine: 'claude_code', runnerId});
    expect(agent.engine).toBe('claude_code');
    const threadId = await newChat(agent.id);

    const sending = send(threadId, 'What do my notes say?');
    const job = await takeJob(token);
    expect(job.job).toMatchObject({
      type: 'engine',
      engine: 'claude_code',
      prompt: 'What do my notes say?',
      // Auto-approve reads: the CLI may only look.
      permission: 'read_only',
    });
    await answerJob(
      token,
      job.id,
      {ok: true, output: {text: 'They say: Ship the Runner.'}},
      [
        {type: 'text', text: 'Let me look. '},
        {
          type: 'tool-call',
          id: 't1',
          name: 'Read',
          input: {file_path: 'notes.md'},
          risk: 'read',
        },
        {type: 'tool-result', id: 't1', output: 'Ship the Runner'},
        {type: 'text', text: 'They say: Ship the Runner.'},
      ],
    );

    const {events, calls} = await sending;
    expect(
      events
        .filter(e => e.type === 'delta')
        .map(e => e.text)
        .join(''),
    ).toBe('Let me look. They say: Ship the Runner.');
    expect(calls).toMatchObject([
      {name: 'Read', risk: 'read', status: 'done', output: 'Ship the Runner'},
    ]);
    expect(events.at(-1)).toMatchObject({type: 'done'});
    // No API model was asked.
    expect(models).toHaveLength(0);
  });

  it('maps Accept edits to edits and Plan only to plan', async () => {
    const {token, runnerId} = await pairRunner();
    for (const [approvalMode, permission] of [
      ['accept_edits', 'edits'],
      ['plan_only', 'plan'],
    ] as const) {
      const agent = await hire({engine: 'claude_code', runnerId, approvalMode});
      const threadId = await newChat(agent.id);
      const sending = send(threadId, 'Tidy up');
      const job = await takeJob(token);
      expect(job.job).toMatchObject({permission});
      await answerJob(token, job.id, {ok: true, output: {text: 'Done.'}}, [
        {type: 'text', text: 'Done.'},
      ]);
      await sending;
    }
  });
});
