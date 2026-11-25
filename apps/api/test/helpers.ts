import type {Database} from '@binary/db';
import {createDb, sql} from '@binary/db';
import {simulateReadableStream} from 'ai';
import {MockLanguageModelV4} from 'ai/test';

import {createApp} from '../src/app';
import {createAuth} from '../src/auth';
import type {EmbeddingModelBuilder} from '../src/embeddings/embedder';
import type {ModelBuilder} from '../src/engine/factory';
import type {PageFetcher} from '../src/knowledge/library';
import type {JobRunner} from '../src/jobs/job-runner';
import type {BrowserManager} from '../src/browser/manager';
import type {DesktopProvider} from '../src/desktop/provider';
import type {SandboxProvider} from '../src/sandbox/provider';
import type {ComposioGateway} from '../src/tools/composio';
import type {BinaryTool} from '../src/tools/toolbox';
import type {Vault} from '../src/vault';
import {createVault} from '../src/vault';
import {fakeEmbeddingBuilder} from './fake-embedder';
import {
  API_URL,
  TEST_DATABASE_URL,
  TEST_ENCRYPTION_KEY,
  TEST_SECRET,
  WEB_URL,
} from './test-env';

/** Builds the real app against the test database. */
export function createTestApp(
  options: {
    buildModel?: ModelBuilder;
    /** Embeddings: the offline fake unless a test passes its own. */
    buildEmbeddingModel?: EmbeddingModelBuilder;
    /** Fetches pages for Knowledge (one that can reach the test server). */
    fetchPage?: PageFetcher;
    builtInTools?: () => BinaryTool[];
    composio?: ComposioGateway | null;
    /** Builds the job runner from the test app's database and vault. */
    jobRunner?: (deps: {db: Database; vault: Vault}) => JobRunner;
    /** Cloud sandboxes (a fake in tests), or none. */
    sandboxProvider?: SandboxProvider | null;
    /** Browsers (allowed to reach the test server), or none. */
    browsers?: BrowserManager;
    /** Cloud desktops (a fake in tests), or none. */
    desktopProvider?: DesktopProvider | null;
  } = {},
) {
  const db: Database = createDb(TEST_DATABASE_URL);
  const trustedOrigins = [WEB_URL, 'binary://', 'exp://'];
  const auth = createAuth({
    db,
    secret: TEST_SECRET,
    baseUrl: API_URL,
    trustedOrigins,
  });
  const vault = createVault(TEST_ENCRYPTION_KEY);
  const app = createApp({
    auth,
    db,
    vault,
    trustedOrigins,
    buildModel: options.buildModel,
    // Never the real providers: tests stay offline.
    buildEmbeddingModel: options.buildEmbeddingModel ?? fakeEmbeddingBuilder(),
    fetchPage: options.fetchPage,
    builtInTools: options.builtInTools,
    composio: options.composio,
    webUrl: WEB_URL,
    apiUrl: API_URL,
    jobRunner: options.jobRunner?.({db, vault}),
    sandboxProvider: options.sandboxProvider ?? null,
    browsers: options.browsers,
    desktopProvider: options.desktopProvider ?? null,
  });
  return {app, db, vault};
}

export type TestApp = ReturnType<typeof createTestApp>['app'];

/** Removes every user. Their sessions and keys go with them. */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE "user", verification CASCADE`);
}

/** Turns a response's Set-Cookie headers into a Cookie header. */
export function cookieFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ');
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
}

/** Calls the app the way the web app does: JSON, from the web origin. */
export function callApi(
  app: TestApp,
  path: string,
  {method = 'GET', body, cookie, headers = {}}: RequestOptions = {},
): Promise<Response> {
  const allHeaders: Record<string, string> = {origin: WEB_URL, ...headers};
  if (body !== undefined) {
    allHeaders['content-type'] = 'application/json';
  }
  if (cookie) {
    allHeaders.cookie = cookie;
  }
  return Promise.resolve(
    app.request(`${API_URL}${path}`, {
      method,
      headers: allHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

/** Creates an account and returns its session cookie. */
export async function signUp(
  app: TestApp,
  email = 'ada@example.com',
): Promise<{cookie: string; userId: string}> {
  const response = await callApi(app, '/api/auth/sign-up/email', {
    method: 'POST',
    body: {name: 'Ada Lovelace', email, password: 'correct horse battery'},
  });
  const {user} = (await response.json()) as {user: {id: string}};
  return {cookie: cookieFrom(response), userId: user.id};
}

/** Usage numbers for a fake model's `finish` part. */
const FAKE_USAGE = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {total: 5, text: 5, reasoning: undefined},
};

/**
 * A fake model that streams `reply` word by word. `delayMs` waits between
 * words, like a real model typing.
 */
export function fakeModel(
  reply: string,
  {delayMs = 0}: {delayMs?: number} = {},
): MockLanguageModelV4 {
  const words = reply.split(/(?<= )/);
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: delayMs,
        chunks: [
          {type: 'text-start', id: 'text-1'},
          ...words.map(word => ({
            type: 'text-delta' as const,
            id: 'text-1',
            delta: word,
          })),
          {type: 'text-end', id: 'text-1'},
          {
            type: 'finish',
            finishReason: {unified: 'stop', raw: undefined},
            usage: FAKE_USAGE,
          },
        ],
      }),
    }),
  });
}

/** A fake model that writes `partial`, then the provider fails. */
export function brokenModel(
  partial: string,
  error: Error,
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          {type: 'text-start', id: 'text-1'},
          ...partial.split(/(?<= )/).map(word => ({
            type: 'text-delta' as const,
            id: 'text-1',
            delta: word,
          })),
          {type: 'error', error},
        ],
      }),
    }),
  });
}

/** A fake model whose provider fails with an HTTP error. */
export function failingModel(error: Error): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw error;
    },
  });
}

/** Reads a streamed response into its list of events. */
export async function readEvents(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter(line => line !== '')
    .map(line => JSON.parse(line) as unknown);
}

/** One model call in a scripted conversation: tool calls, or text. */
export type ScriptedStep =
  {toolCalls: Array<{name: string; input: object}>} | {text: string};

/**
 * A fake model that plays `steps` in order, one per model call: first it
 * asks for tools, then (after reading their results) it writes its answer.
 */
export function scriptedModel(steps: ScriptedStep[]): MockLanguageModelV4 {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(call, steps.length - 1)]!;
      const stepIndex = call++;
      const chunks =
        'toolCalls' in step
          ? step.toolCalls.map((toolCall, index) => ({
              type: 'tool-call' as const,
              toolCallId: `call-${stepIndex}-${index}`,
              toolName: toolCall.name,
              input: JSON.stringify(toolCall.input),
            }))
          : [
              {type: 'text-start' as const, id: 'text-1'},
              {type: 'text-delta' as const, id: 'text-1', delta: step.text},
              {type: 'text-end' as const, id: 'text-1'},
            ];
      return {
        stream: simulateReadableStream({
          chunks: [
            ...chunks,
            {
              type: 'finish' as const,
              finishReason: {
                unified: 'toolCalls' in step ? 'tool-calls' : 'stop',
                raw: undefined,
              },
              usage: FAKE_USAGE,
            },
          ],
        }),
      };
    },
  });
}
