import {apps as appsTable} from '@binary/db';
import type {
  AgentSummary,
  ChatEvent,
  ThreadDetail,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import type {ModelBuilder} from '../src/engine/factory';
import {WAITING_FOR_PERSON} from '../src/chat/answer';
import {currentTimeTool, webPageTool} from '../src/tools/built-in';
import {WAITING_MESSAGE} from '../src/tools/toolbox';
import type {ScriptedStep} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';
import type {TestShop} from './mcp-test-server';
import {closedUrl, SHOP_AUTHORIZATION, startTestShop} from './mcp-test-server';

/** 03:00 UTC, which is noon in Tokyo. */
const NOW = new Date('2026-11-18T03:00:00Z');

let steps: ScriptedStep[] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(steps);
  models.push(model);
  return model;
};

const {app, db} = createTestApp({
  buildModel,
  builtInTools: () => [currentTimeTool(() => NOW), webPageTool()],
});
let shop: TestShop;
let cookie: string;
let userId: string;
let threadId: string;

/** What the model was sent on its `step`th call, as text. */
function promptOfStep(step: number): string {
  return JSON.stringify(models.at(-1)!.doStreamCalls[step]!.prompt);
}

/** Sends a message and returns every event, plus the tool calls by the end. */
async function ask(message: string) {
  const response = await callApi(app, `/api/threads/${threadId}/messages`, {
    method: 'POST',
    body: {message},
    cookie,
  });
  const events = (await readEvents(response)) as ChatEvent[];
  const toolEvents = events.flatMap(e => (e.type === 'tool' ? [e.call] : []));
  const latest = new Map<string, ToolCallRecord>();
  toolEvents.forEach(call => latest.set(call.id, call));
  return {events, toolEvents, calls: [...latest.values()]};
}

async function savedAnswer() {
  const response = await callApi(app, `/api/threads/${threadId}`, {cookie});
  const {messages} = (await response.json()) as ThreadDetail;
  return messages.at(-1)!;
}

async function connectShop() {
  await callApi(app, '/api/apps', {
    method: 'POST',
    body: {name: 'Shop', url: shop.url, authorization: SHOP_AUTHORIZATION},
    cookie,
  });
}

beforeAll(async () => {
  shop = await startTestShop();
});

beforeEach(async () => {
  await resetDatabase(db);
  models.length = 0;
  shop.calls.length = 0;
  ({cookie, userId} = await signUp(app));
  await callApi(app, '/api/keys/anthropic', {
    method: 'PUT',
    body: {key: 'sk-test-key-0000000000000000000000AAAA'},
    cookie,
  });
  const hired = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Mimi',
      role: 'Helps with orders.',
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
  ({
    thread: {id: threadId},
  } = (await started.json()) as {thread: ThreadSummary});
});

afterAll(async () => {
  await shop.close();
  await db.$client.end();
});

describe('built-in tools', () => {
  it('answers "What time is it in Tokyo?" with a tool, shown live and saved', async () => {
    steps = [
      {
        toolCalls: [
          {name: 'get_current_time', input: {timeZone: 'Asia/Tokyo'}},
        ],
      },
      {text: "It's noon in Tokyo."},
    ];

    const {toolEvents, events} = await ask('What time is it in Tokyo?');

    expect(toolEvents.map(call => call.status)).toEqual(['running', 'done']);
    const done = toolEvents[1]!;
    expect(done).toMatchObject({
      name: 'get_current_time',
      risk: 'read',
      input: {timeZone: 'Asia/Tokyo'},
      output: {timeZone: 'Asia/Tokyo', iso: NOW.toISOString()},
    });
    expect((done.output as {now: string}).now).toContain('12:00:00');
    // The model read the result before answering.
    expect(promptOfStep(1)).toContain('12:00:00');
    expect(events.at(-1)).toMatchObject({type: 'done'});

    const saved = await savedAnswer();
    expect(saved.content).toBe("It's noon in Tokyo.");
    expect(saved.toolCalls).toEqual([done]);
  });

  it('reports a tool that fails, and the answer carries on', async () => {
    steps = [
      {toolCalls: [{name: 'get_current_time', input: {timeZone: 'Mars/Base'}}]},
      {text: "I don't know that time zone."},
    ];

    const {calls, events} = await ask('Time on Mars?');

    expect(calls).toEqual([
      expect.objectContaining({
        status: 'failed',
        error: `"Mars/Base" isn't a time zone I know.`,
      }),
    ]);
    expect(events.at(-1)).toMatchObject({type: 'done'});
  });

  it("refuses to read pages on this computer's network", async () => {
    steps = [
      {
        toolCalls: [
          {name: 'fetch_web_page', input: {url: 'http://127.0.0.1:5433'}},
        ],
      },
      {text: "I can't open that."},
    ];

    const {calls} = await ask('Read my database page');

    expect(calls[0]).toMatchObject({
      status: 'failed',
      error: 'Binary only opens public web addresses.',
    });
  });
});

describe('app tools', () => {
  it('runs a read tool from an app mid-answer', async () => {
    await connectShop();
    steps = [
      {toolCalls: [{name: 'shop_lookup_order', input: {orderId: 'A1'}}]},
      {text: 'Your order A1 has shipped.'},
    ];

    const {calls} = await ask('Where is my order A1?');

    expect(shop.calls).toEqual(['lookup_order:A1']);
    expect(calls[0]).toMatchObject({
      name: 'shop_lookup_order',
      risk: 'read',
      status: 'done',
    });
    expect(JSON.stringify(calls[0]!.output)).toContain('2 mugs, shipped');
  });

  it('asks before a write tool: it never runs, and the model is told it waits', async () => {
    await connectShop();
    steps = [
      {toolCalls: [{name: 'shop_refund_order', input: {orderId: 'A1'}}]},
      {text: "I've asked for your approval to refund A1."},
    ];

    const {toolEvents} = await ask('Please refund order A1');

    expect(shop.calls).toEqual([]);
    expect(toolEvents).toEqual([
      {
        id: 'call-0-0',
        name: 'shop_refund_order',
        risk: 'write',
        input: {orderId: 'A1'},
        status: 'waiting',
        error: WAITING_FOR_PERSON,
        approvalId: expect.any(String) as string,
      },
    ]);
    expect(promptOfStep(1)).toContain(WAITING_MESSAGE.slice(0, 40));
    expect((await savedAnswer()).toolCalls[0]).toMatchObject({
      status: 'waiting',
    });
  });

  it("fails a tool name the model made up, and doesn't ask about it", async () => {
    steps = [
      {toolCalls: [{name: 'delete_everything', input: {}}]},
      {text: 'I made that up.'},
    ];

    const {calls} = await ask('Do something odd');

    expect(calls[0]).toMatchObject({risk: 'write', status: 'failed'});
    expect(calls[0]!.approvalId).toBeUndefined();
  });

  it("keeps chatting when an app can't be reached", async () => {
    await db
      .insert(appsTable)
      .values({userId, name: 'Gone', url: await closedUrl()});
    steps = [
      {toolCalls: [{name: 'get_current_time', input: {}}]},
      {text: 'It is 03:00 UTC.'},
    ];

    const {calls, events} = await ask('What time is it?');

    expect(calls[0]).toMatchObject({status: 'done'});
    expect(events.at(-1)).toMatchObject({type: 'done'});
    // The model is told which app is missing.
    expect(promptOfStep(0)).toContain(
      "These connected apps couldn't be reached just now",
    );
    expect(promptOfStep(0)).toContain('Gone');
  });
});
