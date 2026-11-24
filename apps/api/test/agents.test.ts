import {AgentTemplateRepository, agents as agentsTable} from '@binary/db';
import type {AgentSummary} from '@binary/shared';
import {AGENT_MESSAGES} from '@binary/shared';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import {TEMPLATES} from '../src/seed';
import {callApi, createTestApp, resetDatabase, signUp} from './helpers';

const {app, db} = createTestApp();

const nova = {
  name: 'Ada',
  role: 'Finds, reads and summarizes sources on any topic.',
  instructions: 'Answer with a short summary and a list of sources.',
  avatar: 'nova',
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
};

let cookie: string;

async function addKey(provider = 'anthropic', as = cookie) {
  await callApi(app, `/api/keys/${provider}`, {
    method: 'PUT',
    body: {key: 'sk-test-key-0000000000000000000000AAAA'},
    cookie: as,
  });
}

async function hire(body: object = nova, as = cookie) {
  return callApi(app, '/api/agents', {method: 'POST', body, cookie: as});
}

async function hireAgent(body: object = nova): Promise<AgentSummary> {
  const response = await hire(body);
  return ((await response.json()) as {agent: AgentSummary}).agent;
}

beforeAll(async () => {
  const templates = new AgentTemplateRepository(db);
  for (const template of TEMPLATES) {
    await templates.upsert(template);
  }
});

beforeEach(async () => {
  await resetDatabase(db);
  ({cookie} = await signUp(app));
  await addKey();
});

afterAll(async () => {
  await db.$client.end();
});

describe('hiring', () => {
  it('hires an agent and returns only the fields the app needs', async () => {
    const response = await hire();

    expect(response.status).toBe(201);
    const {agent} = (await response.json()) as {agent: AgentSummary};
    expect(Object.keys(agent).sort()).toEqual([
      'approvalMode',
      'avatar',
      'computers',
      'engine',
      'id',
      'instructions',
      'model',
      'name',
      'provider',
      'role',
      'runnerId',
      'templateId',
    ]);
    expect(agent).toMatchObject({
      name: 'Ada',
      avatar: 'nova',
      // New characters start on Auto-approve reads, with no computer.
      approvalMode: 'auto_reads',
      computers: [],
      engine: 'api',
      runnerId: null,
    });
  });

  it('copies a template, so editing the agent leaves the template alone', async () => {
    const [template] = await new AgentTemplateRepository(db).list();
    const agent = await hireAgent({...nova, templateId: template!.id});

    await callApi(app, `/api/agents/${agent.id}`, {
      method: 'PATCH',
      body: {...nova, role: 'Something else entirely.'},
      cookie,
    });

    expect(agent.templateId).toBe(template!.id);
    const after = await new AgentTemplateRepository(db).findById(template!.id);
    expect(after?.role).toBe(template!.role);
  });

  it('drops a template id that does not exist', async () => {
    const agent = await hireAgent({
      ...nova,
      templateId: '00000000-0000-4000-8000-000000000000',
    });

    expect(agent.templateId).toBeNull();
  });

  it('only allows a provider you have a key for', async () => {
    const response = await hire({
      ...nova,
      provider: 'openai',
      model: 'gpt-5.4-mini',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'NO_KEY',
      fieldErrors: {
        provider: 'Add your OpenAI key on the API keys page first.',
      },
    });
    expect(await db.select().from(agentsTable)).toHaveLength(0);
  });

  it('rejects invalid input with the shared message', async () => {
    const response = await hire({...nova, name: ''});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: AGENT_MESSAGES.nameRequired,
    });
  });

  it('lists your crew', async () => {
    await hireAgent();
    await hireAgent({...nova, name: 'Bolt', avatar: 'bolt'});

    const response = await callApi(app, '/api/agents', {cookie});
    const {agents} = (await response.json()) as {agents: AgentSummary[]};

    expect(agents.map(a => a.name)).toEqual(['Ada', 'Bolt']);
  });
});

describe('editing and firing', () => {
  it('renames an agent and switches its character', async () => {
    const agent = await hireAgent();

    const response = await callApi(app, `/api/agents/${agent.id}`, {
      method: 'PATCH',
      body: {...nova, name: 'Ada II', avatar: 'juno'},
      cookie,
    });

    expect(await response.json()).toMatchObject({
      agent: {name: 'Ada II', avatar: 'juno'},
    });
  });

  it('fires an agent, removing it from the crew', async () => {
    const agent = await hireAgent();
    const fire = () =>
      callApi(app, `/api/agents/${agent.id}`, {method: 'DELETE', cookie});

    expect((await fire()).status).toBe(200);
    const list = await callApi(app, '/api/agents', {cookie});
    expect(await list.json()).toEqual({agents: []});
    // Gone for editing too, and can't be fired twice.
    const page = await callApi(app, `/api/agents/${agent.id}`, {cookie});
    expect(page.status).toBe(404);
    expect((await fire()).status).toBe(404);
  });
});

describe('ownership', () => {
  it("treats another person's agent exactly like a missing one", async () => {
    const agent = await hireAgent();
    const grace = await signUp(app, 'grace@example.com');
    await addKey('anthropic', grace.cookie);

    const asGrace = (method: string, path = '', body?: object) =>
      callApi(app, `/api/agents/${agent.id}${path}`, {
        method,
        body,
        cookie: grace.cookie,
      });

    for (const response of [
      await asGrace('GET'),
      await asGrace('PATCH', '', nova),
      await asGrace('DELETE'),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: 'NOT_FOUND',
        message: 'There is no agent here.',
      });
    }

    const graceList = await callApi(app, '/api/agents', {cookie: grace.cookie});
    expect(await graceList.json()).toEqual({agents: []});
    // Ada is untouched.
    const mine = await callApi(app, `/api/agents/${agent.id}`, {cookie});
    expect(await mine.json()).toMatchObject({agent: {name: 'Ada'}});
  });

  it('answers 404 for an id that is not even valid', async () => {
    const response = await callApi(app, '/api/agents/not-a-uuid', {cookie});

    expect(response.status).toBe(404);
  });

  it('needs a signed-in person', async () => {
    const response = await callApi(app, '/api/agents');

    expect(response.status).toBe(401);
  });
});

describe('templates', () => {
  it('lists the seeded templates with the character who plays each', async () => {
    const response = await callApi(app, '/api/agent-templates', {cookie});
    const {templates} = (await response.json()) as {
      templates: Array<{slug: string; character: string}>;
    };

    expect(
      Object.fromEntries(templates.map(t => [t.slug, t.character])),
    ).toEqual({
      'research-assistant': 'nova',
      'coding-agent': 'bolt',
      'inbox-manager': 'mimi',
      'personal-assistant': 'sunny',
    });
  });
});
