import {and, asc, count, cosineDistance, desc, eq, ne, sql} from 'drizzle-orm';

import type {Database} from '../index';
import type {MemoryRow} from '../schema/memory';
import {memories} from '../schema/memory';

/** A memory without its vector, which is big and only useful to Postgres. */
export type Memory = Omit<MemoryRow, 'embedding'>;

/** A memory and how close it is to what was searched for (1 is identical). */
export interface MemoryMatch {
  memory: Memory;
  similarity: number;
}

export interface NewMemory {
  userId: string;
  agentId: string;
  content: string;
  source: MemoryRow['source'];
  embedding: number[];
  embeddingModel: string;
}

const MEMORY_COLUMNS = {
  id: memories.id,
  userId: memories.userId,
  agentId: memories.agentId,
  content: memories.content,
  source: memories.source,
  embeddingModel: memories.embeddingModel,
  createdAt: memories.createdAt,
};

/**
 * Queries for `memories`. Every method takes the owner and the character,
 * so one character never sees another's memories, and nobody sees anyone
 * else's. Searches only compare vectors made by the same model.
 */
export class MemoryRepository {
  constructor(private readonly db: Database) {}

  private isTheirs(userId: string, agentId: string) {
    return and(eq(memories.userId, userId), eq(memories.agentId, agentId));
  }

  /** Every memory this character has about its person, newest first. */
  listForAgent(userId: string, agentId: string): Promise<Memory[]> {
    return this.db
      .select(MEMORY_COLUMNS)
      .from(memories)
      .where(this.isTheirs(userId, agentId))
      .orderBy(desc(memories.createdAt), asc(memories.id));
  }

  /** How many memories this character has. */
  async countForAgent(userId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({n: count()})
      .from(memories)
      .where(this.isTheirs(userId, agentId));
    return row?.n ?? 0;
  }

  async create(memory: NewMemory): Promise<Memory> {
    const [row] = await this.db
      .insert(memories)
      .values(memory)
      .returning(MEMORY_COLUMNS);
    return row!;
  }

  /**
   * The memories closest in meaning to `embedding`, closest first. Only
   * memories embedded by `embeddingModel` take part.
   */
  async closest(
    userId: string,
    agentId: string,
    embedding: number[],
    embeddingModel: string,
    limit: number,
  ): Promise<MemoryMatch[]> {
    const distance = cosineDistance(memories.embedding, embedding);
    const rows = await this.db
      .select({...MEMORY_COLUMNS, distance: sql<number>`${distance}`})
      .from(memories)
      .where(
        and(
          this.isTheirs(userId, agentId),
          eq(memories.embeddingModel, embeddingModel),
        ),
      )
      .orderBy(distance)
      .limit(limit);
    return rows.map(({distance: d, ...memory}) => ({
      memory,
      similarity: 1 - Number(d),
    }));
  }

  /** Forgets one memory. False if it isn't this character's. */
  async deleteForAgent(
    id: string,
    userId: string,
    agentId: string,
  ): Promise<boolean> {
    const deleted = await this.db
      .delete(memories)
      .where(and(eq(memories.id, id), this.isTheirs(userId, agentId)))
      .returning({id: memories.id});
    return deleted.length > 0;
  }

  /** Memories made by some other model, which searches can't reach. */
  listOtherModel(
    userId: string,
    agentId: string,
    embeddingModel: string,
  ): Promise<Memory[]> {
    return this.db
      .select(MEMORY_COLUMNS)
      .from(memories)
      .where(
        and(
          this.isTheirs(userId, agentId),
          ne(memories.embeddingModel, embeddingModel),
        ),
      );
  }

  /** Swaps a memory's vector for one made by `embeddingModel`. */
  async reembed(
    id: string,
    userId: string,
    embedding: number[],
    embeddingModel: string,
  ): Promise<void> {
    await this.db
      .update(memories)
      .set({embedding, embeddingModel})
      .where(and(eq(memories.id, id), eq(memories.userId, userId)));
  }
}
