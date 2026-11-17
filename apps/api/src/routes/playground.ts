import {
  API_ERROR_CODES,
  getProvider,
  playgroundSchema,
  validate,
} from '@binary/shared';
import {Hono} from 'hono';

import type {Engine} from '../engine/engine';
import type {EngineFactory} from '../engine/factory';
import {MissingKeyError} from '../engine/factory';
import type {SignedInEnv} from '../middleware/require-user';
import {VaultError} from '../vault';
import {streamAnswer} from './stream-answer';

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

    return streamAnswer(engine, {prompt, signal: c.req.raw.signal});
  });

  return routes;
}
