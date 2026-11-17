import type {ChatTurn, ProviderId} from '@binary/shared';

/** What to ask a model. */
export interface EngineRequest {
  /** The newest message from the person. */
  prompt: string;
  /** Earlier turns of the conversation, oldest first. */
  history?: ChatTurn[];
  /** Optional instructions that shape every answer. */
  system?: string;
  /** Stops the request, for example when the person leaves the page. */
  signal?: AbortSignal;
}

/**
 * Something that can answer a prompt.
 *
 * Chapter 3 has one kind, `ApiEngine`, which calls a provider's API with the
 * person's own key. Later chapters can add other engines behind this same
 * interface, and the code that uses an engine does not need to change.
 */
export interface Engine {
  readonly provider: ProviderId;
  readonly model: string;
  /**
   * Streams the answer piece by piece as the model writes it.
   * Throws an `EngineError` if the provider fails.
   */
  stream(request: EngineRequest): AsyncIterable<string>;
}

/** Why an engine failed, in words a person can act on. */
export type EngineErrorKind =
  | 'rejected-key'
  | 'rate-limited'
  | 'unknown-model'
  | 'provider-down'
  | 'stopped'
  | 'unknown';

/** A provider failure, with a message that is safe to show. */
export class EngineError extends Error {
  readonly kind: EngineErrorKind;

  constructor(kind: EngineErrorKind, message: string) {
    super(message);
    this.name = 'EngineError';
    this.kind = kind;
  }
}
