import {and, asc, eq, isNull} from 'drizzle-orm';

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
 * change another's. Fired agents are left out: they only live on in their
 * old chats.
 */
export class AgentRepository {
  constructor(private readonly db: Database) {}

  /** This person's agents, oldest first. */
  listForUser(userId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(agents)
      .where(and(eq(agents.userId, userId), isNull(agents.firedAt)))
      .orderBy(asc(agents.createdAt));
  }

  /** One agent, or undefined if it doesn't exist, isn't theirs or was fired. */
  async findForUser(id: string, userId: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(agents)
      .where(this.isTheirs(id, userId))
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
      .where(this.isTheirs(id, userId))
      .returning();
    return row;
  }

  /**
   * Fires an agent: it leaves the crew and its chats become read-only.
   * Returns false if the agent isn't theirs or was already fired.
   */
  async fireForUser(id: string, userId: string): Promise<boolean> {
    const fired = await this.db
      .update(agents)
      .set({firedAt: new Date()})
      .where(this.isTheirs(id, userId))
      .returning({id: agents.id});
    return fired.length > 0;
  }

  /** Matches one agent of this person's that is still on the crew. */
  private isTheirs(id: string, userId: string) {
    return and(
      eq(agents.id, id),
      eq(agents.userId, userId),
      isNull(agents.firedAt),
    );
  }
}
