import {z} from 'zod';

import {PROVIDER_IDS} from './providers';

export const API_KEY_MIN_LENGTH = 20;
export const API_KEY_MAX_LENGTH = 500;
export const PROMPT_MAX_LENGTH = 4000;

/** Messages for the API keys page and the Playground. */
export const ENGINE_MESSAGES = {
  keyRequired: 'Paste your key.',
  keyTooShort: 'That key looks too short. Copy the whole key.',
  keyTooLong: 'That key looks too long.',
  keyHasSpaces: "Keys don't contain spaces. Copy just the key.",
  promptRequired: 'Type a prompt first.',
  promptTooLong: `Keep prompts under ${PROMPT_MAX_LENGTH} characters.`,
  providerInvalid: 'Choose OpenAI, Anthropic or Google Gemini.',
} as const;

/**
 * A key someone pastes in. Only the shape is checked here; whether the
 * provider accepts it shows up the first time it is used.
 */
export const saveKeySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, ENGINE_MESSAGES.keyRequired)
    .min(API_KEY_MIN_LENGTH, ENGINE_MESSAGES.keyTooShort)
    .max(API_KEY_MAX_LENGTH, ENGINE_MESSAGES.keyTooLong)
    .regex(/^\S+$/, ENGINE_MESSAGES.keyHasSpaces),
});

/** One Playground request: a prompt for one provider. */
export const playgroundSchema = z.object({
  provider: z.enum(PROVIDER_IDS, {error: ENGINE_MESSAGES.providerInvalid}),
  prompt: z
    .string()
    .trim()
    .min(1, ENGINE_MESSAGES.promptRequired)
    .max(PROMPT_MAX_LENGTH, ENGINE_MESSAGES.promptTooLong),
});

export type SaveKeyInput = z.infer<typeof saveKeySchema>;
export type PlaygroundInput = z.infer<typeof playgroundSchema>;
