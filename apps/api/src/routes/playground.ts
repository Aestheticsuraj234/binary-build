import type {PlaygroundEvent} from '@binary/shared';
import {
  API_ERROR_CODES,
  getProvider,
  playgroundSchema,
  validate,
} from '@binary/shared';
import {Hono} from 'hono';

import type {Engine} from '../engine/engine';
import {EngineError} from '../engine/engine';
import type {EngineFactory} from '../engine/factory';
import {MissingKeyError} from '../engine/factory';
import type {SignedInEnv} from '../middleware/require-user';
import {VaultError} from '../vault';

/**
 * Streams an engine's answer as newline-delimited JSON: a `start` line, then
 * `text` lines as the model writes, then `done` (or `error`).
 */
function streamAnswer(
  engine: Engine,
  prompt: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let isClosed = false;

  return new ReadableStream({
    async start(controller) {
      const send = (event: PlaygroundEvent) => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };

      send({type: 'start', model: engine.model});
      try {
        for await (const text of engine.stream({prompt, signal})) {
          send({type: 'text', text});
        }
        send({type: 'done'});
      } catch (error) {
        const message =
          error instanceof EngineError
            ? error.message
            : 'Something went wrong.';
        send({type: 'error', message});
      }
      if (!isClosed) {
        isClosed = true;
        controller.close();
      }
    },
    cancel() {
      // The browser went away; stop sending.
      isClosed = true;
    },
  });
}

/**
 * The Playground route, mounted at /api/playground. The web app calls it once
 * per provider, so each answer streams in on its own.
 */
export function playgroundRoutes(engineFor: EngineFactory) {
  const routes = new Hono<SignedInEnv>();

  routes.post('/', async c => {
    const body: unknown = await c.req.json().catch(() => null);
    const result = validate(playgroundSchema, body);
    if (!result.success) {
      return c.json(
        {
          code: API_ERROR_CODES.invalidInput,
          message: result.firstError,
          fieldErrors: result.errors,
        },
        400,
      );
    }
    const {provider, prompt} = result.data;
    const name = getProvider(provider).name;

    let engine: Engine;
    try {
      engine = await engineFor(c.var.user.id, provider);
    } catch (error) {
      if (error instanceof MissingKeyError) {
        return c.json(
          {
            code: API_ERROR_CODES.noKey,
            message: `Add your ${name} key on the API keys page to try it here.`,
          },
          409,
        );
      }
      if (error instanceof VaultError) {
        // Happens if ENCRYPTION_KEY changed after the key was saved.
        return c.json(
          {
            code: API_ERROR_CODES.noKey,
            message: `Your saved ${name} key can't be read anymore. Save it again on the API keys page.`,
          },
          409,
        );
      }
      throw error;
    }

    return new Response(streamAnswer(engine, prompt, c.req.raw.signal), {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  });

  return routes;
}
