import {and, asc, desc, eq, isNotNull, sql} from 'drizzle-orm';

import type {Database} from '../index';
import type {AgentRow} from '../schema/agents';
import {agents} from '../schema/agents';
import type {MessageRow, ThreadRow} from '../schema/chats';
import {messages, threads} from '../schema/chats';

/** A thread with the agent it's with, even if that agent was fired. */
export interface ThreadWithAgent {
  thread: ThreadRow;
  agent: AgentRow;
}

/** A thread as Recent chats lists it. */
export interface ThreadListItem {
  thread: ThreadRow;
  agent: Pick<AgentRow, 'name' | 'avatar'>;
}

/**
 * Queries for `threads` and their `messages`. Methods that take a user id
 * only touch that person's threads. The message methods take a thread id
 * the caller has already checked with `findForUser`.
 */
export class ThreadRepository {
  constructor(private readonly db: Database) {}

  /** Starts an untitled thread with one of this person's agents. */
  async create(userId: string, agentId: string): Promise<ThreadRow> {
    const [row] = await this.db
      .insert(threads)
      .values({userId, agentId})
      .returning();
    return row!;
  }

  /**
   * This person's chats, newest first. Threads with no messages yet are
   * left out, so an abandoned "New chat" doesn't clutter the list.
   */
  listForUser(userId: string, limit = 50): Promise<ThreadListItem[]> {
    return this.db
      .select({
        thread: threads,
        agent: {name: agents.name, avatar: agents.avatar},
      })
      .from(threads)
      .innerJoin(agents, eq(agents.id, threads.agentId))
      .where(and(eq(threads.userId, userId), isNotNull(threads.title)))
      .orderBy(desc(threads.updatedAt))
      .limit(limit);
  }

  /** One thread, or undefined if it doesn't exist or isn't theirs. */
  async findForUser(
    id: string,
    userId: string,
  ): Promise<ThreadWithAgent | undefined> {
    const [row] = await this.db
      .select({thread: threads, agent: agents})
      .from(threads)
      .innerJoin(agents, eq(agents.id, threads.agentId))
      .where(and(eq(threads.id, id), eq(threads.userId, userId)))
      .limit(1);
    return row;
  }

  /** Deletes a thread and its messages. False if it isn't theirs. */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(threads)
      .where(and(eq(threads.id, id), eq(threads.userId, userId)))
      .returning({id: threads.id});
    return deleted.length > 0;
  }

  /** Every message in a thread, oldest first. */
  listMessages(threadId: string): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(asc(messages.createdAt));
  }

  /** The newest `limit` messages of a thread, oldest first. */
  async recentMessages(threadId: string, limit: number): Promise<MessageRow[]> {
    const newestFirst = await this.db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return newestFirst.reverse();
  }

  /**
   * Saves the person's message. The first one also names the thread:
   * `title` is only used while the thread has none.
   */
  addQuestion(
    threadId: string,
    content: string,
    title: string,
  ): Promise<MessageRow> {
    return this.db.transaction(async tx => {
      const [row] = await tx
        .insert(messages)
        .values({threadId, role: 'user', content})
        .returning();
      await tx
        .update(threads)
        .set({
          title: sql`coalesce(${threads.title}, ${title})`,
          updatedAt: sql`now()`,
        })
        .where(eq(threads.id, threadId));
      return row!;
    });
  }

  /** Saves a complete answer from the agent. */
  addAnswer(threadId: string, content: string): Promise<MessageRow> {
    return this.db.transaction(async tx => {
      const [row] = await tx
        .insert(messages)
        .values({threadId, role: 'assistant', content})
        .returning();
      await tx
        .update(threads)
        .set({updatedAt: sql`now()`})
        .where(eq(threads.id, threadId));
      return row!;
    });
  }
}
