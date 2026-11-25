import {and, asc, desc, eq, inArray} from 'drizzle-orm';

import type {Database} from '../index';
import type {AgentRow} from '../schema/agents';
import {agents} from '../schema/agents';
import type {ThreadRow} from '../schema/chats';
import {threads} from '../schema/chats';
import type {RoomRow} from '../schema/rooms';
import {roomMembers, rooms} from '../schema/rooms';

/** A room with its members (in order) and its conversation. */
export interface RoomWithMembers {
  room: RoomRow;
  /** In the room's order. Fired characters are included; callers skip them. */
  members: AgentRow[];
  thread: ThreadRow;
}

/** What a person sets on a room. `agentIds` are its members, in order. */
export interface RoomChanges {
  name: string;
  mode: RoomRow['mode'];
  leadAgentId: string;
  agentIds: string[];
}

/**
 * Queries for `rooms` and `room_members`. Every method takes the owner,
 * so nobody reads or changes anyone else's rooms. Callers check that the
 * agents are the person's own before saving them as members.
 */
export class RoomRepository {
  constructor(private readonly db: Database) {}

  /** Creates a room, its members and its one conversation, or nothing. */
  create(userId: string, changes: RoomChanges): Promise<RoomRow> {
    return this.db.transaction(async tx => {
      const [room] = await tx
        .insert(rooms)
        .values({
          userId,
          name: changes.name,
          mode: changes.mode,
          leadAgentId: changes.leadAgentId,
        })
        .returning();
      await tx.insert(roomMembers).values(
        changes.agentIds.map((agentId, position) => ({
          roomId: room!.id,
          agentId,
          position,
        })),
      );
      await tx
        .insert(threads)
        .values({userId, agentId: changes.leadAgentId, roomId: room!.id});
      return room!;
    });
  }

  /** Saves changes and replaces the members. Undefined if it isn't theirs. */
  update(
    id: string,
    userId: string,
    changes: RoomChanges,
  ): Promise<RoomRow | undefined> {
    return this.db.transaction(async tx => {
      const [room] = await tx
        .update(rooms)
        .set({
          name: changes.name,
          mode: changes.mode,
          leadAgentId: changes.leadAgentId,
        })
        .where(and(eq(rooms.id, id), eq(rooms.userId, userId)))
        .returning();
      if (!room) {
        return undefined;
      }
      await tx.delete(roomMembers).where(eq(roomMembers.roomId, id));
      await tx.insert(roomMembers).values(
        changes.agentIds.map((agentId, position) => ({
          roomId: id,
          agentId,
          position,
        })),
      );
      // The conversation's agent is the lead, so its approvals and images
      // keep a sensible owner.
      await tx
        .update(threads)
        .set({agentId: changes.leadAgentId})
        .where(eq(threads.roomId, id));
      return room;
    });
  }

  /** Deletes a room and its conversation. False if it isn't theirs. */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.userId, userId)))
      .returning({id: rooms.id});
    return deleted.length > 0;
  }

  /** One room, or undefined if it doesn't exist or isn't theirs. */
  async findForUser(
    id: string,
    userId: string,
  ): Promise<RoomWithMembers | undefined> {
    const [found] = await this.withMembers(
      and(eq(rooms.id, id), eq(rooms.userId, userId)),
    );
    return found;
  }

  /** The room a conversation belongs to, if it's a room's. */
  async findByThread(
    threadId: string,
    userId: string,
  ): Promise<RoomWithMembers | undefined> {
    const [row] = await this.db
      .select({roomId: threads.roomId})
      .from(threads)
      .where(and(eq(threads.id, threadId), eq(threads.userId, userId)))
      .limit(1);
    return row?.roomId ? this.findForUser(row.roomId, userId) : undefined;
  }

  /** This person's rooms, most recently active first. */
  listForUser(userId: string): Promise<RoomWithMembers[]> {
    return this.withMembers(eq(rooms.userId, userId));
  }

  private async withMembers(
    where: ReturnType<typeof eq> | ReturnType<typeof and>,
  ): Promise<RoomWithMembers[]> {
    const found = await this.db
      .select({room: rooms, thread: threads})
      .from(rooms)
      .innerJoin(threads, eq(threads.roomId, rooms.id))
      .where(where)
      .orderBy(desc(threads.updatedAt));
    if (found.length === 0) {
      return [];
    }
    const members = await this.db
      .select({roomId: roomMembers.roomId, agent: agents})
      .from(roomMembers)
      .innerJoin(agents, eq(agents.id, roomMembers.agentId))
      .where(
        inArray(
          roomMembers.roomId,
          found.map(f => f.room.id),
        ),
      )
      .orderBy(asc(roomMembers.position));
    return found.map(({room, thread}) => ({
      room,
      thread,
      members: members.filter(m => m.roomId === room.id).map(m => m.agent),
    }));
  }
}
