import {and, asc, eq} from 'drizzle-orm';

import type {Database} from '../index';
import type {AppRow} from '../schema/apps';
import {apps} from '../schema/apps';

/** Queries for `apps`, always scoped to one person. */
export class AppRepository {
  constructor(private readonly db: Database) {}

  /** This person's apps, oldest first. */
  listForUser(userId: string): Promise<AppRow[]> {
    return this.db
      .select()
      .from(apps)
      .where(eq(apps.userId, userId))
      .orderBy(asc(apps.createdAt));
  }

  /** One app, or undefined if it doesn't exist or isn't theirs. */
  async findForUser(id: string, userId: string): Promise<AppRow | undefined> {
    const [row] = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id), eq(apps.userId, userId)))
      .limit(1);
    return row;
  }

  /** True if they already have an app with this name. */
  async nameIsTaken(userId: string, name: string): Promise<boolean> {
    const [row] = await this.db
      .select({id: apps.id})
      .from(apps)
      .where(and(eq(apps.userId, userId), eq(apps.name, name)))
      .limit(1);
    return row !== undefined;
  }

  /**
   * Saves an app. The id is chosen by the caller, because the vault mixes
   * it into the encrypted token.
   */
  async create(app: {
    id: string;
    userId: string;
    name: string;
    url: string;
    encryptedAuthorization: string | null;
  }): Promise<AppRow> {
    const [row] = await this.db.insert(apps).values(app).returning();
    return row!;
  }

  /** Removes an app. False if it isn't theirs. */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(apps)
      .where(and(eq(apps.id, id), eq(apps.userId, userId)))
      .returning({id: apps.id});
    return deleted.length > 0;
  }
}
