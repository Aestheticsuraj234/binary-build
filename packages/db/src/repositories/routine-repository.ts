import {and, asc, desc, eq, inArray, isNotNull} from 'drizzle-orm';

import type {Database} from '../index';
import type {AgentRow} from '../schema/agents';
import {agents} from '../schema/agents';
import type {
  NewRoutineRow,
  RoutineRow,
  RoutineRunRow,
  UserSettingsRow,
} from '../schema/routines';
import {routineRuns, routines, userSettings} from '../schema/routines';

/** A routine with the agent that runs it. */
export interface RoutineWithAgent {
  routine: RoutineRow;
  agent: AgentRow;
}

/** A routine as lists show it, with its newest run. */
export interface RoutineListItem extends RoutineWithAgent {
  lastRun: RoutineRunRow | null;
}

/** The fields a person can change on a routine. */
export type RoutineChanges = Pick<
  NewRoutineRow,
  'agentId' | 'name' | 'instructions' | 'cron' | 'enabled'
>;

/** Where a routine's Trigger.dev schedule stands. */
export type ScheduleState = Pick<
  RoutineRow,
  'scheduleId' | 'scheduleWindowMinutes'
>;

/**
 * Queries for `routines`. Methods named `…ForUser` only touch that person's
 * routines. `findWithAgent` doesn't check an owner: webhooks and job
 * workers use it, and they check a secret or a run id instead.
 */
export class RoutineRepository {
  constructor(private readonly db: Database) {}

  /** This person's routines, oldest first, each with its newest run. */
  async listForUser(userId: string): Promise<RoutineListItem[]> {
    const rows = await this.db
      .select({routine: routines, agent: agents})
      .from(routines)
      .innerJoin(agents, eq(agents.id, routines.agentId))
      .where(eq(routines.userId, userId))
      .orderBy(asc(routines.createdAt));
    const lastRuns = await this.lastRuns(rows.map(row => row.routine.id));
    return rows.map(row => ({
      ...row,
      lastRun: lastRuns.get(row.routine.id) ?? null,
    }));
  }

  /** The newest run of each routine. */
  private async lastRuns(ids: string[]): Promise<Map<string, RoutineRunRow>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .selectDistinctOn([routineRuns.routineId])
      .from(routineRuns)
      .where(inArray(routineRuns.routineId, ids))
      .orderBy(routineRuns.routineId, desc(routineRuns.createdAt));
    return new Map(rows.map(row => [row.routineId, row]));
  }

  /** One of this person's routines, or undefined. */
  async findForUser(
    id: string,
    userId: string,
  ): Promise<RoutineListItem | undefined> {
    const [row] = await this.db
      .select({routine: routines, agent: agents})
      .from(routines)
      .innerJoin(agents, eq(agents.id, routines.agentId))
      .where(and(eq(routines.id, id), eq(routines.userId, userId)))
      .limit(1);
    if (!row) {
      return undefined;
    }
    const lastRuns = await this.lastRuns([id]);
    return {...row, lastRun: lastRuns.get(id) ?? null};
  }

  /** Any routine by id, with its agent. Callers check access themselves. */
  async findWithAgent(id: string): Promise<RoutineWithAgent | undefined> {
    const [row] = await this.db
      .select({routine: routines, agent: agents})
      .from(routines)
      .innerJoin(agents, eq(agents.id, routines.agentId))
      .where(eq(routines.id, id))
      .limit(1);
    return row;
  }

  /** This person's routines that have a schedule. */
  listScheduledForUser(userId: string): Promise<RoutineRow[]> {
    return this.db
      .select()
      .from(routines)
      .where(and(eq(routines.userId, userId), isNotNull(routines.cron)));
  }

  async create(
    userId: string,
    routine: RoutineChanges & {webhookSecretHash: string | null},
  ): Promise<RoutineRow> {
    const [row] = await this.db
      .insert(routines)
      .values({...routine, userId})
      .returning();
    return row!;
  }

  /** Saves changes. Returns undefined if the routine isn't theirs. */
  async updateForUser(
    id: string,
    userId: string,
    changes: Partial<RoutineChanges> & {webhookSecretHash?: string | null},
  ): Promise<RoutineRow | undefined> {
    const [row] = await this.db
      .update(routines)
      .set(changes)
      .where(and(eq(routines.id, id), eq(routines.userId, userId)))
      .returning();
    return row;
  }

  /** Records where its Trigger.dev schedule stands. */
  async setSchedule(id: string, state: ScheduleState): Promise<void> {
    await this.db.update(routines).set(state).where(eq(routines.id, id));
  }

  /** Deletes a routine and its runs (transcripts stay). */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(routines)
      .where(and(eq(routines.id, id), eq(routines.userId, userId)))
      .returning({id: routines.id});
    return deleted.length > 0;
  }
}

/** Queries for `user_settings`. */
export class UserSettingsRepository {
  constructor(private readonly db: Database) {}

  async find(userId: string): Promise<UserSettingsRow | undefined> {
    const [row] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return row;
  }

  /** The person's time zone, or null until they've set one. */
  async timeZoneOf(userId: string): Promise<string | null> {
    return (await this.find(userId))?.timeZone ?? null;
  }

  async setTimeZone(userId: string, timeZone: string): Promise<void> {
    await this.db
      .insert(userSettings)
      .values({userId, timeZone})
      .onConflictDoUpdate({target: userSettings.userId, set: {timeZone}});
  }
}
