import {approvalRequests, eq} from '@binary/db';
import type {
  AgentSummary,
  ApprovalDecided,
  ApprovalMode,
  ApprovalSummary,
  ChatEvent,
  ThreadDetail,
  ThreadSummary,
  TodayOverview,
  ToolCallRecord,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';
import {z} from 'zod';

import type {ModelBuilder} from '../src/engine/factory';
import type {BinaryTool} from '../src/tools/toolbox';
import type {ScriptedStep} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';

// --- Fake tools: one per risk, each counting what it really did. --------

/** Every real run, as "name:input". */
let ran: string[] = [];
/** How long the write tool takes, to make two approvals overlap. */
let sendDelayMs = 0;

function fakeTool(name: string, risk: BinaryTool['risk']): BinaryTool {
  return {
    name,
    description: `Fake ${name}.`,
    risk,
    inputSchema: z.object({to: z.string().optional()}),
    async run(input) {
      if (name === 'send_email' && sendDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, sendDelayMs));
      }
      ran.push(`${name}:${JSON.stringify(input)}`);
      return {ok: true, tool: name};
    },
  };
}

/** The built-in tools; a test can take one away. */
let tools: BinaryTool[] = [];

// --- Fake models: each model call plays the next script. ---------------

/** One script per model built (the answer, then each follow-up). */
let scripts: ScriptedStep[][] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(scripts.shift() ?? [{text: 'OK.'}]);
  models.push(model);
  return model;
};

const {app, db} = createTestApp({buildModel, builtInTools: () => tools});

let cookie: string;

/** What one model call was sent, as JSON text. */
function promptOf(model: MockLanguageModelV4, step = 0): string {
  return JSON.stringify(model.doStreamCalls[step]!.prompt);
}

async function hire(approvalMode?: ApprovalMode): Promise<AgentSummary> {
  const response = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Mimi',
      role: 'Sorts email and drafts replies.',
      instructions: '',
      avatar: 'mimi',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      ...(approvalMode ? {approvalMode} : {}),
    },
    cookie,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

async function newChat(agentId: string): Promise<string> {
  const response = await callApi(app, '/api/threads', {
    method: 'POST',
    body: {agentId},
    cookie,
  });
  return ((await response.json()) as {thread: ThreadSummary}).thread.id;
}

/** Sends a message and returns the tool cards as they ended up. */
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

async function getThread(id: string): Promise<ThreadDetail> {
  const response = await callApi(app, `/api/threads/${id}`, {cookie});
  return (await response.json()) as ThreadDetail;
}

function decide(id: string, decision: 'approve' | 'reject', as = cookie) {
  return callApi(app, `/api/approvals/${id}/${decision}`, {
    method: 'POST',
    cookie: as,
  });
}

async function today(): Promise<TodayOverview> {
  return (await (
    await callApi(app, '/api/today', {cookie})
  ).json()) as TodayOverview;
}

/** Mimi asks to send an email; returns the chat and the request's id. */
async function askToSend(mode?: ApprovalMode) {
  const agent = await hire(mode);
  const threadId = await newChat(agent.id);
  scripts.push([
    {toolCalls: [{name: 'send_email', input: {to: 'ada@example.com'}}]},
    {text: "I've asked for your OK to email Ada."},
  ]);
  const {calls} = await send(threadId, 'Email Ada the plan');
  return {agent, threadId, call: calls[0]!, approvalId: calls[0]!.approvalId!};
}

beforeEach(async () => {
  await resetDatabase(db);
  ran = [];
  sendDelayMs = 0;
  scripts = [];
  models.length = 0;
  tools = [
    fakeTool('look_up', 'read'),
    fakeTool('send_email', 'write'),
    fakeTool('click_button', 'computer'),
  ];
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

describe('approval modes', () => {
  it('can be chosen when hiring and changed when editing', async () => {
    const agent = await hire('ask_first');
    expect(agent.approvalMode).toBe('ask_first');

    const response = await callApi(app, `/api/agents/${agent.id}`, {
      method: 'PATCH',
      body: {
        name: 'Mimi',
        role: 'Sorts email and drafts replies.',
        instructions: '',
        avatar: 'mimi',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        approvalMode: 'accept_edits',
      },
      cookie,
    });
    const {agent: edited} = (await response.json()) as {agent: AgentSummary};
    expect(edited.approvalMode).toBe('accept_edits');
  });

  it('starts new characters on Auto-approve reads', async () => {
    expect((await hire()).approvalMode).toBe('auto_reads');
  });

  it('Plan only offers no tools at all', async () => {
    const agent = await hire('plan_only');
    const threadId = await newChat(agent.id);
    scripts.push([{text: 'Here is the plan, step by step.'}]);

    await send(threadId, 'Email Ada the plan');

    const call = models.at(-1)!.doStreamCalls[0]!;
    expect(call.tools ?? []).toEqual([]);
    expect(promptOf(models.at(-1)!)).toContain('Plan only mode');
  });

  it('Accept edits runs write tools without asking', async () => {
    const agent = await hire('accept_edits');
    const threadId = await newChat(agent.id);
    scripts.push([
      {toolCalls: [{name: 'send_email', input: {to: 'ada@example.com'}}]},
      {text: 'Sent.'},
    ]);

    const {calls} = await send(threadId, 'Email Ada the plan');

    expect(calls[0]).toMatchObject({name: 'send_email', status: 'done'});
    expect(ran).toEqual(['send_email:{"to":"ada@example.com"}']);
    expect((await today()).waiting).toEqual([]);
  });

  it('Accept edits still asks before a computer tool', async () => {
    const agent = await hire('accept_edits');
    const threadId = await newChat(agent.id);
    scripts.push([
      {toolCalls: [{name: 'click_button', input: {}}]},
      {text: 'Asked first.'},
    ]);

    const {calls} = await send(threadId, 'Click it');

    expect(calls[0]).toMatchObject({status: 'waiting', risk: 'computer'});
    expect(ran).toEqual([]);
  });

  it('Ask first asks even before reading', async () => {
    const agent = await hire('ask_first');
    const threadId = await newChat(agent.id);
    scripts.push([
      {toolCalls: [{name: 'look_up', input: {}}]},
      {text: 'Asked first.'},
    ]);

    const {calls} = await send(threadId, 'Look it up');

    expect(calls[0]).toMatchObject({status: 'waiting', risk: 'read'});
    expect(ran).toEqual([]);
  });

  it('Auto-approve reads runs reads at once', async () => {
    const agent = await hire('auto_reads');
    const threadId = await newChat(agent.id);
    scripts.push([
      {toolCalls: [{name: 'look_up', input: {}}]},
      {text: 'Found it.'},
    ]);

    const {calls} = await send(threadId, 'Look it up');

    expect(calls[0]).toMatchObject({status: 'done'});
    expect(ran).toEqual(['look_up:{}']);
  });
});

describe('asking', () => {
  it('asks in the chat, and the same request waits in Today', async () => {
    const {threadId, call, approvalId} = await askToSend();

    expect(call).toMatchObject({
      name: 'send_email',
      risk: 'write',
      status: 'waiting',
      input: {to: 'ada@example.com'},
    });
    expect(ran).toEqual([]);
    // The model was told it hasn't run, and its answer was saved.
    expect(promptOf(models.at(-1)!, 1)).toContain('waiting_for_approval');
    const thread = await getThread(threadId);
    expect(thread.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: "I've asked for your OK to email Ada.",
      toolCalls: [{status: 'waiting', approvalId}],
    });

    const {waiting} = await today();
    expect(waiting).toMatchObject([
      {
        id: approvalId,
        status: 'pending',
        toolName: 'send_email',
        input: {to: 'ada@example.com'},
        agentName: 'Mimi',
        threadId,
        threadTitle: 'Email Ada the plan',
        routineName: null,
      },
    ]);
    const count = await callApi(app, '/api/approvals/count', {cookie});
    expect(await count.json()).toEqual({pending: 1});
  });
});

describe('approving', () => {
  it('runs exactly what was asked, once, and the character follows up', async () => {
    const {threadId, approvalId} = await askToSend();
    scripts.push([{text: 'Done! Ada has the plan.'}]);

    const response = await decide(approvalId, 'approve');
    expect(response.status).toBe(200);
    const decided = (await response.json()) as ApprovalDecided;

    expect(ran).toEqual(['send_email:{"to":"ada@example.com"}']);
    expect(decided.approval.status).toBe('done');
    expect(decided.call).toMatchObject({
      status: 'done',
      output: {ok: true, tool: 'send_email'},
    });
    expect(decided.call.error).toBeUndefined();
    expect(decided.note).toMatchObject({
      role: 'note',
      content: 'You approved send email.',
    });
    expect(decided.reply).toMatchObject({
      role: 'assistant',
      content: 'Done! Ada has the plan.',
    });
    // The follow-up read what was decided and what it returned.
    const followUp = promptOf(models.at(-1)!);
    expect(followUp).toContain('The person approved your request');
    expect(followUp).toContain('send_email');
    expect(followUp).toContain('Tell them what happened.');

    // The chat shows it all, in order, and the card is now "Used".
    const {messages} = await getThread(threadId);
    expect(messages.map(m => m.role)).toEqual([
      'user',
      'assistant',
      'note',
      'assistant',
    ]);
    expect(messages[1]!.toolCalls[0]).toMatchObject({status: 'done'});
    expect((await today()).waiting).toEqual([]);
  });

  it('runs the tool once when two approvals arrive at the same time', async () => {
    const {approvalId} = await askToSend();
    sendDelayMs = 50;
    scripts.push([{text: 'Sent.'}], [{text: 'Sent.'}]);

    const responses = await Promise.all([
      decide(approvalId, 'approve'),
      decide(approvalId, 'approve'),
    ]);

    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const loser = responses.find(r => r.status === 409)!;
    expect(await loser.json()).toMatchObject({
      code: 'ALREADY_DECIDED',
      message: 'This request was already decided.',
    });
    expect(ran).toHaveLength(1);
  });

  it("fails, and runs nothing else, when the tool isn't there anymore", async () => {
    const {approvalId} = await askToSend();
    // A different tool now has the same name: it must not be run.
    tools = [
      {
        ...fakeTool('look_up', 'read'),
        name: 'send_email_v2',
      },
    ];
    scripts.push([{text: "It didn't work."}]);

    const decided = (await (
      await decide(approvalId, 'approve')
    ).json()) as ApprovalDecided;

    expect(ran).toEqual([]);
    expect(decided.approval.status).toBe('failed');
    expect(decided.call).toMatchObject({
      status: 'failed',
      error: "The send_email tool isn't available anymore, so nothing ran.",
    });
    expect(decided.note.content).toBe(
      'You approved send email, but it failed.',
    );
  });
});

describe('rejecting', () => {
  it('runs nothing, and the character acknowledges it', async () => {
    const {threadId, approvalId} = await askToSend();
    scripts.push([{text: "OK, I won't send it."}]);

    const decided = (await (
      await decide(approvalId, 'reject')
    ).json()) as ApprovalDecided;

    expect(ran).toEqual([]);
    expect(decided.approval.status).toBe('rejected');
    expect(decided.call).toMatchObject({status: 'rejected'});
    expect(decided.note.content).toBe('You rejected send email.');
    expect(decided.reply?.content).toBe("OK, I won't send it.");
    const followUp = promptOf(models.at(-1)!);
    expect(followUp).toContain('The person rejected your request');
    expect(followUp).toContain("Don't try it again unless they ask.");

    // Decided once: approving it now does nothing.
    expect((await decide(approvalId, 'approve')).status).toBe(409);
    expect(ran).toEqual([]);

    // Later turns still carry the rejection, so it isn't retried.
    scripts.push([{text: 'Anything else?'}]);
    await send(threadId, 'What now?');
    expect(promptOf(models.at(-1)!)).toContain(
      "It did not run. Don't try it again unless they ask.",
    );
  });
});

describe('scoping', () => {
  it("keeps someone else's requests out of reach", async () => {
    const {approvalId} = await askToSend();
    const {cookie: other} = await signUp(app, 'grace@example.com');

    expect((await decide(approvalId, 'approve', other)).status).toBe(404);
    expect((await decide(approvalId, 'reject', other)).status).toBe(404);
    const theirs = await callApi(app, '/api/approvals', {cookie: other});
    expect(
      ((await theirs.json()) as {approvals: ApprovalSummary[]}).approvals,
    ).toEqual([]);
    expect(ran).toEqual([]);

    const [row] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalId));
    expect(row!.status).toBe('pending');
  });
});
