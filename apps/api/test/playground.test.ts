import {ENGINE_MESSAGES} from '@binary/shared';
import {APICallError} from 'ai';
import type {LanguageModel} from 'ai';
import {afterAll, beforeEach, describe, expect, it} from 'vitest';

import type {ModelBuilder} from '../src/engine/factory';
import {
  callApi,
  createTestApp,
  failingModel,
  fakeModel,
  readEvents,
  resetDatabase,
  signUp,
} from './helpers';

/** What the fake model builder was asked for. */
const builds: Array<{provider: string; apiKey: string; modelId: string}> = [];
/** What the next model the builder makes will do. */
let nextModel: () => LanguageModel = () =>
  fakeModel('Hello from a fake model.');

const buildModel: ModelBuilder = (provider, apiKey, modelId) => {
  builds.push({provider, apiKey, modelId});
  return nextModel();
};

const {app, db} = createTestApp({buildModel});
const anthropicKey = 'sk-ant-test-DDDDDDDDDDDDDDDDDDDD4242';

let cookie: string;

beforeEach(async () => {
  await resetDatabase(db);
  builds.length = 0;
  nextModel = () => fakeModel('Hello from a fake model.');
  ({cookie} = await signUp(app));
});

afterAll(async () => {
  await db.$client.end();
});

function ask(provider: string, prompt = 'Say hello', as = cookie) {
  return callApi(app, '/api/playground', {
    method: 'POST',
    body: {provider, prompt},
    cookie: as,
  });
}

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: 'https://provider.example/v1/messages',
    requestBodyValues: {},
    statusCode,
    isRetryable: false,
  });
}

async function addAnthropicKey(): Promise<void> {
  await callApi(app, '/api/keys/anthropic', {
    method: 'PUT',
    body: {key: anthropicKey},
    cookie,
  });
}

describe('POST /api/playground', () => {
  it("streams the model's answer piece by piece", async () => {
    await addAnthropicKey();

    const response = await ask('anthropic');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(
      'application/x-ndjson',
    );
    expect(await readEvents(response)).toEqual([
      {type: 'start', model: 'claude-haiku-5-5'},
      {type: 'text', text: 'Hello '},
      {type: 'text', text: 'from '},
      {type: 'text', text: 'a '},
      {type: 'text', text: 'fake '},
      {type: 'text', text: 'model.'},
      {type: 'done'},
    ]);
  });

  it('builds the engine with the decrypted key and the default model', async () => {
    await addAnthropicKey();

    await (await ask('anthropic')).text();

    expect(builds).toEqual([
      {
        provider: 'anthropic',
        apiKey: anthropicKey,
        modelId: 'claude-haiku-5-5',
      },
    ]);
  });

  it('says so when there is no key for the provider', async () => {
    const response = await ask('openai');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'NO_KEY',
      message: 'Add your OpenAI key on the API keys page to try it here.',
    });
    expect(builds).toHaveLength(0);
  });

  it('turns a rejected key into a clear error', async () => {
    await addAnthropicKey();
    nextModel = () => failingModel(apiError(401));

    const events = await readEvents(await ask('anthropic'));

    expect(events.at(-1)).toEqual({
      type: 'error',
      message: 'Anthropic rejected this key. Check it on the API keys page.',
    });
  });

  it('turns rate limiting into a clear error', async () => {
    await addAnthropicKey();
    nextModel = () => failingModel(apiError(429));

    const events = await readEvents(await ask('anthropic'));

    expect(events.at(-1)).toEqual({
      type: 'error',
      message:
        'Anthropic is limiting requests for this key. Try again in a moment.',
    });
  });

  it('rejects an empty prompt with the shared message', async () => {
    const response = await ask('anthropic', '   ');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: ENGINE_MESSAGES.promptRequired,
    });
  });

  it('needs a signed-in person', async () => {
    const response = await ask('anthropic', 'Hi', '');

    expect(response.status).toBe(401);
  });
});
