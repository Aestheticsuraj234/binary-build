import type {Database, Memory, MemoryMatch} from '@binary/db';
import {MemoryRepository} from '@binary/db';
import type {
  EmbeddingProviderId,
  MemorySource,
  MemorySummary,
} from '@binary/shared';
import {
  ALL_MEMORIES_LIMIT,
  looksLikeSecret,
  MEMORY_MESSAGES,
  normalizeMemory,
} from '@binary/shared';

import type {Embedder} from '../embeddings/embedder';
import {InvalidInputError} from '../errors';

/**
 * How close two memories must be to count as the same fact (`same`), and
 * to be worth asking about (`similar`). Each model spreads similarity
 * differently: Gemini's scores sit higher than OpenAI's for the same text.
 */
export const MEMORY_SIMILARITY: Record<
  EmbeddingProviderId,
  {same: number; similar: number}
> = {
  openai: {same: 0.88, similar: 0.7},
  google: {same: 0.93, similar: 0.82},
};

/** Above `ALL_MEMORIES_LIMIT`, a message also gets this many newest ones. */
export const NEWEST_MEMORIES = 5;

export function toMemorySummary(
  memory: Memory,
  embeddingModel: string | null,
): MemorySummary {
  return {
    id: memory.id,
    content: memory.content,
    source: memory.source,
    searchable: memory.embeddingModel === embeddingModel,
    createdAt: memory.createdAt.toISOString(),
  };
}

/** What trying to save a memory did. */
export type RememberOutcome =
  | {status: 'saved'; memory: Memory}
  | {status: 'duplicate'; memory: Memory}
  /** Close to memories it already has: the caller decides what to do. */
  | {status: 'similar'; matches: Memory[]};

export interface RememberRequest {
  userId: string;
  agentId: string;
  content: string;
  source: MemorySource;
  /**
   * When false (the default), a memory that's only similar to others isn't
   * saved yet, so the character can check whether it's really new.
   */
  allowSimilar?: boolean;
}

/**
 * Saves one memory unless it's a secret or one this character already has:
 * the same words, or (by embedding) the same meaning. A secret throws
 * `InvalidInputError`.
 */
export async function rememberFact(
  db: Database,
  embedder: Embedder,
  {userId, agentId, content, source, allowSimilar = false}: RememberRequest,
): Promise<RememberOutcome> {
  const text = content.trim();
  if (looksLikeSecret(text)) {
    throw new InvalidInputError(MEMORY_MESSAGES.secret, {
      content: MEMORY_MESSAGES.secret,
    });
  }
  const repository = new MemoryRepository(db);
  // The same words (whatever model embedded them) are always a duplicate.
  const normalized = normalizeMemory(text);
  const all = await repository.listForAgent(userId, agentId);
  const sameWords = all.find(m => normalizeMemory(m.content) === normalized);
  if (sameWords) {
    return {status: 'duplicate', memory: sameWords};
  }

  const [embedding] = await embedder.embed([text]);
  const thresholds = MEMORY_SIMILARITY[embedder.provider];
  const close = await repository.closest(
    userId,
    agentId,
    embedding!,
    embedder.model,
    3,
  );
  const best = close[0];
  if (best && best.similarity >= thresholds.same) {
    return {status: 'duplicate', memory: best.memory};
  }
  const similar = close.filter(m => m.similarity >= thresholds.similar);
  if (similar.length > 0 && !allowSimilar) {
    return {status: 'similar', matches: similar.map(m => m.memory)};
  }

  const memory = await repository.create({
    userId,
    agentId,
    content: text,
    source,
    embedding: embedding!,
    embeddingModel: embedder.model,
  });
  return {status: 'saved', memory};
}

/**
 * The memories that go into a character's system prompt for one message.
 * Up to `ALL_MEMORIES_LIMIT`, that's all of them, oldest first, whatever
 * model made them: nothing needs comparing. Above it, the ones closest to
 * the message plus the newest few. If the search fails, the newest ones.
 */
export async function memoriesForPrompt(
  db: Database,
  embedder: Embedder,
  {userId, agentId, prompt}: {userId: string; agentId: string; prompt: string},
): Promise<{memories: Memory[]; total: number}> {
  const repository = new MemoryRepository(db);
  const all = await repository.listForAgent(userId, agentId);
  if (all.length <= ALL_MEMORIES_LIMIT) {
    return {memories: [...all].reverse(), total: all.length};
  }
  const newest = all.slice(0, NEWEST_MEMORIES);
  let matches: MemoryMatch[];
  try {
    const [embedding] = await embedder.embed([prompt]);
    matches = await repository.closest(
      userId,
      agentId,
      embedding!,
      embedder.model,
      ALL_MEMORIES_LIMIT,
    );
  } catch (error) {
    console.warn(
      '[memory] search failed, using the newest memories:',
      error instanceof Error ? error.message : error,
    );
    return {memories: all.slice(0, ALL_MEMORIES_LIMIT), total: all.length};
  }
  const chosen = new Map<string, Memory>();
  for (const memory of [...matches.map(m => m.memory), ...newest]) {
    chosen.set(memory.id, memory);
  }
  return {memories: [...chosen.values()], total: all.length};
}

/** Memories closest in meaning to `query`, for the `recall` tool. */
export async function recallMemories(
  db: Database,
  embedder: Embedder,
  {
    userId,
    agentId,
    query,
    limit = 8,
  }: {userId: string; agentId: string; query: string; limit?: number},
): Promise<MemoryMatch[]> {
  const [embedding] = await embedder.embed([query]);
  return new MemoryRepository(db).closest(
    userId,
    agentId,
    embedding!,
    embedder.model,
    limit,
  );
}

/**
 * Embeds again, with the current model, every memory another model made,
 * so search can find them. Returns how many it re-embedded.
 */
export async function reindexMemories(
  db: Database,
  embedder: Embedder,
  {userId, agentId}: {userId: string; agentId: string},
): Promise<number> {
  const repository = new MemoryRepository(db);
  const stale = await repository.listOtherModel(
    userId,
    agentId,
    embedder.model,
  );
  const embeddings = await embedder.embed(stale.map(m => m.content));
  for (const [index, memory] of stale.entries()) {
    await repository.reembed(
      memory.id,
      userId,
      embeddings[index]!,
      embedder.model,
    );
  }
  return stale.length;
}
