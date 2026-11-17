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
