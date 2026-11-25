import type {AgentRow} from '@binary/db';
import type {ChatTurn} from '@binary/shared';
import {ROOM_MAX_ANSWERS} from '@binary/shared';

import type {Engine} from '../engine/engine';

/** How much of the conversation the router reads, per message. */
const ROUTER_CONTEXT_CHARS = 600;
/** The router reads only the last few turns. */
const ROUTER_CONTEXT_TURNS = 6;

function clip(text: string): string {
  return text.length > ROUTER_CONTEXT_CHARS
    ? `${text.slice(0, ROUTER_CONTEXT_CHARS)}…`
    : text;
}

/** The instructions the lead's model reads when it routes. */
export function routerSystemPrompt(
  roomName: string,
  members: readonly AgentRow[],
  lead: AgentRow,
): string {
  return [
    `You are ${lead.name}, the lead of "${roomName}", a group chat between ` +
      'a person and a team of AI coworkers. Right now you are not ' +
      "answering: you decide who should answer the person's latest message.",
    'The team:',
    ...members.map(m => `- ${m.name}: ${m.role}`),
    'Pick only who is needed, usually one; pick more only when the message ' +
      'clearly needs several people, in the order they should answer. ' +
      `Never more than ${ROOM_MAX_ANSWERS}. Choose yourself when it's general ` +
      'or unclear.',
    'Reply with JSON only, no other text, like {"answer": ["Name"]}.',
  ].join('\n');
}

/** The conversation, as the router reads it. */
export function routerPrompt(history: readonly ChatTurn[], message: string) {
  const recent = history
    .slice(-ROUTER_CONTEXT_TURNS)
    .map(turn => clip(turn.content))
    .join('\n\n');
  return (
    (recent ? `The conversation so far:\n${recent}\n\n` : '') +
    `The person's latest message:\n${clip(message)}\n\nWho should answer?`
  );
}

/**
 * Reads the router's reply: `{"answer": ["Nova", "Bolt"]}`, or failing
 * that, the members it names in order. Unknown names are dropped.
 */
export function parseRoute(
  reply: string,
  members: readonly AgentRow[],
): AgentRow[] {
  const byName = (name: string) =>
    members.find(m => m.name.toLowerCase() === name.trim().toLowerCase());
  let names: string[] = [];
  const json = reply.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const parsed = JSON.parse(json[0]) as {answer?: unknown};
      if (Array.isArray(parsed.answer)) {
        names = parsed.answer.filter(n => typeof n === 'string');
      }
    } catch {
      // Not JSON after all: fall back to the names in the text.
    }
  }
  const picked =
    names.length > 0
      ? names.map(byName)
      : [...members]
          .map(m => ({
            m,
            at: reply.toLowerCase().indexOf(m.name.toLowerCase()),
          }))
          .filter(({at}) => at !== -1)
          .sort((a, b) => a.at - b.at)
          .map(({m}) => m);
  const unique: AgentRow[] = [];
  for (const member of picked) {
    if (member && !unique.includes(member)) {
      unique.push(member);
    }
  }
  return unique.slice(0, ROOM_MAX_ANSWERS);
}

/**
 * Asks the lead's model who should answer. Returns an empty list when it
 * can't tell (it failed, or named nobody), and the caller falls back to
 * the lead.
 */
export async function routeByLead(
  engine: Engine,
  {
    roomName,
    members,
    lead,
    history,
    message,
  }: {
    roomName: string;
    members: readonly AgentRow[];
    lead: AgentRow;
    history: readonly ChatTurn[];
    message: string;
  },
): Promise<AgentRow[]> {
  let reply = '';
  try {
    for await (const part of engine.stream({
      system: routerSystemPrompt(roomName, members, lead),
      prompt: routerPrompt(history, message),
      maxSteps: 1,
    })) {
      if (part.type === 'text') {
        reply += part.text;
      }
    }
  } catch (error) {
    console.warn(
      '[rooms] routing failed, the lead answers:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
  return parseRoute(reply, members);
}
