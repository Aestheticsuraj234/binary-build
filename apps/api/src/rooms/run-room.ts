import type {AgentRow, RoomWithMembers} from '@binary/db';
import {ThreadRepository} from '@binary/db';
import type {RoomEvent} from '@binary/shared';
import {
  CHAT_CONTEXT_MESSAGES,
  contextWindow,
  findMentions,
  ROOM_MAX_ANSWERS,
} from '@binary/shared';

import type {AnswerDeps} from '../chat/answer';
import {generateAnswer} from '../chat/answer';
import {engineForAgent} from '../engine/agent-engine';
import type {EngineFactory} from '../engine/factory';
import {toChatMessage} from '../routes/threads';
import {
  activeMembers,
  leadOf,
  roomContextFor,
  roomTurns,
  withoutOwnLabel,
} from './conversation';
import {routeByLead} from './router';

/** What a room needs: the chat pipeline, plus engines for its characters. */
export interface RoomDeps extends AnswerDeps {
  engineFor: EngineFactory;
}

/** Who answers first, and why. */
export interface Route {
  agents: AgentRow[];
  by: 'mention' | 'lead' | 'router';
}

/** One queued turn: who, and who handed it to them (if anyone). */
interface Turn {
  agent: AgentRow;
  handedBy?: string;
}

/**
 * Who answers a message first. Mentions always win; with none, the lead
 * answers in @mention rooms, and in automatic rooms the lead's model picks
 * (falling back to the lead if it can't).
 */
export async function routeMessage(
  deps: RoomDeps,
  room: RoomWithMembers,
  userId: string,
  message: string,
): Promise<Route> {
  const active = activeMembers(room);
  const lead = leadOf(room)!;
  const mentioned = findMentions(message, active);
  if (mentioned.length > 0) {
    return {agents: mentioned, by: 'mention'};
  }
  if (room.room.mode === 'mention' || lead.engine !== 'api') {
    // A coding CLI is too slow to ask just to pick who answers.
    return {agents: [lead], by: 'lead'};
  }
  const chosen = await engineForAgent(deps, lead, userId);
  if (!chosen.ok) {
    return {agents: [lead], by: 'lead'};
  }
  const threads = new ThreadRepository(deps.db);
  const rows = contextWindow(
    await threads.recentMessages(room.thread.id, CHAT_CONTEXT_MESSAGES),
  );
  const turns = roomTurns(rows, lead, namesOf(room));
  const picked = await routeByLead(chosen.engine, {
    roomName: room.room.name,
    members: active,
    lead,
    // The latest turn is the message itself, passed on its own.
    history: turns.slice(0, -1),
    message,
  });
  return picked.length > 0
    ? {agents: picked, by: 'router'}
    : {agents: [lead], by: 'lead'};
}

function namesOf(room: RoomWithMembers): Map<string, string> {
  return new Map(room.members.map(member => [member.id, member.name]));
}

/**
 * Answers one message in a room: characters answer in turn, each reading
 * everything said so far, and an @mention in an answer queues that
 * teammate. Every message gets at most `ROOM_MAX_ANSWERS` answers, so
 * hand-offs can't loop. A character that fails leaves a note and the
 * next one carries on. Each answer is saved as soon as it's done.
 */
export async function answerInRoom(
  deps: RoomDeps,
  room: RoomWithMembers,
  userId: string,
  route: Route,
  send: (event: RoomEvent) => void,
): Promise<void> {
  const threads = new ThreadRepository(deps.db);
  const threadId = room.thread.id;
  const names = namesOf(room);
  const active = activeMembers(room);
  const queue: Turn[] = route.agents.map(agent => ({agent}));
  let answers = 0;

  while (queue.length > 0 && answers < ROOM_MAX_ANSWERS) {
    const {agent, handedBy} = queue.shift()!;
    answers++;

    const fail = async (reason: string) => {
      const note = await threads.addNote(
        threadId,
        `${agent.name} couldn't answer: ${reason}`,
        agent.id,
      );
      send({type: 'turn-error', agentId: agent.id, note: toChatMessage(note)});
    };

    const chosen = await engineForAgent(deps, agent, userId);
    if (!chosen.ok) {
      send({type: 'turn', agentId: agent.id, model: agent.model ?? ''});
      await fail(chosen.error);
      continue;
    }
    send({type: 'turn', agentId: agent.id, model: chosen.engine.model});

    // Everything so far, as this character reads it. The newest turn is
    // the person's message, plus any answers since: that's the prompt.
    const rows = contextWindow(
      await threads.recentMessages(threadId, CHAT_CONTEXT_MESSAGES),
    );
    const turns = roomTurns(rows, agent, names);
    const latest = turns.at(-1);
    const history = latest?.role === 'user' ? turns.slice(0, -1) : turns;
    const prompt =
      (latest?.role === 'user' ? latest.content : '') +
      (handedBy
        ? `\n\n(Note from Binary: ${handedBy} handed part of this to you, ${agent.name}. Answer your part.)`
        : '');

    const outcome = await generateAnswer(
      deps,
      {
        engine: chosen.engine,
        agent,
        userId,
        threadId,
        prompt,
        history,
        room: roomContextFor(room, agent),
      },
      send,
    );
    if (!outcome.ok) {
      await fail(outcome.error);
      continue;
    }

    const text = withoutOwnLabel(outcome.text, agent.name);
    try {
      const saved = await threads.addAnswer(
        threadId,
        text,
        outcome.toolCalls,
        outcome.approvals,
        agent.id,
      );
      send({type: 'answer', message: toChatMessage(saved)});
    } catch (error) {
      // For example, the room was deleted while it answered.
      console.error('[rooms] could not save an answer:', error);
      send({type: 'error', message: "The answer couldn't be saved."});
      return;
    }

    // A hand-off: teammates it @mentioned answer next, once each in line.
    const handedTo = findMentions(
      text,
      active.filter(member => member.id !== agent.id),
    ).filter(member => !queue.some(turn => turn.agent.id === member.id));
    if (handedTo.length > 0) {
      queue.push(
        ...handedTo.map(member => ({agent: member, handedBy: agent.name})),
      );
      send({
        type: 'handoff',
        from: agent.id,
        agentIds: handedTo.map(member => member.id),
      });
    }
  }

  send({type: 'end', answers, capped: queue.length > 0});
}
