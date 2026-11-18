import {and, eq} from 'drizzle-orm';

import type {Database} from '../index';
import {enabledToolkits} from '../schema/enabled-toolkits';

/** The no-account Composio toolkits one person has switched on. */
export class EnabledToolkitRepository {
  constructor(private readonly db: Database) {}

  async listForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({slug: enabledToolkits.slug})
      .from(enabledToolkits)
      .where(eq(enabledToolkits.userId, userId));
    return rows.map(row => row.slug);
  }

  async enable(userId: string, slug: string): Promise<void> {
    await this.db
      .insert(enabledToolkits)
      .values({userId, slug})
      .onConflictDoNothing();
  }

  async disable(userId: string, slug: string): Promise<void> {
    await this.db
      .delete(enabledToolkits)
      .where(
        and(eq(enabledToolkits.userId, userId), eq(enabledToolkits.slug, slug)),
      );
  }
}
