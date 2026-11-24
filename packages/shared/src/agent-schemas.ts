import {z} from 'zod';

import {approvalModeSchema, DEFAULT_APPROVAL_MODE} from './approvals';
import {characterSchema} from './characters';
import {computersSchema} from './computers';
import {isModelOf, PROVIDER_IDS} from './providers';

export const AGENT_NAME_MAX_LENGTH = 40;
export const AGENT_ROLE_MAX_LENGTH = 200;
export const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;

/** Messages for the character creator. */
export const AGENT_MESSAGES = {
  nameRequired: 'Give your agent a name.',
  nameTooLong: `Keep the name under ${AGENT_NAME_MAX_LENGTH} characters.`,
  roleRequired: 'Describe the job in a few words.',
  roleTooLong: `Keep the job under ${AGENT_ROLE_MAX_LENGTH} characters.`,
  instructionsTooLong: `Keep instructions under ${AGENT_INSTRUCTIONS_MAX_LENGTH} characters.`,
  providerRequired: 'Choose who your agent thinks with.',
  modelInvalid: 'Choose one of the models listed for this provider.',
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
    /** How freely it may use tools. Older apps don't send it. */
    approvalMode: approvalModeSchema.default(DEFAULT_APPROVAL_MODE),
    /** Its computers: a cloud sandbox, a browser, both or none. */
    computers: computersSchema.default([]),
    /** The template this agent was copied from, if any. */
    templateId: z.uuid().nullable().optional(),
  })
  .refine(agent => isModelOf(agent.provider, agent.model), {
    message: AGENT_MESSAGES.modelInvalid,
    path: ['model'],
  });

export type AgentInput = z.infer<typeof agentInputSchema>;
