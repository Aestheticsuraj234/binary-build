import {z} from 'zod';

import type {ChatMessage} from './api-types';
import type {ComputerSummary} from './computers';
import type {ToolCallRecord} from './tools';

/** How many characters a room holds. */
export const ROOM_MIN_MEMBERS = 2;
export const ROOM_MAX_MEMBERS = 6;
/** The most answers one message gets, hand-offs included. */
export const ROOM_MAX_ANSWERS = 4;
export const ROOM_NAME_MAX_LENGTH = 60;

/**
 * Who answers a message. `mention`: the characters you @mention, or the
 * lead. `auto`: the lead's model picks; an @mention still wins.
 */
export const ROOM_MODES = ['mention', 'auto'] as const;
export type RoomMode = (typeof ROOM_MODES)[number];

export const ROOM_MODE_INFO: Record<
  RoomMode,
  {label: string; description: string}
> = {
  mention: {
    label: '@Mention',
    description:
      'The characters you @mention answer, in order. With no mention, the lead does.',
  },
  auto: {
    label: 'Automatic',
    description:
      "The lead's model picks who should answer. An @mention still wins.",
  },
};

export const ROOM_MESSAGES = {
  noName: 'Give this room a name.',
  nameTooLong: `Keep the name under ${ROOM_NAME_MAX_LENGTH} characters.`,
  tooFew: `Pick at least ${ROOM_MIN_MEMBERS} characters.`,
  tooMany: `A room holds up to ${ROOM_MAX_MEMBERS} characters.`,
  leadNotMember: 'The lead has to be one of the characters in the room.',
  noLead: 'Pick a lead.',
  sameName:
    'Two characters in a room can’t share a name, or @mentions would be unclear.',
  notYours: 'Pick characters from your crew.',
} as const;

export const roomInputSchema = z
  .object({
    name: z
      .string({error: ROOM_MESSAGES.noName})
      .trim()
      .min(1, ROOM_MESSAGES.noName)
      .max(ROOM_NAME_MAX_LENGTH, ROOM_MESSAGES.nameTooLong),
    mode: z.enum(ROOM_MODES, {error: 'Choose how the room answers.'}),
    agentIds: z
      .array(z.uuid({error: ROOM_MESSAGES.notYours}), {
        error: ROOM_MESSAGES.tooFew,
      })
      .min(ROOM_MIN_MEMBERS, ROOM_MESSAGES.tooFew)
      .max(ROOM_MAX_MEMBERS, ROOM_MESSAGES.tooMany)
      .refine(ids => new Set(ids).size === ids.length, ROOM_MESSAGES.tooFew),
    leadAgentId: z.uuid({error: ROOM_MESSAGES.noLead}),
  })
  .refine(room => room.agentIds.includes(room.leadAgentId), {
    message: ROOM_MESSAGES.leadNotMember,
    path: ['leadAgentId'],
  });
export type RoomInput = z.infer<typeof roomInputSchema>;

/** A character in a room, as the apps show it. */
export interface RoomMember {
  id: string;
  name: string;
  role: string;
  /** The character that plays it (a `CharacterId`). */
  avatar: string;
  /** "gpt-5.4-mini", "Claude Code"…: what it thinks with. */
  model: string | null;
  /** Fired characters stay listed in old rooms but never answer. */
  isFired: boolean;
}

export interface RoomSummary {
  id: string;
  name: string;
  mode: RoomMode;
  leadAgentId: string;
  members: RoomMember[];
  /** The room's conversation. */
  threadId: string;
  /** Its first message, or null before there is one. */
  title: string | null;
  /** ISO date of the last message. */
  updatedAt: string;
}

/** A room with its conversation, to pick it up again. */
export interface RoomDetail {
  room: RoomSummary;
  /** Answers and notes carry `agentId`: who wrote them. */
  messages: ChatMessage[];
  /** The room's running computers, shared by its characters. */
  computers: ComputerSummary[];
}

/**
 * One line of a room's answer stream (newline-delimited JSON):
 *
 * - `start`: your message is saved.
 * - `routed`: who will answer first, and why.
 * - `turn`: a character starts; `delta` and `tool` events are theirs until
 *   the turn ends with `answer` (saved) or `turn-error` (a note is saved).
 * - `handoff`: an answer @mentioned teammates, who are queued.
 * - `end`: everyone is done. `capped` when the 4-answer cap stopped it.
 * - `error`: nothing could answer at all.
 */
export type RoomEvent =
  | {type: 'start'; userMessage: ChatMessage}
  | {
      type: 'routed';
      agentIds: string[];
      by: 'mention' | 'lead' | 'router';
    }
  | {type: 'turn'; agentId: string; model: string}
  | {type: 'delta'; text: string}
  | {type: 'tool'; call: ToolCallRecord}
  | {type: 'answer'; message: ChatMessage}
  | {type: 'turn-error'; agentId: string; note: ChatMessage}
  | {type: 'handoff'; from: string; agentIds: string[]}
  | {type: 'end'; answers: number; capped: boolean}
  | {type: 'error'; message: string};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The members @mentioned in `text`, in the order they're first mentioned.
 * Names match without regard to case, longest first (so "@Bo" never steals
 * "@Bolt"), and only as whole words: an email like a@bolt.com doesn't
 * count.
 */
export function findMentions<T extends {id: string; name: string}>(
  text: string,
  members: readonly T[],
): T[] {
  const byLength = [...members].sort((a, b) => b.name.length - a.name.length);
  const found: Array<{member: T; index: number}> = [];
  const taken: Array<[number, number]> = [];
  for (const member of byLength) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])@${escapeRegExp(member.name)}(?![\\p{L}\\p{N}_])`,
      'giu',
    );
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[1]!.length;
      const end = start + member.name.length + 1;
      if (taken.some(([s, e]) => start < e && end > s)) {
        continue;
      }
      taken.push([start, end]);
      if (!found.some(f => f.member.id === member.id)) {
        found.push({member, index: start});
      }
    }
  }
  return found.sort((a, b) => a.index - b.index).map(f => f.member);
}
