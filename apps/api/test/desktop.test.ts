import type {
  AgentSummary,
  ApprovalDecided,
  ChatEvent,
  ComputersOverview,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import type {MockLanguageModelV4} from 'ai/test';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import type {DesktopHandle, DesktopProvider} from '../src/desktop/provider';
import type {ModelBuilder} from '../src/engine/factory';
import {FAKE_PNG} from './fake-sandbox';
import type {ScriptedStep} from './helpers';
import {
  callApi,
  createTestApp,
  readEvents,
  resetDatabase,
  scriptedModel,
  signUp,
} from './helpers';

/** A desktop in memory: records what was done to it. */
class FakeDesktops implements DesktopProvider {
  readonly name = 'e2b';
  actions: string[] = [];
  created = 0;
  killed: string[] = [];

  reset() {
    this.actions = [];
    this.created = 0;
    this.killed = [];
  }

  private handle(id: string): DesktopHandle {
    const record = (action: string) => {
      this.actions.push(action);
    };
    return {
      id,
      liveUrl: `https://live.test/${id}?view_only=true`,
      keepAlive: async () => {},
      screenshot: async () => Buffer.from(FAKE_PNG, 'base64'),
      screenSize: async () => ({width: 1024, height: 768}),
      click: async (x, y, {button, double}) =>
        record(`click ${x},${y} ${button}${double ? ' double' : ''}`),
      type: async text => record(`type ${text}`),
      press: async keys => record(`press ${keys.join('+')}`),
      scroll: async (direction, amount) =>
        record(`scroll ${direction} ${amount}`),
      open: async target => record(`open ${target}`),
      wait: async () => {},
    };
  }

  async create() {
    this.created++;
    return this.handle(`dsk_${this.created}`);
  }

  async connect(id: string) {
    return this.killed.includes(id) ? null : this.handle(id);
  }

  async kill(id: string) {
    this.killed.push(id);
  }
}

let scripts: ScriptedStep[][] = [];
const models: MockLanguageModelV4[] = [];
const buildModel: ModelBuilder = () => {
  const model = scriptedModel(scripts.shift() ?? [{text: 'OK.'}]);
  models.push(model);
  return model;
};
const desktops = new FakeDesktops();
const {app, db} = createTestApp({
  buildModel,
  builtInTools: () => [],
  desktopProvider: desktops,
});
let cookie: string;

async function hireJuno(): Promise<AgentSummary> {
  const response = await callApi(app, '/api/agents', {
    method: 'POST',
    body: {
      name: 'Juno',
      role: 'Uses a desktop for me.',
      instructions: '',
      avatar: 'juno',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      computers: ['cloud_desktop'],
    },
    cookie,
  });
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

async function chatWithJuno() {
  const agent = await hireJuno();
  const response = await callApi(app, '/api/threads', {
    method: 'POST',
    body: {agentId: agent.id},
    cookie,
  });
  return ((await response.json()) as {thread: ThreadSummary}).thread.id;
}

async function step(threadId: string, call: {name: string; input: object}) {
  scripts.push([{toolCalls: [call]}, {text: 'There.'}]);
  const response = await callApi(app, `/api/threads/${threadId}/messages`, {
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

/** Whether a model call was sent the screenshot as an image. */
function sawScreen(model: MockLanguageModelV4, call = 0): boolean {
  return JSON.stringify(model.doStreamCalls[call]!.prompt).includes(FAKE_PNG);
}

beforeEach(async () => {
  await resetDatabase(db);
  desktops.reset();
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

describe('cloud desktop', () => {
  it('looks without asking, and the model sees the screen', async () => {
    const threadId = await chatWithJuno();

    const call = await step(threadId, {name: 'desktop_screenshot', input: {}});

    expect(call).toMatchObject({status: 'done', risk: 'read'});
    expect(call.images).toHaveLength(1);
    // The model's next step was sent the screen itself, as an image.
    expect(sawScreen(models.at(-1)!, 1)).toBe(true);
    expect(desktops.created).toBe(1);
  });

  it('asks before clicking; after approval it sees the new screen', async () => {
    const threadId = await chatWithJuno();
    await step(threadId, {name: 'desktop_screenshot', input: {}});

    const click = await step(threadId, {
      name: 'desktop_click',
      input: {x: 120, y: 340},
    });
    expect(click).toMatchObject({status: 'waiting', risk: 'computer'});
    expect(desktops.actions).toEqual([]);

    scripts.push([{text: 'Clicked it. The page changed.'}]);
    const decided = (await (
      await callApi(app, `/api/approvals/${click.approvalId}/approve`, {
        method: 'POST',
        cookie,
      })
    ).json()) as ApprovalDecided;

    expect(desktops.actions).toEqual(['click 120,340 left']);
    expect(decided.call.status).toBe('done');
    expect(decided.call.images).toHaveLength(1);
    // The follow-up looked at the new screen.
    expect(sawScreen(models.at(-1)!)).toBe(true);
    expect(decided.reply?.content).toBe('Clicked it. The page changed.');
  });

  it('is listed with a live view, and stops', async () => {
    const threadId = await chatWithJuno();
    await step(threadId, {name: 'desktop_screenshot', input: {}});

    const overview = (await (
      await callApi(app, '/api/computers', {cookie})
    ).json()) as ComputersOverview;
    expect(overview.desktop.available).toBe(true);
    expect(overview.computers).toMatchObject([
      {
        kind: 'cloud_desktop',
        threadId,
        liveUrl: 'https://live.test/dsk_1?view_only=true',
      },
    ]);

    await callApi(app, `/api/computers/${overview.computers[0]!.id}/stop`, {
      method: 'POST',
      cookie,
    });
    expect(desktops.killed).toEqual(['dsk_1']);
  });
});
