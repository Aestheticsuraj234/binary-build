import {and, count, desc, eq, gt, sql} from 'drizzle-orm';

import type {Database} from '../index';
import type {AgentRow} from '../schema/agents';
import {agents} from '../schema/agents';
import type {ApprovalRow} from '../schema/approvals';
import {approvalRequests} from '../schema/approvals';
import type {MessageRow} from '../schema/chats';
import {messages, threads} from '../schema/chats';
import type {RoutineRunRow} from '../schema/routines';
import {rooms} from '../schema/rooms';
import {routineRuns, routines} from '../schema/routines';

/** A request with what Today and the chat show beside it. */
export interface ApprovalListItem {
  approval: ApprovalRow;
  agent: Pick<AgentRow, 'id' | 'name' | 'avatar'>;
  threadTitle: string | null;
  routineName: string | null;
  /** Set when it was asked in a room. */
  room: {id: string; name: string} | null;
}

/** A routine run with its routine, for Today. */
export interface RecentRunItem {
  run: RoutineRunRow;
  routineName: string;
  avatar: string | null;
}

/** What a decision changes to. */
export type Decision = 'running' | 'rejected';

/** A list row, with the room's two columns folded into `room`. */
function toListItem({
  roomId,
  roomName,
  ...item
}: Omit<ApprovalListItem, 'room'> & {
  roomId: string | null;
  roomName: string | null;
}): ApprovalListItem {
  return {
    ...item,
    room: roomId && roomName ? {id: roomId, name: roomName} : null,
  };
}

/**
 * Queries for `approval_requests`. Every method that takes a user id only
 * touches that person's requests. A request moves pending → running →
 * done/failed, or pending → rejected, each step a conditional update, so
 * it's decided once even with two clicks on two devices.
 */
export class ApprovalRepository {
  constructor(private readonly db: Database) {}

  private listQuery() {
    return this.db
      .select({
        approval: approvalRequests,
        agent: {id: agents.id, name: agents.name, avatar: agents.avatar},
        threadTitle: threads.title,
        routineName: routines.name,
        roomId: rooms.id,
        roomName: rooms.name,
      })
      .from(approvalRequests)
      .innerJoin(agents, eq(agents.id, approvalRequests.agentId))
      .innerJoin(threads, eq(threads.id, approvalRequests.threadId))
      .leftJoin(rooms, eq(rooms.id, threads.roomId))
      .leftJoin(routineRuns, eq(routineRuns.id, approvalRequests.routineRunId))
      .leftJoin(routines, eq(routines.id, routineRuns.routineId));
  }

  /** Requests waiting for this person, newest first. */
  async listPendingForUser(userId: string): Promise<ApprovalListItem[]> {
    const rows = await this.listQuery()
      .where(
        and(
          eq(approvalRequests.userId, userId),
          eq(approvalRequests.status, 'pending'),
        ),
      )
      .orderBy(desc(approvalRequests.createdAt));
    return rows.map(toListItem);
  }

  async countPendingForUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({pending: count()})
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.userId, userId),
          eq(approvalRequests.status, 'pending'),
        ),
      );
    return row?.pending ?? 0;
  }

  /** One of this person's requests, or undefined. */
  async findForUser(
    id: string,
    userId: string,
  ): Promise<ApprovalListItem | undefined> {
    const [row] = await this.listQuery()
      .where(
        and(eq(approvalRequests.id, id), eq(approvalRequests.userId, userId)),
      )
      .limit(1);
    return row && toListItem(row);
  }

  /**
   * Decides a request: only a `pending` one can be decided, so of two
   * decisions at once exactly one gets the row back. The other gets
   * undefined and must not run anything.
   */
  async decide(
    id: string,
    userId: string,
    to: Decision,
  ): Promise<ApprovalRow | undefined> {
    const [row] = await this.db
      .update(approvalRequests)
      .set({
        status: to,
        decidedAt: sql`now()`,
        ...(to === 'rejected' ? {finishedAt: sql`now()`} : {}),
      })
      .where(
        and(
          eq(approvalRequests.id, id),
          eq(approvalRequests.userId, userId),
          eq(approvalRequests.status, 'pending'),
        ),
      )
      .returning();
    return row;
  }

  /** Records how an approved call went. Only from `running`. */
  async finish(
    id: string,
    result:
      {status: 'done'; output: unknown} | {status: 'failed'; error: string},
  ): Promise<ApprovalRow | undefined> {
    const [row] = await this.db
      .update(approvalRequests)
      .set({
        status: result.status,
        output: result.status === 'done' ? (result.output ?? null) : null,
        error: result.status === 'failed' ? result.error : null,
        finishedAt: sql`now()`,
      })
      .where(
        and(
          eq(approvalRequests.id, id),
          eq(approvalRequests.status, 'running'),
        ),
      )
      .returning();
    return row;
  }

  /**
   * Changes one tool card inside a saved answer. The message row is locked
   * while it's rewritten, so two requests from one answer, decided at the
   * same time, don't overwrite each other's card.
   */
  updateToolCall<Call extends {id: string}>(
    messageId: string,
    toolCallId: string,
    change: (call: Call) => Call,
  ): Promise<Call | undefined> {
    return this.db.transaction(async tx => {
      const [message] = await tx
        .select({toolCalls: messages.toolCalls})
        .from(messages)
        .where(eq(messages.id, messageId))
        .for('update');
      if (!message) {
        return undefined;
      }
      let changed: Call | undefined;
      const toolCalls = (message.toolCalls as Call[]).map(call => {
        if (call.id !== toolCallId) {
          return call;
        }
        changed = change(call);
        return changed;
      });
      await tx
        .update(messages)
        .set({toolCalls})
        .where(eq(messages.id, messageId));
      return changed;
    });
  }

  /**
   * Saves a note from Binary in a chat, about one tool call. In a room,
   * `agentId` says whose call it was.
   */
  addNote(
    threadId: string,
    content: string,
    toolCall: unknown,
    agentId: string | null = null,
  ): Promise<MessageRow> {
    return this.db.transaction(async tx => {
      const [row] = await tx
        .insert(messages)
        .values({
          threadId,
          role: 'note',
          content,
          toolCalls: [toolCall],
          agentId,
        })
        .returning();
      await tx
        .update(threads)
        .set({updatedAt: sql`now()`})
        .where(eq(threads.id, threadId));
      return row!;
    });
  }

  /** This person's routine runs since `since`, newest first. */
  recentRunsForUser(userId: string, since: Date): Promise<RecentRunItem[]> {
    return this.db
      .select({
        run: routineRuns,
        routineName: routines.name,
        avatar: agents.avatar,
      })
      .from(routineRuns)
      .innerJoin(routines, eq(routines.id, routineRuns.routineId))
      .innerJoin(agents, eq(agents.id, routines.agentId))
      .where(and(eq(routines.userId, userId), gt(routineRuns.createdAt, since)))
      .orderBy(desc(routineRuns.createdAt))
      .limit(20);
  }
}
