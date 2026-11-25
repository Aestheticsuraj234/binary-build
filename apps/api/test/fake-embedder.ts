import {createHash} from 'node:crypto';

import {EMBEDDING_DIMENSIONS} from '@binary/db';
import {MockEmbeddingModelV4} from 'ai/test';

import type {EmbeddingModelBuilder} from '../src/embeddings/embedder';

/** Words that carry no meaning here. */
const STOP_WORDS = new Set(
  (
    'a an and are as at be by do does for from has have i in is it its ' +
    'me my of on or our so that the their them they this to was we what ' +
    'when which who will with you your person'
  ).split(' '),
);

/** "answers" and "answer", "prefers" and "prefer" count as one word. */
function stem(word: string): string {
  return word.replace(/(?:ing|ed|es|s)$/, '') || word;
}

/**
 * A pretend embedding: each meaningful word lands on a few fixed places in
 * the vector, so texts that share words are close and texts that don't
 * are far apart. Deterministic and offline, like a real model only in the
 * way the tests need.
 */
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word && !STOP_WORDS.has(word))
    .map(stem);
  for (const word of words) {
    const hash = createHash('sha256').update(word).digest();
    for (let i = 0; i < 3; i++) {
      const slot = hash.readUInt16BE(i * 2) % EMBEDDING_DIMENSIONS;
      vector[slot]! += hash[8 + i]! % 2 === 0 ? 1 : -1;
    }
  }
  const length = Math.hypot(...vector);
  if (length === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map(value => value / length);
}

/** Every value the fake model was asked to embed, for assertions. */
export interface EmbeddingCalls {
  values: string[];
  providers: string[];
}

/**
 * A model builder for tests: every provider gets a fake that embeds with
 * `fakeEmbedding`. Pass `calls` to see what was embedded.
 */
export function fakeEmbeddingBuilder(
  calls: EmbeddingCalls = {values: [], providers: []},
): EmbeddingModelBuilder {
  return (provider, _apiKey, modelId) =>
    new MockEmbeddingModelV4({
      provider,
      modelId,
      doEmbed: async ({values}) => {
        calls.values.push(...values);
        calls.providers.push(provider);
        return {embeddings: values.map(fakeEmbedding), warnings: []};
      },
    });
}
