import {getProvider, playgroundSchema} from '@binary/shared';
import {Hono} from 'hono';

import type {Engine} from '../engine/engine';
import {NoKeyError, readJson} from '../errors';
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
    const {provider, prompt} = await readJson(c, playgroundSchema);
    const name = getProvider(provider).name;

    let engine: Engine;
    try {
      engine = await engineFor(c.var.user.id, provider);
    } catch (error) {
      if (error instanceof MissingKeyError) {
        throw new NoKeyError(
          `Add your ${name} key on the API keys page to try it here.`,
        );
      }
      if (error instanceof VaultError) {
        // Happens if ENCRYPTION_KEY changed after the key was saved.
        throw new NoKeyError(
          `Your saved ${name} key can't be read anymore. Save it again on the API keys page.`,
        );
      }
      throw error;
    }

    return streamAnswer(engine, {prompt, signal: c.req.raw.signal});
  });

  return routes;
}
