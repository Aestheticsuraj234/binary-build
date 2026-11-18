import {z} from 'zod';

export const CHAT_MESSAGE_MAX_LENGTH = 4000;
/**
 * How many saved messages the model reads for each answer. Older ones stay
 * in the chat but aren't sent, so a long chat costs no more than a short one.
 */
export const CHAT_CONTEXT_MESSAGES = 20;
/** Titles are cut to this many characters. */
export const THREAD_TITLE_MAX_LENGTH = 60;

/** Messages for chats. */
export const CHAT_MESSAGES = {
  agentRequired: 'Choose who to chat with.',
  messageRequired: 'Type a message first.',
  messageTooLong: `Keep messages under ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
} as const;

/** Starts a chat with one of your agents. */
export const startChatSchema = z.object({
  agentId: z.uuid({error: CHAT_MESSAGES.agentRequired}),
});

/** A new message in a chat. The API keeps the history, so only this is sent. */
export const sendMessageSchema = z.object({
  message: z
    .string({error: CHAT_MESSAGES.messageRequired})
    .trim()
    .min(1, CHAT_MESSAGES.messageRequired)
    .max(CHAT_MESSAGE_MAX_LENGTH, CHAT_MESSAGES.messageTooLong),
});

export type StartChatInput = z.infer<typeof startChatSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** One turn of a conversation, as a model reads it. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Names a chat after its first message: one line, cut at a word boundary
 * when it's too long. "What's a good name for a cat that…".
 */
export function titleFromMessage(message: string): string {
  const line = message.replace(/\s+/g, ' ').trim();
  if (line.length <= THREAD_TITLE_MAX_LENGTH) {
    return line;
  }
  const cut = line.slice(0, THREAD_TITLE_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Only back up to a space if it doesn't throw most of the title away.
  const end = lastSpace > THREAD_TITLE_MAX_LENGTH / 2 ? lastSpace : cut.length;
  return `${cut.slice(0, end).trimEnd()}…`;
}

/**
 * The part of a chat the model reads: the newest `size` messages, oldest
 * first. A window never starts with an answer, since some providers want
 * the person to speak first.
 */
export function contextWindow<T extends ChatTurn>(
  messages: readonly T[],
  size = CHAT_CONTEXT_MESSAGES,
): T[] {
  const recent = messages.slice(-size);
  const firstQuestion = recent.findIndex(message => message.role === 'user');
  return firstQuestion === -1 ? [] : recent.slice(firstQuestion);
}
