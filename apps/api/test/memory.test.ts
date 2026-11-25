import {MemoryRepository} from '@binary/db';
import type {
  AddMemoryResult,
  AgentSummary,
  ChatEvent,
  MemoriesOverview,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import {
  ALL_MEMORIES_LIMIT,
  EMBEDDINGS_NEED_KEY,
  MEMORY_MESSAGES,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import type {ModelBuilder} from '../src/engine/factory';
import type {EmbeddingCalls} from './fake-embedder';
import {fakeEmbedding, fakeEmbeddingBuilder} from './fake-embedder';
import type {ScriptedStep} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';

let steps: ScriptedStep[] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(steps);
  models.push(model);
  return model;
};
const embedded: EmbeddingCalls = {values: [], providers: []};

const {app, db} = createTestApp({
  buildModel,
  buildEmbeddingModel: fakeEmbeddingBuilder(embedded),
});
const repository = new MemoryRepository(db);

let cookie: string;
let userId: string;
let agent: AgentSummary;

async function addKey(provider: string, as = cookie) {
  await callApi(app, `/api/keys/${provider}`, {
    method: 'PUT',
    body: {key: `test-${provider}-key-000000000000000000AAAA`},
    cookie: as,
  });
}

async function hire(
  overrides: object = {},
  as = cookie,
): Promise<AgentSummary> {
  const response = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Moss',
      role: 'Keeps track of things.',
      instructions: '',
      avatar: 'moss',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      ...overrides,
    },
    cookie: as,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

async function newChat(agentId = agent.id): Promise<string> {
  const response = await callApi(app, '/api/threads', {
    method: 'POST',
    body: {agentId},
    cookie,
  });
  return ((await response.json()) as {thread: ThreadSummary}).thread.id;
}

/** Sends a message in a new chat; returns its tool calls, finished. */
async function chat(message: string, agentId = agent.id) {
  const threadId = await newChat(agentId);
  const response = await callApi(app, `/api/threads/${threadId}/messages`, {
    method: 'POST',
    body: {message},
    cookie,
  });
  const events = (await readEvents(response)) as ChatEvent[];
  const latest = new Map<string, ToolCallRecord>();
  for (const event of events) {
    if (event.type === 'tool') latest.set(event.call.id, event.call);
  }
  return {events, calls: [...latest.values()]};
}

/** The system prompt and tool names of the latest model's `step`th call. */
function sentOnStep(step = 0) {
  const call = models.at(-1)!.doStreamCalls[step]!;
  const system = call.prompt
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n');
  const tools = (call.tools ?? []).map(t => t.name);
  return {system, tools, prompt: JSON.stringify(call.prompt)};
}

async function memoryPage(agentId = agent.id, as = cookie) {
  const response = await callApi(app, `/api/agents/${agentId}/memories`, {
    cookie: as,
  });
  return {
    status: response.status,
    body: (await response.json()) as MemoriesOverview,
  };
}

async function addMemory(content: string, agentId = agent.id) {
  const response = await callApi(app, `/api/agents/${agentId}/memories`, {
    method: 'POST',
    body: {content},
    cookie,
  });
  return {
    status: response.status,
    body: (await response.json()) as AddMemoryResult & {
      code?: string;
      message?: string;
    },
  };
}

beforeEach(async () => {
  await resetDatabase(db);
  models.length = 0;
  embedded.values.length = 0;
  embedded.providers.length = 0;
  steps = [{text: 'Okay.'}];
  ({cookie, userId} = await signUp(app));
  await addKey('openai');
  agent = await hire();
});

afterAll(async () => {
  await db.$client.end();
});

describe('remembering in chat', () => {
  it('saves a preference with remember, and a new chat uses it without a tool', async () => {
    steps = [
      {toolCalls: [{name: 'remember', input: {fact: 'Prefers short answers'}}]},
      {text: "Got it, I'll keep it short."},
    ];
    const first = await chat('Remember that I prefer short answers.');
    expect(first.calls).toEqual([
      expect.objectContaining({name: 'remember', status: 'done', risk: 'read'}),
    ]);
    const saved = await memoryPage();
    expect(saved.body.memories).toEqual([
      expect.objectContaining({
        content: 'Prefers short answers',
        source: 'character',
        searchable: true,
      }),
    ]);

    steps = [{text: 'Paris.'}];
    const second = await chat('What is the capital of France?');
    expect(second.calls).toEqual([]);
    const {system} = sentOnStep();
    expect(system).toContain('What you remember about the person');
    expect(system).toContain('- Prefers short answers');
  });

  it('runs memory tools without asking, even in Ask first mode', async () => {
    const careful = await hire({name: 'Careful', approvalMode: 'ask_first'});
    steps = [
      {toolCalls: [{name: 'remember', input: {fact: 'Works in UTC+1'}}]},
      {text: 'Noted.'},
    ];
    const {calls} = await chat('I work in UTC+1, remember that.', careful.id);
    expect(calls[0]).toMatchObject({name: 'remember', status: 'done'});
    expect((await memoryPage(careful.id)).body.memories).toHaveLength(1);
  });

  it('gives Plan only characters their memories, but no tools', async () => {
    const planner = await hire({name: 'Planner', approvalMode: 'plan_only'});
    await addMemory('Prefers tables over lists', planner.id);
    await chat('Plan my week.', planner.id);
    const {system, tools} = sentOnStep();
    expect(system).toContain('- Prefers tables over lists');
    expect(system).not.toContain('[id:');
    expect(tools).toEqual([]);
  });

  it('refuses to remember a secret', async () => {
    steps = [
      {
        toolCalls: [
          {
            name: 'remember',
            input: {fact: 'API key is sk-proj-abcdefghijklmnopqrstuvwx'},
          },
        ],
      },
      {text: "I don't keep secrets."},
    ];
    const {calls} = await chat(
      'Remember my API key sk-proj-abcdefghijklmnopqrstuvwx',
    );
    expect(calls[0]).toMatchObject({
      name: 'remember',
      status: 'failed',
      error: MEMORY_MESSAGES.secret,
    });
    expect((await memoryPage()).body.memories).toEqual([]);
  });

  it('holds back a similar fact so the character can check, and replaces on request', async () => {
    const {body: first} = await addMemory('Prefers short answers');
    steps = [
      {
        toolCalls: [
          {name: 'remember', input: {fact: 'Prefers short answers in English'}},
        ],
      },
      {text: 'Already know that.'},
    ];
    const held = await chat('I like short answers in English.');
    expect(held.calls[0]!.output).toMatchObject({status: 'similar_exists'});
    expect((await memoryPage()).body.memories).toHaveLength(1);

    steps = [
      {
        toolCalls: [
          {
            name: 'remember',
            input: {
              fact: 'Prefers short answers in English',
              replaces: first.memory.id,
            },
          },
        ],
      },
      {text: 'Updated.'},
    ];
    await chat('Update that: short answers, in English.');
    expect((await memoryPage()).body.memories.map(m => m.content)).toEqual([
      'Prefers short answers in English',
    ]);
  });

  it('forgets a memory by its id', async () => {
    const {body} = await addMemory('Has a cat called Pixel');
    steps = [
      {toolCalls: [{name: 'forget', input: {memoryId: body.memory.id}}]},
      {text: 'Forgotten.'},
    ];
    const {calls} = await chat('Forget about my cat.');
    expect(calls[0]).toMatchObject({name: 'forget', status: 'done'});
    expect((await memoryPage()).body.memories).toEqual([]);
  });

  it('recalls by meaning', async () => {
    await addMemory('Has a cat called Pixel');
    await addMemory('Prefers short answers');
    steps = [
      {toolCalls: [{name: 'recall', input: {query: 'cat name'}}]},
      {text: 'Pixel.'},
    ];
    const {calls} = await chat("What's my cat called?");
    const output = calls[0]!.output as {memories: Array<{fact: string}>};
    expect(output.memories[0]!.fact).toBe('Has a cat called Pixel');
  });
});

describe('many memories', () => {
  it('sends the closest and the newest, not all of them', async () => {
    for (let i = 0; i < ALL_MEMORIES_LIMIT + 10; i++) {
      await repository.create({
        userId,
        agentId: agent.id,
        content: `Unrelated fact number ${i} about topic${i}`,
        source: 'person',
        embedding: fakeEmbedding(`Unrelated fact number ${i} about topic${i}`),
        embeddingModel: 'openai/text-embedding-3-small',
      });
    }
    await addMemory('Allergic to peanuts');
    await chat('Can you suggest a snack with peanuts?');
    const {system} = sentOnStep();
    expect(system).toContain('- Allergic to peanuts');
    expect(system).toContain(`You remember ${ALL_MEMORIES_LIMIT + 11} things`);
    const listed = system.split('\n').filter(line => line.startsWith('- '));
    expect(listed.length).toBeLessThanOrEqual(ALL_MEMORIES_LIMIT + 5);
    expect(listed.length).toBeLessThan(ALL_MEMORIES_LIMIT + 11);
  });
});

describe('the Memory page', () => {
  it('adds, lists and forgets memories', async () => {
    const added = await addMemory('  Lives in Lisbon  ');
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      status: 'saved',
      memory: {content: 'Lives in Lisbon', source: 'person'},
    });
    const page = await memoryPage();
    expect(page.body.status).toEqual({
      available: true,
      provider: 'openai',
      model: 'openai/text-embedding-3-small',
    });
    expect(page.body.memories).toHaveLength(1);

    const deleted = await callApi(
      app,
      `/api/agents/${agent.id}/memories/${added.body.memory.id}`,
      {method: 'DELETE', cookie},
    );
    expect(deleted.status).toBe(200);
    expect((await memoryPage()).body.memories).toEqual([]);
  });

  it("doesn't save a reworded duplicate twice", async () => {
    await addMemory('Prefers short answers');
    const sameWords = await addMemory('prefers SHORT answers.');
    expect(sameWords.status).toBe(200);
    expect(sameWords.body.status).toBe('duplicate');
    const reworded = await addMemory(
      'The person prefers answers that are short',
    );
    expect(reworded.body).toMatchObject({
      status: 'duplicate',
      memory: {content: 'Prefers short answers'},
    });
    expect((await memoryPage()).body.memories).toHaveLength(1);
  });

  it('refuses secrets', async () => {
    const {status, body} = await addMemory('My password is hunter2');
    expect(status).toBe(400);
    expect(body.message).toBe(MEMORY_MESSAGES.secret);
  });

  it("keeps each character's memories and each person's apart", async () => {
    const other = await hire({name: 'Other'});
    const {body} = await addMemory('Likes jazz');
    expect((await memoryPage(other.id)).body.memories).toEqual([]);

    const stranger = await signUp(app, 'eve@example.com');
    expect((await memoryPage(agent.id, stranger.cookie)).status).toBe(404);
    const stolen = await callApi(
      app,
      `/api/agents/${agent.id}/memories/${body.memory.id}`,
      {method: 'DELETE', cookie: stranger.cookie},
    );
    expect(stolen.status).toBe(404);
    const wrongAgent = await callApi(
      app,
      `/api/agents/${other.id}/memories/${body.memory.id}`,
      {method: 'DELETE', cookie},
    );
    expect(wrongAgent.status).toBe(404);
    expect((await memoryPage()).body.memories).toHaveLength(1);
  });

  it('only compares vectors from the same model, and re-indexes the rest', async () => {
    await repository.create({
      userId,
      agentId: agent.id,
      content: 'Has a dog called Rex',
      source: 'person',
      embedding: fakeEmbedding('Has a dog called Rex'),
      embeddingModel: 'google/gemini-embedding-001',
    });
    const before = await memoryPage();
    expect(before.body.otherModelCount).toBe(1);
    expect(before.body.memories[0]!.searchable).toBe(false);

    // Search can't reach it, but the same words are still a duplicate.
    expect((await addMemory('has a dog called rex')).body.status).toBe(
      'duplicate',
    );
    steps = [
      {toolCalls: [{name: 'recall', input: {query: 'dog'}}]},
      {text: 'Rex.'},
    ];
    let {calls} = await chat("What's my dog called?");
    expect(calls[0]!.output).toEqual({memories: []});

    const reindexed = await callApi(
      app,
      `/api/agents/${agent.id}/memories/reindex`,
      {method: 'POST', cookie},
    );
    expect(await reindexed.json()).toEqual({reindexed: 1});
    expect((await memoryPage()).body.otherModelCount).toBe(0);
    ({calls} = await chat("What's my dog called?"));
    const output = calls[0]!.output as {memories: Array<{fact: string}>};
    expect(output.memories[0]!.fact).toBe('Has a dog called Rex');
  });
});

describe('with only an Anthropic key', () => {
  beforeEach(async () => {
    await resetDatabase(db);
    ({cookie, userId} = await signUp(app));
    await addKey('anthropic');
    agent = await hire({provider: 'anthropic', model: 'claude-haiku-5-5'});
  });

  it('says which key to add, and saves nothing', async () => {
    const page = await memoryPage();
    expect(page.body.status).toEqual({
      available: false,
      message: EMBEDDINGS_NEED_KEY,
    });
    const added = await addMemory('Prefers short answers');
    expect(added.status).toBe(409);
    expect(added.body).toMatchObject({code: 'NO_KEY'});
  });

  it('chats without memory tools', async () => {
    await chat('Hello');
    const {system, tools} = sentOnStep();
    expect(tools).not.toContain('remember');
    expect(system).not.toContain('What you remember');
    expect(system).not.toContain('knowledge library');
    expect(embedded.values).toEqual([]);
  });

  it('picks OpenAI first when both keys are saved', async () => {
    await addKey('google');
    expect((await memoryPage()).body.status).toMatchObject({
      provider: 'google',
    });
    await addKey('openai');
    expect((await memoryPage()).body.status).toMatchObject({
      provider: 'openai',
    });
  });
});
