import {and, asc, eq} from 'drizzle-orm';

import type {Database} from '../index';
import type {AgentRow, NewAgentRow} from '../schema/agents';
import {agents} from '../schema/agents';

/** The fields a person can change on their agent. */
export type AgentChanges = Pick<
  NewAgentRow,
  'name' | 'avatar' | 'role' | 'instructions' | 'provider' | 'model'
>;

/**
 * Queries for the `agents` table. Every method takes the owner's id and
 * only ever touches that person's agents, so one person can never read or
 * change another's.
 */
export class AgentRepository {
  constructor(private readonly db: Database) {}

  /** This person's agents, oldest first. */
  listForUser(userId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(agents)
      .where(eq(agents.userId, userId))
      .orderBy(asc(agents.createdAt));
  }

  /** One agent, or undefined if it doesn't exist or isn't theirs. */
  async findForUser(id: string, userId: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.userId, userId)))
      .limit(1);
    return row;
  }

  async create(
    userId: string,
    agent: AgentChanges & {templateId?: string | null},
  ): Promise<AgentRow> {
    const [row] = await this.db
      .insert(agents)
      .values({...agent, userId})
      .returning();
    return row!;
  }

  /** Saves changes. Returns undefined if the agent isn't theirs. */
  async updateForUser(
    id: string,
    userId: string,
    changes: AgentChanges,
  ): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .update(agents)
      .set(changes)
      .where(and(eq(agents.id, id), eq(agents.userId, userId)))
      .returning();
    return row;
  }

  /** Fires an agent. Returns false if the agent isn't theirs. */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(agents)
      .where(and(eq(agents.id, id), eq(agents.userId, userId)))
      .returning({id: agents.id});
    return deleted.length > 0;
  }
}
