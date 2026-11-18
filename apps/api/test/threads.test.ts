import {ThreadRepository} from '@binary/db';
import type {
  AgentSummary,
  ChatEvent,
  ThreadDetail,
  ThreadSummary,
} from '@binary/shared';
import {CHAT_MESSAGES} from '@binary/shared';
import {APICallError} from 'ai';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import type {ModelBuilder} from '../src/engine/factory';
import {
  brokenModel,
  callApi,
  createTestApp,
  failingModel,
  fakeModel,
  readEvents,
  resetDatabase,
  signUp,
} from './helpers';

/** Each test can swap in a different fake model. */
let makeModel: () => MockLanguageModelV4;
/** Every fake model handed out, so tests can read what each was sent. */
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = makeModel();
  models.push(model);
  return model;
};

const {app, db} = createTestApp({buildModel});
const repository = new ThreadRepository(db);

const ada = {
  name: 'Ada',
  role: 'Finds, reads and summarizes sources on any topic.',
  instructions: '',
  avatar: 'nova',
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
};

let cookie: string;

async function addKey(as = cookie) {
  await callApi(app, '/api/keys/anthropic', {
    method: 'PUT',
    body: {key: 'sk-test-key-0000000000000000000000AAAA'},
    cookie: as,
  });
}

async function hireAgent(
  body: object = ada,
  as = cookie,
): Promise<AgentSummary> {
  const response = await callApi(app, '/api/agents', {
    method: 'POST',
    body,
    cookie: as,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

function startChat(agentId: string, as = cookie) {
  return callApi(app, '/api/threads', {
    method: 'POST',
    body: {agentId},
    cookie: as,
  });
}

async function newThread(agentId: string): Promise<ThreadSummary> {
  const response = await startChat(agentId);
  return ((await response.json()) as {thread: ThreadSummary}).thread;
}

function send(threadId: string, message: string, as = cookie) {
  return callApi(app, `/api/threads/${threadId}/messages`, {
    method: 'POST',
    body: {message},
    cookie: as,
  });
}

/** Sends a message and reads the whole streamed answer. */
async function sendAndRead(threadId: string, message: string) {
  return (await readEvents(await send(threadId, message))) as ChatEvent[];
}

async function getThread(threadId: string): Promise<ThreadDetail> {
  const response = await callApi(app, `/api/threads/${threadId}`, {cookie});
  return (await response.json()) as ThreadDetail;
}

async function recentChats(as = cookie): Promise<ThreadSummary[]> {
  const response = await callApi(app, '/api/threads', {cookie: as});
  return ((await response.json()) as {threads: ThreadSummary[]}).threads;
}

/** What the most recent fake model was sent, as [role, text] pairs. */
function lastPrompt(): Array<[string, string]> {
  const prompt = models.at(-1)?.doStreamCalls.at(-1)?.prompt ?? [];
  return prompt.map(message => [
    message.role,
    typeof message.content === 'string'
      ? message.content
      : message.content.map(part => ('text' in part ? part.text : '')).join(''),
  ]);
}

function textOf(events: ChatEvent[]): string {
  return events
    .map(event => (event.type === 'delta' ? event.text : ''))
    .join('');
}

beforeEach(async () => {
  await resetDatabase(db);
  models.length = 0;
  makeModel = () => fakeModel('Here are **three** sources.');
  ({cookie} = await signUp(app));
  await addKey();
});

afterAll(async () => {
  await db.$client.end();
});

describe('starting a chat', () => {
  it('starts an untitled chat, listed only once it has a message', async () => {
    const agent = await hireAgent();

    const response = await startChat(agent.id);

    expect(response.status).toBe(201);
    const {thread} = (await response.json()) as {thread: ThreadSummary};
    expect(thread).toMatchObject({
      title: null,
      agentId: agent.id,
      agentName: 'Ada',
      avatar: 'nova',
    });
    expect(await recentChats()).toEqual([]);
  });

  it('needs one of your own agents', async () => {
    const grace = await signUp(app, 'grace@example.com');
    await addKey(grace.cookie);
    const theirs = await hireAgent(ada, grace.cookie);

    expect((await startChat(theirs.id)).status).toBe(404);
    const invalid = await startChat('nova');
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      message: CHAT_MESSAGES.agentRequired,
    });
  });
});

describe('sending a message', () => {
  it('streams the answer word by word, then saves it', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);

    const events = await sendAndRead(thread.id, 'Research pgvector');

    expect(events[0]).toMatchObject({
      type: 'start',
      model: 'claude-sonnet-5-5',
      userMessage: {role: 'user', content: 'Research pgvector'},
    });
    const deltas = events.filter(event => event.type === 'delta');
    expect(deltas.length).toBeGreaterThan(2);
    expect(textOf(events)).toBe('Here are **three** sources.');
    const done = events.at(-1);
    expect(done).toMatchObject({
      type: 'done',
      message: {role: 'assistant', content: 'Here are **three** sources.'},
    });

    // Still there after a reload.
    const saved = await getThread(thread.id);
    expect(saved.messages.map(m => [m.role, m.content])).toEqual([
      ['user', 'Research pgvector'],
      ['assistant', 'Here are **three** sources.'],
    ]);
    expect(saved.messages[1]!.id).toBe(
      done?.type === 'done' ? done.message.id : '',
    );
  });

  it('names the chat after its first message only', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);

    await sendAndRead(thread.id, 'Plan my\n\nweek');
    await sendAndRead(thread.id, 'Now plan next week');

    expect((await getThread(thread.id)).thread.title).toBe('Plan my week');
  });

  it('sends the system prompt and the saved conversation', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);

    await sendAndRead(thread.id, 'Name two sources.');
    await sendAndRead(thread.id, 'And a third?');

    const prompt = lastPrompt();
    expect(prompt.map(([role]) => role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(prompt[0]![1]).toContain('You are Ada');
    expect(prompt.at(-1)).toEqual(['user', 'And a third?']);
  });

  it('only shows the model the newest messages of a long chat', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);
    for (let turn = 0; turn < 15; turn++) {
      await repository.addQuestion(thread.id, `question ${turn}`, 'Long chat');
      await repository.addAnswer(thread.id, `answer ${turn}`);
    }

    await sendAndRead(thread.id, 'One more thing');

    const conversation = lastPrompt().filter(([role]) => role !== 'system');
    // The last 20 messages, minus the answer that would come first.
    expect(conversation).toHaveLength(19);
    expect(conversation[0]).toEqual(['user', 'question 6']);
    expect(conversation.at(-1)).toEqual(['user', 'One more thing']);
    // Everything is still saved.
    expect((await getThread(thread.id)).messages).toHaveLength(32);
  });

  it('uses edits to the agent on the very next answer', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);
    await callApi(app, `/api/agents/${agent.id}`, {
      method: 'PATCH',
      body: {...ada, name: 'Sparky', avatar: 'ember'},
      cookie,
    });

    await sendAndRead(thread.id, 'Hi');

    expect(lastPrompt()[0]![1]).toContain('You are Sparky');
  });

  it('keeps your message but not a half answer when the provider fails', async () => {
    makeModel = () =>
      brokenModel(
        'Here is what I ',
        new APICallError({
          message: 'Overloaded',
          url: 'https://api.anthropic.com/v1/messages',
          requestBodyValues: {},
          statusCode: 529,
          isRetryable: false,
        }),
      );
    const agent = await hireAgent();
    const thread = await newThread(agent.id);

    const events = await sendAndRead(thread.id, 'Research pgvector');

    expect(textOf(events)).toBe('Here is what I ');
    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'Anthropic is having trouble right now. Try again later.',
    });
    const saved = await getThread(thread.id);
    expect(saved.messages.map(m => m.role)).toEqual(['user']);
    expect(saved.thread.title).toBe('Research pgvector');
  });

  it('reports a rejected key as an error event', async () => {
    makeModel = () =>
      failingModel(
        new APICallError({
          message: 'Unauthorized',
          url: 'https://api.anthropic.com/v1/messages',
          requestBodyValues: {},
          statusCode: 401,
          isRetryable: false,
        }),
      );
    const agent = await hireAgent();
    const thread = await newThread(agent.id);

    const events = await sendAndRead(thread.id, 'Hi');

    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'Anthropic rejected this key. Check it on the API keys page.',
    });
  });

  it('finishes and saves the answer even if you leave part-way', async () => {
    makeModel = () => fakeModel('One two three four five six.', {delayMs: 15});
    const agent = await hireAgent();
    const thread = await newThread(agent.id);

    const response = await send(thread.id, 'Count for me');
    const reader = response.body!.getReader();
    await reader.read();
    // Close the tab.
    await reader.cancel();

    await expect
      .poll(async () => (await getThread(thread.id)).messages.length, {
        timeout: 2000,
      })
      .toBe(2);
    expect((await getThread(thread.id)).messages[1]!.content).toBe(
      'One two three four five six.',
    );
  });
});

describe('errors caught before the stream starts', () => {
  it('answers 409 when the key is gone, and saves nothing', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);
    await callApi(app, '/api/keys/anthropic', {method: 'DELETE', cookie});

    const response = await send(thread.id, 'Hi');

    expect(response.status).toBe(409);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      code: 'NO_KEY',
      message:
        'Ada thinks with Anthropic. Add your Anthropic key on the API keys page.',
    });
    expect((await getThread(thread.id)).messages).toEqual([]);
  });

  it('rejects an empty message', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);

    const response = await send(thread.id, '   ');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: CHAT_MESSAGES.messageRequired,
    });
  });

  it("keeps a fired agent's chats, read-only", async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);
    await sendAndRead(thread.id, 'Hi');
    await callApi(app, `/api/agents/${agent.id}`, {method: 'DELETE', cookie});

    const saved = await getThread(thread.id);
    expect(saved.isFired).toBe(true);
    expect(saved.messages).toHaveLength(2);
    expect((await recentChats()).map(t => t.id)).toEqual([thread.id]);

    const response = await send(thread.id, 'Are you still there?');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'READ_ONLY',
      message: 'Ada was fired, so this chat is read-only.',
    });
    expect((await startChat(agent.id)).status).toBe(404);
  });
});

describe('recent chats', () => {
  it('lists chats newest first, with who they are with', async () => {
    const nova = await hireAgent();
    const bolt = await hireAgent({...ada, name: 'Bolt', avatar: 'bolt'});
    const first = await newThread(nova.id);
    const second = await newThread(bolt.id);
    await sendAndRead(first.id, 'First chat');
    await sendAndRead(second.id, 'Second chat');

    expect((await recentChats()).map(t => t.title)).toEqual([
      'Second chat',
      'First chat',
    ]);

    // Picking an older chat back up moves it to the top.
    await sendAndRead(first.id, 'Back to this one');
    const list = await recentChats();
    expect(list.map(t => t.title)).toEqual(['First chat', 'Second chat']);
    expect(list[1]).toMatchObject({agentName: 'Bolt', avatar: 'bolt'});
  });

  it('deletes a chat and its messages', async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);
    await sendAndRead(thread.id, 'Hi');

    const response = await callApi(app, `/api/threads/${thread.id}`, {
      method: 'DELETE',
      cookie,
    });

    expect(response.status).toBe(200);
    expect(await recentChats()).toEqual([]);
    expect(await repository.listMessages(thread.id)).toEqual([]);
    const again = await callApi(app, `/api/threads/${thread.id}`, {cookie});
    expect(again.status).toBe(404);
  });
});

describe('ownership', () => {
  it("treats another person's chat exactly like a missing one", async () => {
    const agent = await hireAgent();
    const thread = await newThread(agent.id);
    await sendAndRead(thread.id, 'My secret plans');
    const grace = await signUp(app, 'grace@example.com');
    await addKey(grace.cookie);

    for (const response of [
      await callApi(app, `/api/threads/${thread.id}`, {cookie: grace.cookie}),
      await callApi(app, `/api/threads/${thread.id}`, {
        method: 'DELETE',
        cookie: grace.cookie,
      }),
      await send(thread.id, 'Hi', grace.cookie),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: 'NOT_FOUND',
        message: 'There is no chat here.',
      });
    }
    expect(await recentChats(grace.cookie)).toEqual([]);
    expect((await getThread(thread.id)).messages).toHaveLength(2);
  });

  it('answers 404 for an id that is not even valid', async () => {
    const response = await callApi(app, '/api/threads/not-a-uuid', {cookie});

    expect(response.status).toBe(404);
  });

  it('needs a signed-in person', async () => {
    const response = await callApi(app, '/api/threads');

    expect(response.status).toBe(401);
  });
});
