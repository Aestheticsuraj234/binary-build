import type {
  AgentSummary,
  ApprovalSummary,
  ChatMessage,
  RoomDetail,
  RoomEvent,
  RoomSummary,
  ThreadSummary,
  ToolRisk,
} from '@binary/shared';
import {ROOM_MAX_ANSWERS, ROOM_MESSAGES} from '@binary/shared';
import {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';
import {z} from 'zod';

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

// --- One fake model for everyone: it answers as whoever the system prompt
// says it is, from that character's script, and routes for the lead. ---

/** Each character's next answers; the last one repeats. */
const scripts = new Map<string, ScriptedStep[]>();
/** What each character was sent, in order. */
const sent: Array<{name: string; system: string; prompt: string}> = [];
let routerReply = '{"answer": []}';
let routerCalls = 0;

function teamModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async options => {
      const system = options.prompt
        .filter(message => message.role === 'system')
        .map(message => message.content)
        .join('\n');
      if (system.includes('you decide who should answer')) {
        routerCalls++;
        return scriptedModel([{text: routerReply}]).doStream(options);
      }
      const name = /^You are ([^,]+),/.exec(system)?.[1] ?? '?';
      sent.push({name, system, prompt: JSON.stringify(options.prompt)});
      const steps = scripts.get(name) ?? [];
      const step =
        steps.length > 1
          ? steps.shift()!
          : (steps[0] ?? {text: `${name} here.`});
      return scriptedModel([step]).doStream(options);
    },
  });
}

let ran: string[] = [];
function fakeTool(name: string, risk: ToolRisk): BinaryTool {
  return {
    name,
    description: `Fake ${name}.`,
    risk,
    inputSchema: z.object({to: z.string().optional()}),
    async run(input) {
      ran.push(`${name}:${JSON.stringify(input)}`);
      return {ok: true};
    },
  };
}

const {app, db} = createTestApp({
  buildModel: () => teamModel(),
  builtInTools: () => [fakeTool('send_email', 'write')],
});

let cookie: string;
let nova: AgentSummary;
let bolt: AgentSummary;
let ember: AgentSummary;

async function hire(name: string, avatar: string, overrides: object = {}) {
  const response = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name,
      role: `${name}'s job.`,
      instructions: '',
      avatar,
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      ...overrides,
    },
    cookie,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

async function createRoom(body: object = {}, as = cookie) {
  const response = await callApi(app, '/api/rooms', {
    method: 'POST',
    body: {
      name: 'Launch',
      mode: 'mention',
      agentIds: [nova.id, bolt.id, ember.id],
      leadAgentId: nova.id,
      ...body,
    },
    cookie: as,
  });
  return {
    status: response.status,
    body: (await response.json()) as {room: RoomSummary; message?: string},
  };
}

async function say(roomId: string, message: string) {
  const response = await callApi(app, `/api/rooms/${roomId}/messages`, {
    method: 'POST',
    body: {message},
    cookie,
  });
  const events = (await readEvents(response)) as RoomEvent[];
  const answers = events.flatMap(e => (e.type === 'answer' ? [e.message] : []));
  return {events, answers, end: events.at(-1)};
}

async function getRoom(roomId: string, as = cookie) {
  const response = await callApi(app, `/api/rooms/${roomId}`, {cookie: as});
  return {status: response.status, body: (await response.json()) as RoomDetail};
}

/** Who wrote each answer, by name. */
function authors(answers: ChatMessage[]): string[] {
  const names = new Map([nova, bolt, ember].map(a => [a.id, a.name]));
  return answers.map(a => names.get(a.agentId ?? '') ?? '?');
}

beforeEach(async () => {
  await resetDatabase(db);
  scripts.clear();
  sent.length = 0;
  routerReply = '{"answer": []}';
  routerCalls = 0;
  ran = [];
  ({cookie} = await signUp(app));
  await callApi(app, '/api/keys/anthropic', {
    method: 'PUT',
    body: {key: 'sk-test-key-0000000000000000000000AAAA'},
    cookie,
  });
  nova = await hire('Nova', 'nova');
  bolt = await hire('Bolt', 'moss');
  ember = await hire('Ember', 'mimi');
});

afterAll(async () => {
  await db.$client.end();
});

describe('rooms', () => {
  it('creates, lists, edits and deletes a room, and keeps its characters', async () => {
    const {status, body} = await createRoom();
    expect(status).toBe(201);
    expect(body.room).toMatchObject({
      name: 'Launch',
      mode: 'mention',
      leadAgentId: nova.id,
      title: null,
    });
    expect(body.room.members.map(m => m.name)).toEqual([
      'Nova',
      'Bolt',
      'Ember',
    ]);

    const list = await callApi(app, '/api/rooms', {cookie});
    expect(((await list.json()) as {rooms: RoomSummary[]}).rooms).toHaveLength(
      1,
    );

    const edited = await callApi(app, `/api/rooms/${body.room.id}`, {
      method: 'PATCH',
      body: {
        name: 'Launch team',
        mode: 'auto',
        agentIds: [bolt.id, nova.id],
        leadAgentId: bolt.id,
      },
      cookie,
    });
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as {room: RoomSummary}).room).toMatchObject({
      name: 'Launch team',
      mode: 'auto',
      leadAgentId: bolt.id,
      members: [{name: 'Bolt'}, {name: 'Nova'}],
    });

    const deleted = await callApi(app, `/api/rooms/${body.room.id}`, {
      method: 'DELETE',
      cookie,
    });
    expect(deleted.status).toBe(200);
    expect((await getRoom(body.room.id)).status).toBe(404);
    const agents = await callApi(app, '/api/agents', {cookie});
    expect(
      ((await agents.json()) as {agents: AgentSummary[]}).agents,
    ).toHaveLength(3);
  });

  it('checks the form', async () => {
    expect((await createRoom({agentIds: [nova.id]})).body.message).toBe(
      ROOM_MESSAGES.tooFew,
    );
    expect(
      (await createRoom({agentIds: [bolt.id, ember.id]})).body.message,
    ).toBe(ROOM_MESSAGES.leadNotMember);
    const twin = await hire('nova', 'pebble');
    expect(
      (await createRoom({agentIds: [nova.id, twin.id]})).body.message,
    ).toBe(ROOM_MESSAGES.sameName);

    const eve = await signUp(app, 'eve@example.com');
    const stolen = await createRoom({}, eve.cookie);
    expect(stolen.status).toBe(400);
    expect(stolen.body.message).toBe(ROOM_MESSAGES.notYours);
  });

  it('keeps rooms private, and out of Recent chats', async () => {
    const {body} = await createRoom();
    await say(body.room.id, 'Hello team');
    const eve = await signUp(app, 'eve@example.com');
    expect((await getRoom(body.room.id, eve.cookie)).status).toBe(404);

    const chats = await callApi(app, '/api/threads', {cookie});
    expect(
      ((await chats.json()) as {threads: ThreadSummary[]}).threads,
    ).toEqual([]);
    const asChat = await callApi(app, `/api/threads/${body.room.threadId}`, {
      cookie,
    });
    expect(asChat.status).toBe(404);
  });
});

describe('who answers', () => {
  it('lets the lead answer when nobody is mentioned', async () => {
    const {body} = await createRoom();
    const {events, answers, end} = await say(body.room.id, 'Plan the launch.');
    expect(events[1]).toEqual({
      type: 'routed',
      agentIds: [nova.id],
      by: 'lead',
    });
    expect(authors(answers)).toEqual(['Nova']);
    expect(end).toEqual({type: 'end', answers: 1, capped: false});
    expect(routerCalls).toBe(0);
  });

  it('lets the mentioned characters answer, in order, each seeing the last', async () => {
    const {body} = await createRoom();
    scripts.set('Bolt', [{text: 'I can build it by Friday.'}]);
    const {answers} = await say(body.room.id, '@Bolt and @ember, thoughts?');
    expect(authors(answers)).toEqual(['Bolt', 'Ember']);

    const emberSaw = sent.find(s => s.name === 'Ember')!;
    expect(emberSaw.prompt).toContain('[Bolt]: I can build it by Friday.');
    expect(emberSaw.system).toContain('You\'re in a room called "Launch"');
    expect(emberSaw.system).toContain('- Nova (lead)');
    expect(emberSaw.system).toContain('- Bolt:');
    expect(emberSaw.system).toContain('Answer only your part');

    // Saved, with who said what.
    const {body: detail} = await getRoom(body.room.id);
    expect(detail.messages.map(m => [m.role, m.agentId ?? null])).toEqual([
      ['user', null],
      ['assistant', bolt.id],
      ['assistant', ember.id],
    ]);
  });

  it('lets the lead pick in automatic mode, and a mention still wins', async () => {
    const {body} = await createRoom({mode: 'auto'});
    routerReply = '{"answer": ["Bolt", "Ember"]}';
    const picked = await say(body.room.id, 'Build the page and write copy.');
    expect(picked.events[1]).toMatchObject({type: 'routed', by: 'router'});
    expect(authors(picked.answers)).toEqual(['Bolt', 'Ember']);
    expect(routerCalls).toBe(1);

    const mentioned = await say(body.room.id, '@Nova what do you think?');
    expect(mentioned.events[1]).toMatchObject({type: 'routed', by: 'mention'});
    expect(authors(mentioned.answers)).toEqual(['Nova']);
    expect(routerCalls).toBe(1);
  });

  it('falls back to the lead when routing names nobody', async () => {
    const {body} = await createRoom({mode: 'auto'});
    routerReply = 'Hmm, not sure.';
    const {events, answers} = await say(body.room.id, 'Hi');
    expect(events[1]).toMatchObject({by: 'lead'});
    expect(authors(answers)).toEqual(['Nova']);
  });
});

describe('hand-offs', () => {
  it('passes the turn to a teammate mentioned in an answer', async () => {
    const {body} = await createRoom();
    scripts.set('Nova', [{text: 'Researched. @Bolt, can you prototype it?'}]);
    scripts.set('Bolt', [{text: 'Prototype is up.'}]);
    const {events, answers} = await say(
      body.room.id,
      'Research it, then build it.',
    );
    expect(authors(answers)).toEqual(['Nova', 'Bolt']);
    expect(events).toContainEqual({
      type: 'handoff',
      from: nova.id,
      agentIds: [bolt.id],
    });
    const boltSaw = sent.find(s => s.name === 'Bolt')!;
    expect(boltSaw.prompt).toContain('[Nova]: Researched. @Bolt');
    expect(boltSaw.prompt).toContain('Nova handed part of this to you');
  });

  it(`never gives one message more than ${ROOM_MAX_ANSWERS} answers`, async () => {
    const {body} = await createRoom();
    scripts.set('Nova', [{text: 'Over to you, @Bolt.'}]);
    scripts.set('Bolt', [{text: 'Back to you, @Nova.'}]);
    const {answers, end} = await say(body.room.id, 'Go.');
    expect(authors(answers)).toEqual(['Nova', 'Bolt', 'Nova', 'Bolt']);
    expect(end).toEqual({type: 'end', answers: ROOM_MAX_ANSWERS, capped: true});
  });

  it("doesn't hand off to itself, or to someone outside the room", async () => {
    const outsider = await hire('Zed', 'pebble');
    const {body} = await createRoom({agentIds: [nova.id, bolt.id]});
    scripts.set('Nova', [{text: `I'm @Nova. Ask @${outsider.name}?`}]);
    const {answers, end} = await say(body.room.id, 'Hi');
    expect(authors(answers)).toEqual(['Nova']);
    expect(end).toMatchObject({capped: false});
  });
});

describe('each character stays itself', () => {
  it('keeps going when one character fails', async () => {
    await callApi(app, '/api/keys/google', {
      method: 'PUT',
      body: {key: 'test-google-key-000000000000000000AAAA'},
      cookie,
    });
    const flaky = await hire('Flaky', 'pebble', {
      provider: 'google',
      model: 'gemini-flash-latest',
    });
    await callApi(app, '/api/keys/google', {method: 'DELETE', cookie});
    const {body} = await createRoom({agentIds: [nova.id, flaky.id, bolt.id]});

    const {events, answers} = await say(body.room.id, '@Flaky and @Bolt, go.');
    const failed = events.find(e => e.type === 'turn-error');
    expect(failed).toMatchObject({
      agentId: flaky.id,
      note: {role: 'note', agentId: flaky.id},
    });
    expect(
      (failed as Extract<RoomEvent, {type: 'turn-error'}>).note.content,
    ).toContain("Flaky couldn't answer");
    expect(answers).toHaveLength(1);
    expect(answers[0]!.agentId).toBe(bolt.id);
  });

  it("uses each character's own memory", async () => {
    await callApi(app, '/api/keys/openai', {
      method: 'PUT',
      body: {key: 'test-openai-key-000000000000000000AAAA'},
      cookie,
    });
    await callApi(app, `/api/agents/${bolt.id}/memories`, {
      method: 'POST',
      body: {content: 'Prefers TypeScript'},
      cookie,
    });
    const {body} = await createRoom();
    await say(body.room.id, '@Nova @Bolt which language?');
    expect(sent.find(s => s.name === 'Bolt')!.system).toContain(
      '- Prefers TypeScript',
    );
    expect(sent.find(s => s.name === 'Nova')!.system).not.toContain(
      'Prefers TypeScript',
    );
  });

  it("sends a character's approvals to Today, and that character follows up", async () => {
    const {body} = await createRoom();
    scripts.set('Bolt', [
      {toolCalls: [{name: 'send_email', input: {to: 'ada@example.com'}}]},
      {text: "I've asked to email Ada."},
      {text: 'Sent it.'},
    ]);
    await say(body.room.id, '@Bolt email Ada the plan.');
    expect(ran).toEqual([]);

    const today = await callApi(app, '/api/approvals', {cookie});
    const {approvals} = (await today.json()) as {approvals: ApprovalSummary[]};
    expect(approvals).toEqual([
      expect.objectContaining({
        agentId: bolt.id,
        toolName: 'send_email',
        room: {id: body.room.id, name: 'Launch'},
      }),
    ]);

    const decided = await callApi(
      app,
      `/api/approvals/${approvals[0]!.id}/approve`,
      {method: 'POST', cookie},
    );
    const result = (await decided.json()) as {
      note: ChatMessage;
      reply: ChatMessage | null;
    };
    expect(ran).toEqual(['send_email:{"to":"ada@example.com"}']);
    expect(result.note.agentId).toBe(bolt.id);
    expect(result.reply).toMatchObject({agentId: bolt.id, content: 'Sent it.'});
    expect(sent.at(-1)!.name).toBe('Bolt');
  });
});
