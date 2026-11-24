import {and, desc, eq, inArray, lt, or, sql} from 'drizzle-orm';
import {TransactionRollbackError} from 'drizzle-orm/errors';

import type {Database} from '../index';
import type {PendingApproval} from '../schema/approvals';
import {approvalRequests} from '../schema/approvals';
import type {MessageRow, ThreadRow} from '../schema/chats';
import {messages, threads} from '../schema/chats';
import type {RoutineRunRow} from '../schema/routines';
import {routineRuns, routines} from '../schema/routines';

/** What started a run, and what it brings with it. */
export interface NewRun {
  routineId: string;
  source: RoutineRunRow['source'];
  /** A webhook's body. */
  payload?: string | null;
  /** One event makes one run: a second run with the same key isn't made. */
  dedupeKey?: string | null;
}

/** A run that a worker now owns. Only this attempt may finish it. */
export interface ClaimedRun {
  run: RoutineRunRow;
  attempt: number;
}

/** How long a run may wait in the queue before it counts as lost. */
export const QUEUED_TIMEOUT_MS = 60 * 60 * 1000;
/** How long a run may be running before it counts as stopped. */
export const RUNNING_TIMEOUT_MS = 45 * 60 * 1000;

export const NEVER_STARTED_MESSAGE =
  'This run never started. If Trigger.dev is on, keep `pnpm trigger:dev` running so it can pick runs up.';
export const STOPPED_MESSAGE = 'This run stopped before it finished.';

/**
 * Queries for `routine_runs`. A run moves queued → running → done or failed,
 * and every move is a conditional update, so two workers handed the same
 * run can never both answer.
 */
export class RoutineRunRepository {
  constructor(private readonly db: Database) {}

  /**
   * Queues a run. With a `dedupeKey` that was already used for this
   * routine, nothing new is made and the earlier run comes back instead.
   */
  async create(input: NewRun): Promise<{run: RoutineRunRow; isNew: boolean}> {
    const [row] = await this.db
      .insert(routineRuns)
      .values({
        routineId: input.routineId,
        source: input.source,
        payload: input.payload ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing({
        target: [routineRuns.routineId, routineRuns.dedupeKey],
      })
      .returning();
    if (row) {
      return {run: row, isNew: true};
    }
    const [existing] = await this.db
      .select()
      .from(routineRuns)
      .where(
        and(
          eq(routineRuns.routineId, input.routineId),
          eq(routineRuns.dedupeKey, input.dedupeKey ?? ''),
        ),
      )
      .limit(1);
    return {run: existing!, isNew: false};
  }

  async find(id: string): Promise<RoutineRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.id, id))
      .limit(1);
    return row;
  }

  /** A routine's runs, newest first. */
  listForRoutine(routineId: string, limit = 20): Promise<RoutineRunRow[]> {
    return this.db
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.routineId, routineId))
      .orderBy(desc(routineRuns.createdAt))
      .limit(limit);
  }

  /**
   * Takes a run to work on. Only a queued run can be claimed, so a job
   * delivered twice finds nothing the second time.
   *
   * `reclaim` also takes a run left `running` by an attempt that died (a
   * retry). That's safe: a running run has no saved answer yet, because the
   * answer and `done` are written together, and the new attempt number
   * stops the old attempt from finishing it if it was only slow.
   */
  async claim(
    id: string,
    {reclaim = false}: {reclaim?: boolean} = {},
  ): Promise<ClaimedRun | undefined> {
    const claimable = reclaim
      ? inArray(routineRuns.status, ['queued', 'running'])
      : eq(routineRuns.status, 'queued');
    const [row] = await this.db
      .update(routineRuns)
      .set({
        status: 'running',
        attempt: sql`${routineRuns.attempt} + 1`,
        startedAt: sql`coalesce(${routineRuns.startedAt}, now())`,
        error: null,
      })
      .where(and(eq(routineRuns.id, id), claimable))
      .returning();
    return row ? {run: row, attempt: row.attempt} : undefined;
  }

  /** True while this attempt still owns the run. */
  private owns(id: string, attempt: number) {
    return and(
      eq(routineRuns.id, id),
      eq(routineRuns.status, 'running'),
      eq(routineRuns.attempt, attempt),
    );
  }

  /**
   * Opens the run's transcript: a new chat whose first message says what
   * to do. Undefined (and nothing saved) if this attempt lost the run.
   */
  startTranscript(
    {run, attempt}: ClaimedRun,
    thread: {userId: string; agentId: string; title: string; prompt: string},
  ): Promise<ThreadRow | undefined> {
    return this.db
      .transaction(async tx => {
        const [row] = await tx
          .insert(threads)
          .values({
            userId: thread.userId,
            agentId: thread.agentId,
            title: thread.title,
          })
          .returning();
        await tx
          .insert(messages)
          .values({threadId: row!.id, role: 'user', content: thread.prompt});
        const updated = await tx
          .update(routineRuns)
          .set({threadId: row!.id})
          .where(this.owns(run.id, attempt))
          .returning({id: routineRuns.id});
        if (updated.length === 0) {
          tx.rollback();
        }
        return row;
      })
      .catch((error: unknown) => {
        if (error instanceof TransactionRollbackError) {
          return undefined;
        }
        throw error;
      });
  }

  /**
   * Saves the answer and marks the run done, in one transaction. If this
   * attempt no longer owns the run, nothing is saved and it returns
   * undefined: the run answers once, whatever happens.
   */
  completeWithAnswer(
    {run, attempt}: ClaimedRun,
    threadId: string,
    answer: {
      content: string;
      toolCalls: unknown[];
      /** Requests it made; they wait in Today, tied to this run. */
      approvals?: PendingApproval[];
    },
  ): Promise<MessageRow | undefined> {
    return this.db.transaction(async tx => {
      const finished = await tx
        .update(routineRuns)
        .set({status: 'done', finishedAt: sql`now()`})
        .where(this.owns(run.id, attempt))
        .returning({id: routineRuns.id});
      if (finished.length === 0) {
        return undefined;
      }
      const [message] = await tx
        .insert(messages)
        .values({
          threadId,
          role: 'assistant',
          content: answer.content,
          toolCalls: answer.toolCalls,
        })
        .returning();
      if (answer.approvals?.length) {
        await tx.insert(approvalRequests).values(
          answer.approvals.map(approval => ({
            ...approval,
            threadId,
            messageId: message!.id,
            routineRunId: run.id,
          })),
        );
      }
      await tx
        .update(threads)
        .set({updatedAt: sql`now()`})
        .where(eq(threads.id, threadId));
      return message;
    });
  }

  /**
   * Marks a run failed with a reason that's safe to show. With an
   * `attempt`, only while that attempt still owns it.
   */
  async fail(id: string, error: string, attempt?: number): Promise<void> {
    await this.db
      .update(routineRuns)
      .set({status: 'failed', error, finishedAt: sql`now()`})
      .where(
        attempt === undefined
          ? and(
              eq(routineRuns.id, id),
              inArray(routineRuns.status, ['queued', 'running']),
            )
          : this.owns(id, attempt),
      );
  }

  /**
   * Fails this person's runs that were lost: queued too long (nothing
   * picked them up) or running too long (the worker died for good).
   */
  async expireStale(userId: string, now = new Date()): Promise<void> {
    const theirs = this.db
      .select({id: routines.id})
      .from(routines)
      .where(eq(routines.userId, userId));
    const lost = [
      {
        status: 'queued' as const,
        olderThan: lt(
          routineRuns.createdAt,
          new Date(now.getTime() - QUEUED_TIMEOUT_MS),
        ),
        error: NEVER_STARTED_MESSAGE,
      },
      {
        status: 'running' as const,
        olderThan: lt(
          routineRuns.startedAt,
          new Date(now.getTime() - RUNNING_TIMEOUT_MS),
        ),
        error: STOPPED_MESSAGE,
      },
    ];
    for (const {status, olderThan, error} of lost) {
      await this.db
        .update(routineRuns)
        .set({status: 'failed', error, finishedAt: sql`now()`})
        .where(
          and(
            inArray(routineRuns.routineId, theirs),
            eq(routineRuns.status, status),
            olderThan,
          ),
        );
    }
  }

  /** Runs that haven't finished, oldest first (to pick up after a restart). */
  listUnfinished(): Promise<RoutineRunRow[]> {
    return this.db
      .select()
      .from(routineRuns)
      .where(
        or(eq(routineRuns.status, 'queued'), eq(routineRuns.status, 'running')),
      )
      .orderBy(routineRuns.createdAt);
  }
}
