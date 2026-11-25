import type {AgentRow, MessageRow, RoomWithMembers} from '@binary/db';
import type {ChatTurn, RoomMember, RoomSummary} from '@binary/shared';
import {ENGINE_INFO, ROOM_MAX_ANSWERS} from '@binary/shared';

import type {RoomContext} from '../agents/system-prompt';
import {noteForModel} from '../chat/history';

/** The characters that can answer: everyone who hasn't been fired. */
export function activeMembers(room: RoomWithMembers): AgentRow[] {
  return room.members.filter(member => member.firedAt === null);
}

/** The lead, or the first active member if the lead was fired. */
export function leadOf(room: RoomWithMembers): AgentRow | undefined {
  const active = activeMembers(room);
  return (
    active.find(member => member.id === room.room.leadAgentId) ?? active[0]
  );
}

function modelOf(agent: AgentRow): string | null {
  return agent.engine === 'api' ? agent.model : ENGINE_INFO[agent.engine].label;
}

export function toRoomMember(agent: AgentRow): RoomMember {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    avatar: agent.avatar ?? 'pebble',
    model: modelOf(agent),
    isFired: agent.firedAt !== null,
  };
}

export function toRoomSummary({
  room,
  members,
  thread,
}: RoomWithMembers): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    mode: room.mode,
    leadAgentId: room.leadAgentId,
    members: members.map(toRoomMember),
    threadId: thread.id,
    title: thread.title,
    updatedAt: thread.updatedAt.toISOString(),
  };
}

/** What a character is told about the room it's answering in. */
export function roomContextFor(
  room: RoomWithMembers,
  agent: AgentRow,
): RoomContext {
  const lead = leadOf(room);
  return {
    name: room.room.name,
    members: activeMembers(room).map(member => ({
      name: member.name,
      role: member.role,
      isLead: member.id === lead?.id,
    })),
    self: agent.name,
    maxAnswers: ROOM_MAX_ANSWERS,
  };
}

/**
 * A room's messages as one character reads them: its own answers are its
 * own turns; everyone else's are labelled with their name, like
 * "[Nova]: …", and read as part of the conversation. Notes about another
 * character's tool say whose they were. Neighbouring turns from the same
 * side are joined, since some providers want them to alternate.
 */
export function roomTurns(
  rows: ReadonlyArray<
    Pick<MessageRow, 'role' | 'content' | 'toolCalls' | 'agentId'>
  >,
  agent: Pick<AgentRow, 'id'>,
  names: ReadonlyMap<string, string>,
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const row of rows) {
    const name = row.agentId ? (names.get(row.agentId) ?? 'A teammate') : null;
    let turn: ChatTurn;
    if (row.role === 'user') {
      turn = {role: 'user', content: row.content};
    } else if (row.role === 'assistant') {
      turn =
        row.agentId === agent.id
          ? {role: 'assistant', content: row.content}
          : {role: 'user', content: `[${name}]: ${row.content}`};
    } else if (row.agentId === agent.id || row.toolCalls.length === 0) {
      turn = {role: 'user', content: noteForModel(row)};
    } else {
      turn = {
        role: 'user',
        content: `Note from Binary, about ${name}: ${row.content}`,
      };
    }
    const last = turns.at(-1);
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`;
    } else {
      turns.push(turn);
    }
  }
  return turns;
}

/** Drops a "[Name]:" a model put in front of its own answer by habit. */
export function withoutOwnLabel(text: string, name: string): string {
  const label = new RegExp(
    `^\\s*\\[${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*`,
    'i',
  );
  return text.replace(label, '');
}
