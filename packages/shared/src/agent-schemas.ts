import {z} from 'zod';

import {approvalModeSchema, DEFAULT_APPROVAL_MODE} from './approvals';
import {characterSchema} from './characters';
import {computersSchema} from './computers';
import {ENGINE_KINDS} from './runners';
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
  runnerRequired: 'Choose which of your computers it works on.',
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
    /** Its computers: a sandbox, a browser, your computer, a desktop… */
    computers: computersSchema.default([]),
    /**
     * What it thinks with: an API model (provider and model above), or a
     * CLI on your computer. Older apps don't send it.
     */
    engine: z.enum(ENGINE_KINDS).default('api'),
    /** Which Runner it uses, for Your computer and CLI engines. */
    runnerId: z.uuid().nullable().default(null),
    /** The template this agent was copied from, if any. */
    templateId: z.uuid().nullable().optional(),
  })
  .refine(agent => isModelOf(agent.provider, agent.model), {
    message: AGENT_MESSAGES.modelInvalid,
    path: ['model'],
  })
  .refine(
    agent =>
      agent.runnerId !== null ||
      (agent.engine === 'api' && !agent.computers.includes('runner')),
    {message: AGENT_MESSAGES.runnerRequired, path: ['runnerId']},
  );

export type AgentInput = z.infer<typeof agentInputSchema>;
