import {createGoogle} from '@ai-sdk/google';
import {createOpenAI} from '@ai-sdk/openai';
import type {Database} from '@binary/db';
import {EMBEDDING_DIMENSIONS} from '@binary/db';
import type {EmbeddingProviderId, EmbeddingStatus} from '@binary/shared';
import {
  EMBEDDING_MODELS,
  EMBEDDING_PROVIDERS,
  EMBEDDINGS_NEED_KEY,
} from '@binary/shared';
import type {EmbeddingModel} from 'ai';
import {embedMany} from 'ai';

import {toEngineError} from '../engine/api-engine';
import {EmbeddingFailedError} from '../errors';
import {findEncryptedKey} from '../key-store';
import type {Vault} from '../vault';

/**
 * Turns text into vectors for one person, with their own key. `model`
 * names the model ("openai/text-embedding-3-small") and is saved next to
 * every vector, because vectors from two models can't be compared.
 */
export interface Embedder {
  readonly provider: EmbeddingProviderId;
  readonly model: string;
  /** One vector per value, in the same order. Throws `EmbeddingFailedError`. */
  embed(values: string[]): Promise<number[][]>;
}

/** Makes an AI SDK embedding model, signed with a plain API key. */
export type EmbeddingModelBuilder = (
  provider: EmbeddingProviderId,
  apiKey: string,
  modelId: string,
) => EmbeddingModel;

/** The real providers. Tests pass a fake builder instead. */
export const buildProviderEmbeddingModel: EmbeddingModelBuilder = (
  provider,
  apiKey,
  modelId,
) => {
  switch (provider) {
    case 'openai':
      return createOpenAI({apiKey}).embedding(modelId);
    case 'google':
      return createGoogle({apiKey}).embedding(modelId);
  }
};

/** An `Embedder` around an AI SDK embedding model. */
export function createEmbedder(
  provider: EmbeddingProviderId,
  modelId: string,
  model: EmbeddingModel,
): Embedder {
  return {
    provider,
    model: `${provider}/${modelId}`,
    async embed(values) {
      if (values.length === 0) {
        return [];
      }
      let embeddings: number[][];
      try {
        ({embeddings} = await embedMany({
          model,
          values,
          // Both providers can shorten their vectors to fit one column.
          dimensions: EMBEDDING_DIMENSIONS,
          maxParallelCalls: 2,
        }));
      } catch (error) {
        throw new EmbeddingFailedError(
          toEngineError(error, provider, modelId).message,
        );
      }
      if (embeddings.some(e => e.length !== EMBEDDING_DIMENSIONS)) {
        throw new EmbeddingFailedError(
          `${modelId} sent back vectors of the wrong size.`,
        );
      }
      return embeddings;
    },
  };
}

/** This person's embedder, or why there isn't one. */
export type EmbedderChoice =
  {ok: true; embedder: Embedder} | {ok: false; message: string};

/** Finds the embedder for one person, from their saved keys. */
export type EmbedderFactory = (userId: string) => Promise<EmbedderChoice>;

export interface EmbedderFactoryOptions {
  db: Database;
  vault: Vault;
  /** Defaults to the real providers. */
  buildEmbeddingModel?: EmbeddingModelBuilder;
}

/**
 * Creates the embedder factory. It picks the first provider in
 * `EMBEDDING_PROVIDERS` (OpenAI, then Google) with a saved key. With only
 * an Anthropic key there's no embedder, and memory and knowledge are off.
 */
export function createEmbedderFactory({
  db,
  vault,
  buildEmbeddingModel = buildProviderEmbeddingModel,
}: EmbedderFactoryOptions): EmbedderFactory {
  return async userId => {
    for (const provider of EMBEDDING_PROVIDERS) {
      const encryptedKey = await findEncryptedKey(db, userId, provider);
      if (!encryptedKey) {
        continue;
      }
      const apiKey = vault.decrypt(encryptedKey, {userId, provider});
      const modelId = EMBEDDING_MODELS[provider];
      return {
        ok: true,
        embedder: createEmbedder(
          provider,
          modelId,
          buildEmbeddingModel(provider, apiKey, modelId),
        ),
      };
    }
    return {ok: false, message: EMBEDDINGS_NEED_KEY};
  };
}

/** What the apps are told about a choice. */
export function toEmbeddingStatus(choice: EmbedderChoice): EmbeddingStatus {
  return choice.ok
    ? {
        available: true,
        provider: choice.embedder.provider,
        model: choice.embedder.model,
      }
    : {available: false, message: choice.message};
}

/** An embedder factory that never has one, for code that runs without it. */
export const noEmbeddings: EmbedderFactory = async () => ({
  ok: false,
  message: EMBEDDINGS_NEED_KEY,
});
