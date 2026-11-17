import {createAnthropic} from '@ai-sdk/anthropic';
import {createGoogle} from '@ai-sdk/google';
import {createOpenAI} from '@ai-sdk/openai';
import type {Database} from '@binary/db';
import type {ProviderId} from '@binary/shared';
import {getProvider} from '@binary/shared';
import type {LanguageModel} from 'ai';

import {findEncryptedKey} from '../key-store';
import type {Vault} from '../vault';
import {ApiEngine} from './api-engine';
import type {Engine} from './engine';

/** Makes an AI SDK model for a provider, signed with a plain API key. */
export type ModelBuilder = (
  provider: ProviderId,
  apiKey: string,
  modelId: string,
) => LanguageModel;

/** The real providers. Tests pass a fake builder instead. */
export const buildProviderModel: ModelBuilder = (provider, apiKey, modelId) => {
  switch (provider) {
    case 'openai':
      return createOpenAI({apiKey})(modelId);
    case 'anthropic':
      return createAnthropic({apiKey})(modelId);
    case 'google':
      return createGoogle({apiKey})(modelId);
  }
};

/** Thrown when the person has not saved a key for this provider. */
export class MissingKeyError extends Error {
  readonly provider: ProviderId;

  constructor(provider: ProviderId) {
    super(`No ${getProvider(provider).name} key saved.`);
    this.name = 'MissingKeyError';
    this.provider = provider;
  }
}

export interface EngineFactoryOptions {
  db: Database;
  vault: Vault;
  /** Defaults to the real providers. */
  buildModel?: ModelBuilder;
}

/** Hands back a ready engine for one person and one model. */
export type EngineFactory = (
  userId: string,
  provider: ProviderId,
  model?: string,
) => Promise<Engine>;

/**
 * Creates the engine factory. It finds the person's saved key, decrypts it,
 * and builds an engine around it. The plain key only exists inside this
 * function call; it is never returned, logged or stored.
 */
export function createEngineFactory({
  db,
  vault,
  buildModel = buildProviderModel,
}: EngineFactoryOptions): EngineFactory {
  return async (
    userId,
    provider,
    model = getProvider(provider).defaultModel,
  ) => {
    const encryptedKey = await findEncryptedKey(db, userId, provider);
    if (!encryptedKey) {
      throw new MissingKeyError(provider);
    }
    const apiKey = vault.decrypt(encryptedKey, {userId, provider});
    return new ApiEngine(provider, model, buildModel(provider, apiKey, model));
  };
}
