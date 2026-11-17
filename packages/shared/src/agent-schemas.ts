import {z} from 'zod';

import {characterSchema} from './characters';
import {isModelOf, PROVIDER_IDS} from './providers';

export const AGENT_NAME_MAX_LENGTH = 40;
export const AGENT_ROLE_MAX_LENGTH = 200;
export const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;
export const CHAT_MESSAGE_MAX_LENGTH = 4000;
/** How many earlier turns a reply can send. Older ones are dropped. */
export const CHAT_HISTORY_MAX_TURNS = 40;

/** Messages for the character creator and the conversation. */
export const AGENT_MESSAGES = {
  nameRequired: 'Give your agent a name.',
  nameTooLong: `Keep the name under ${AGENT_NAME_MAX_LENGTH} characters.`,
  roleRequired: 'Describe the job in a few words.',
  roleTooLong: `Keep the job under ${AGENT_ROLE_MAX_LENGTH} characters.`,
  instructionsTooLong: `Keep instructions under ${AGENT_INSTRUCTIONS_MAX_LENGTH} characters.`,
  providerRequired: 'Choose who your agent thinks with.',
  modelInvalid: 'Choose one of the models listed for this provider.',
  messageRequired: 'Type a message first.',
  messageTooLong: `Keep messages under ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
} as const;

/** Everything a person sets when hiring or editing an agent. */
export const agentInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, AGENT_MESSAGES.nameRequired)
      .max(AGENT_NAME_MAX_LENGTH, AGENT_MESSAGES.nameTooLong),
    role: z
      .string()
      .trim()
      .min(1, AGENT_MESSAGES.roleRequired)
      .max(AGENT_ROLE_MAX_LENGTH, AGENT_MESSAGES.roleTooLong),
    instructions: z
      .string()
      .trim()
      .max(AGENT_INSTRUCTIONS_MAX_LENGTH, AGENT_MESSAGES.instructionsTooLong),
    avatar: characterSchema,
    provider: z.enum(PROVIDER_IDS, {error: AGENT_MESSAGES.providerRequired}),
    model: z.string().trim(),
    /** The template this agent was copied from, if any. */
    templateId: z.uuid().nullable().optional(),
  })
  .refine(agent => isModelOf(agent.provider, agent.model), {
    message: AGENT_MESSAGES.modelInvalid,
    path: ['model'],
  });

/** One earlier turn of a conversation. */
export const chatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(20_000),
});

/** A new message for an agent, with the conversation so far. */
export const replySchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, AGENT_MESSAGES.messageRequired)
    .max(CHAT_MESSAGE_MAX_LENGTH, AGENT_MESSAGES.messageTooLong),
  history: z.array(chatTurnSchema).max(CHAT_HISTORY_MAX_TURNS).default([]),
});

export type AgentInput = z.infer<typeof agentInputSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export type ReplyInput = z.infer<typeof replySchema>;
