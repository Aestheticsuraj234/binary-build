import {and, cosineDistance, desc, eq, ne, sql} from 'drizzle-orm';

import type {Database} from '../index';
import type {KnowledgeDocumentRow} from '../schema/memory';
import {knowledgeChunks, knowledgeDocuments} from '../schema/memory';

/** A document with how many passages it has, and how many need re-indexing. */
export interface KnowledgeDocumentListItem {
  document: KnowledgeDocumentRow;
  chunks: number;
  /** Passages embedded by a model other than the one asked about. */
  otherModelChunks: number;
}

export interface NewKnowledgeDocument {
  userId: string;
  title: string;
  kind: KnowledgeDocumentRow['kind'];
  url: string | null;
  characters: number;
}

export interface NewKnowledgeChunk {
  content: string;
  embedding: number[];
}

/** A passage found by a search, with the document it comes from. */
export interface KnowledgeMatchRow {
  chunkId: string;
  documentId: string;
  title: string;
  url: string | null;
  position: number;
  content: string;
  similarity: number;
}

/**
 * Queries for a person's knowledge library. Every method takes the owner,
 * so nobody reads or searches anyone else's documents. Searches only
 * compare vectors made by the same model.
 */
export class KnowledgeRepository {
  constructor(private readonly db: Database) {}

  /** This person's documents, newest first. */
  async listForUser(
    userId: string,
    embeddingModel: string | null,
  ): Promise<KnowledgeDocumentListItem[]> {
    const otherModel =
      embeddingModel === null
        ? sql<number>`0`
        : sql<number>`count(${knowledgeChunks.id}) filter (where ${ne(knowledgeChunks.embeddingModel, embeddingModel)})`;
    const rows = await this.db
      .select({
        document: knowledgeDocuments,
        chunks: sql<number>`count(${knowledgeChunks.id})`,
        otherModelChunks: otherModel,
      })
      .from(knowledgeDocuments)
      .leftJoin(
        knowledgeChunks,
        eq(knowledgeChunks.documentId, knowledgeDocuments.id),
      )
      .where(eq(knowledgeDocuments.userId, userId))
      .groupBy(knowledgeDocuments.id)
      .orderBy(desc(knowledgeDocuments.createdAt));
    return rows.map(row => ({
      document: row.document,
      chunks: Number(row.chunks),
      otherModelChunks: Number(row.otherModelChunks),
    }));
  }

  /** The newest titles and how many documents there are, for a prompt. */
  async titlesForUser(
    userId: string,
    limit: number,
  ): Promise<{titles: string[]; total: number}> {
    const rows = await this.db
      .select({
        title: knowledgeDocuments.title,
        total: sql<number>`count(*) over ()`,
      })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.userId, userId))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(limit);
    return {
      titles: rows.map(row => row.title),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  /** Saves a document and all its passages, or nothing. */
  create(
    document: NewKnowledgeDocument,
    chunks: NewKnowledgeChunk[],
    embeddingModel: string,
  ): Promise<KnowledgeDocumentRow> {
    return this.db.transaction(async tx => {
      const [row] = await tx
        .insert(knowledgeDocuments)
        .values(document)
        .returning();
      if (chunks.length > 0) {
        await tx.insert(knowledgeChunks).values(
          chunks.map((chunk, position) => ({
            documentId: row!.id,
            userId: document.userId,
            position,
            content: chunk.content,
            embedding: chunk.embedding,
            embeddingModel,
          })),
        );
      }
      return row!;
    });
  }

  /** Deletes a document and its passages. False if it isn't theirs. */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, id),
          eq(knowledgeDocuments.userId, userId),
        ),
      )
      .returning({id: knowledgeDocuments.id});
    return deleted.length > 0;
  }

  /** The passages closest in meaning to `embedding`, closest first. */
  async search(
    userId: string,
    embedding: number[],
    embeddingModel: string,
    limit: number,
  ): Promise<KnowledgeMatchRow[]> {
    const distance = cosineDistance(knowledgeChunks.embedding, embedding);
    const rows = await this.db
      .select({
        chunkId: knowledgeChunks.id,
        documentId: knowledgeDocuments.id,
        title: knowledgeDocuments.title,
        url: knowledgeDocuments.url,
        position: knowledgeChunks.position,
        content: knowledgeChunks.content,
        distance: sql<number>`${distance}`,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeDocuments.id, knowledgeChunks.documentId),
      )
      .where(
        and(
          eq(knowledgeChunks.userId, userId),
          eq(knowledgeChunks.embeddingModel, embeddingModel),
        ),
      )
      .orderBy(distance)
      .limit(limit);
    return rows.map(({distance: d, ...match}) => ({
      ...match,
      similarity: 1 - Number(d),
    }));
  }

  /** Passages made by some other model, which searches can't reach. */
  listOtherModelChunks(
    userId: string,
    embeddingModel: string,
  ): Promise<Array<{id: string; content: string; title: string}>> {
    return this.db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
        title: knowledgeDocuments.title,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeDocuments.id, knowledgeChunks.documentId),
      )
      .where(
        and(
          eq(knowledgeChunks.userId, userId),
          ne(knowledgeChunks.embeddingModel, embeddingModel),
        ),
      );
  }

  /** Swaps a passage's vector for one made by `embeddingModel`. */
  async reembedChunk(
    id: string,
    userId: string,
    embedding: number[],
    embeddingModel: string,
  ): Promise<void> {
    await this.db
      .update(knowledgeChunks)
      .set({embedding, embeddingModel})
      .where(
        and(eq(knowledgeChunks.id, id), eq(knowledgeChunks.userId, userId)),
      );
  }
}
