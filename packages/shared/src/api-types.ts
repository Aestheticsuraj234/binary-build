import type {ProviderId} from './providers';

/**
 * How the API describes one provider's key to the apps. The key itself is
 * never included: only whether it exists and its last 4 characters.
 */
export interface ProviderKeyStatus {
  provider: ProviderId;
  connected: boolean;
  /** Last 4 characters of the key, or null when no key is saved. */
  last4: string | null;
  /** ISO date the key was last saved, or null. */
  updatedAt: string | null;
}

/**
 * One line of the Playground's streamed answer. The API sends these as
 * newline-delimited JSON so text, errors and the end arrive in order.
 */
export type PlaygroundEvent =
  | {type: 'start'; model: string}
  | {type: 'text'; text: string}
  | {type: 'error'; message: string}
  | {type: 'done'};

/** Error codes the API returns as `{code, message}` with a 4xx status. */
export const API_ERROR_CODES = {
  invalidInput: 'INVALID_INPUT',
  unauthorized: 'UNAUTHORIZED',
  noKey: 'NO_KEY',
  notFound: 'NOT_FOUND',
} as const;

/**
 * An agent as the apps see it: only the fields they need. The owner and
 * timestamps stay on the server.
 */
export interface AgentSummary {
  id: string;
  name: string;
  /** The character that plays this agent (a `CharacterId`). */
  avatar: string;
  role: string;
  instructions: string;
  provider: ProviderId | null;
  model: string | null;
  templateId: string | null;
}

/** A ready-made starting point for a new agent. */
export interface AgentTemplateSummary {
  id: string;
  slug: string;
  name: string;
  role: string;
  instructions: string;
  /** The character who plays this template (a `CharacterId`). */
  character: string;
}
