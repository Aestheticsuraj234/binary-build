import {and, desc, eq, inArray, lt, sql} from 'drizzle-orm';

import type {Database} from '../index';
import type {AgentRow} from '../schema/agents';
import {agents} from '../schema/agents';
import {threads} from '../schema/chats';
import type {SandboxRow, ToolImageRow} from '../schema/sandboxes';
import {sandboxes, toolImages} from '../schema/sandboxes';

/** A running sandbox with what lists show beside it. */
export interface SandboxListItem {
  sandbox: SandboxRow;
  agent: Pick<AgentRow, 'name' | 'avatar'>;
  threadTitle: string | null;
}

/**
 * Queries for `sandboxes`. Methods that take a user id only touch that
 * person's sandboxes. A row is `running` until it's stopped or its
 * provider has stopped it for being idle (`expireIdle`).
 */
export class SandboxRepository {
  constructor(private readonly db: Database) {}

  /** Marks sandboxes the provider has already stopped (idle too long). */
  async expireIdle(now = new Date()): Promise<void> {
    await this.db
      .update(sandboxes)
      .set({status: 'stopped', stoppedAt: sql`now()`})
      .where(
        and(eq(sandboxes.status, 'running'), lt(sandboxes.expiresAt, now)),
      );
  }

  /** The chat's running sandbox, if there is one. */
  async runningForThread(
    threadId: string,
    userId: string,
  ): Promise<SandboxRow | undefined> {
    const [row] = await this.db
      .select()
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.threadId, threadId),
          eq(sandboxes.userId, userId),
          eq(sandboxes.status, 'running'),
          sql`${sandboxes.expiresAt} > now()`,
        ),
      )
      .limit(1);
    return row;
  }

  /** This person's running sandboxes, newest first. */
  listRunningForUser(userId: string): Promise<SandboxListItem[]> {
    return this.db
      .select({
        sandbox: sandboxes,
        agent: {name: agents.name, avatar: agents.avatar},
        threadTitle: threads.title,
      })
      .from(sandboxes)
      .innerJoin(agents, eq(agents.id, sandboxes.agentId))
      .innerJoin(threads, eq(threads.id, sandboxes.threadId))
      .where(
        and(
          eq(sandboxes.userId, userId),
          eq(sandboxes.status, 'running'),
          sql`${sandboxes.expiresAt} > now()`,
        ),
      )
      .orderBy(desc(sandboxes.startedAt));
  }

  /** One of this person's sandboxes, or undefined. */
  async findForUser(
    id: string,
    userId: string,
  ): Promise<SandboxRow | undefined> {
    const [row] = await this.db
      .select()
      .from(sandboxes)
      .where(and(eq(sandboxes.id, id), eq(sandboxes.userId, userId)))
      .limit(1);
    return row;
  }

  /**
   * Records a new running sandbox. Undefined if the chat already has one
   * (another run started it at the same moment): use that one instead.
   */
  async insertRunning(row: {
    userId: string;
    threadId: string;
    agentId: string;
    provider: SandboxRow['provider'];
    externalId: string;
    expiresAt: Date;
  }): Promise<SandboxRow | undefined> {
    const [inserted] = await this.db
      .insert(sandboxes)
      .values(row)
      .onConflictDoNothing({
        target: sandboxes.threadId,
        where: sql`${sandboxes.status} = 'running'`,
      })
      .returning();
    return inserted;
  }

  /** Records a use: it stays up until `expiresAt`. */
  async touch(id: string, expiresAt: Date): Promise<void> {
    await this.db
      .update(sandboxes)
      .set({lastUsedAt: sql`now()`, expiresAt})
      .where(eq(sandboxes.id, id));
  }

  /** Marks sandboxes stopped. Returns the ones that were still running. */
  async markStopped(ids: string[]): Promise<SandboxRow[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.db
      .update(sandboxes)
      .set({status: 'stopped', stoppedAt: sql`now()`})
      .where(and(inArray(sandboxes.id, ids), eq(sandboxes.status, 'running')))
      .returning();
  }

  /** Every running sandbox of a chat (to stop before it's deleted). */
  allRunningForThread(threadId: string): Promise<SandboxRow[]> {
    return this.db
      .select()
      .from(sandboxes)
      .where(
        and(eq(sandboxes.threadId, threadId), eq(sandboxes.status, 'running')),
      );
  }
}

/** Queries for `tool_images`, the charts tools make for people. */
export class ToolImageRepository {
  constructor(private readonly db: Database) {}

  /** Saves images for a chat and returns their ids, in order. */
  async saveAll(
    owner: {userId: string; threadId: string},
    images: Array<{mime: string; data: string}>,
  ): Promise<Array<{id: string; mime: string}>> {
    if (images.length === 0) {
      return [];
    }
    return this.db
      .insert(toolImages)
      .values(images.map(image => ({...owner, ...image})))
      .returning({id: toolImages.id, mime: toolImages.mime});
  }

  /** One of this person's images, or undefined. */
  async findForUser(
    id: string,
    userId: string,
  ): Promise<ToolImageRow | undefined> {
    const [row] = await this.db
      .select()
      .from(toolImages)
      .where(and(eq(toolImages.id, id), eq(toolImages.userId, userId)))
      .limit(1);
    return row;
  }
}
