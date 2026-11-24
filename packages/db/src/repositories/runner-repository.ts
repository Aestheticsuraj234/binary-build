import {and, asc, eq, gt, isNull, sql} from 'drizzle-orm';

import type {Database} from '../index';
import type {RunnerRow} from '../schema/runners';
import {runners} from '../schema/runners';

/**
 * Queries for `runners`. Methods named `…ForUser` only touch that person's
 * computers. The Runner itself is found by its token's hash.
 */
export class RunnerRepository {
  constructor(private readonly db: Database) {}

  listForUser(userId: string): Promise<RunnerRow[]> {
    return this.db
      .select()
      .from(runners)
      .where(eq(runners.userId, userId))
      .orderBy(asc(runners.createdAt));
  }

  async findForUser(
    id: string,
    userId: string,
  ): Promise<RunnerRow | undefined> {
    const [row] = await this.db
      .select()
      .from(runners)
      .where(and(eq(runners.id, id), eq(runners.userId, userId)))
      .limit(1);
    return row;
  }

  /** A new computer, waiting to be paired with `codeHash`. */
  async create(row: {
    userId: string;
    name: string;
    pairingCodeHash: string;
    pairingExpiresAt: Date;
  }): Promise<RunnerRow> {
    const [created] = await this.db.insert(runners).values(row).returning();
    return created!;
  }

  /**
   * Pairs: swaps an unexpired one-time code for a token. The code works
   * once; a second use (or an expired code) finds nothing.
   */
  async pair(
    codeHash: string,
    tokenHash: string,
  ): Promise<RunnerRow | undefined> {
    const [row] = await this.db
      .update(runners)
      .set({tokenHash, pairingCodeHash: null, pairingExpiresAt: null})
      .where(
        and(
          eq(runners.pairingCodeHash, codeHash),
          gt(runners.pairingExpiresAt, sql`now()`),
          isNull(runners.tokenHash),
        ),
      )
      .returning();
    return row;
  }

  /** The Runner with this token, if it's still paired. */
  async findByToken(tokenHash: string): Promise<RunnerRow | undefined> {
    const [row] = await this.db
      .select()
      .from(runners)
      .where(eq(runners.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  /** It asked for work just now. */
  async seen(id: string): Promise<void> {
    await this.db
      .update(runners)
      .set({lastSeenAt: sql`now()`})
      .where(eq(runners.id, id));
  }

  /** What it said when it started. */
  async hello(
    id: string,
    hello: {os: string; version: string; folders: string[]},
  ): Promise<void> {
    await this.db
      .update(runners)
      .set({...hello, lastSeenAt: sql`now()`})
      .where(eq(runners.id, id));
  }

  async setPausedForUser(
    id: string,
    userId: string,
    paused: boolean,
  ): Promise<RunnerRow | undefined> {
    const [row] = await this.db
      .update(runners)
      .set({pausedAt: paused ? sql`now()` : null})
      .where(and(eq(runners.id, id), eq(runners.userId, userId)))
      .returning();
    return row;
  }

  /** Removes a computer; its token stops working at once. */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(runners)
      .where(and(eq(runners.id, id), eq(runners.userId, userId)))
      .returning({id: runners.id});
    return deleted.length > 0;
  }
}
