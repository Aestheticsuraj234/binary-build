import type {ProviderId} from '@binary/shared';
import {getProvider} from '@binary/shared';
import type {LanguageModel} from 'ai';
import {APICallError, RetryError, streamText} from 'ai';

import type {Engine, EngineRequest} from './engine';
import {EngineError} from './engine';

/** Turns whatever the AI SDK threw into an `EngineError` with a clear message. */
export function toEngineError(
  error: unknown,
  provider: ProviderId,
  model: string,
): EngineError {
  if (error instanceof EngineError) {
    return error;
  }
  // After a retry, the AI SDK wraps the provider's last error.
  if (RetryError.isInstance(error)) {
    return toEngineError(error.lastError, provider, model);
  }
  const name = getProvider(provider).name;

  if (error instanceof Error && error.name === 'AbortError') {
    return new EngineError('stopped', 'Stopped.');
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (status === 401 || status === 403) {
      return new EngineError(
        'rejected-key',
        `${name} rejected this key. Check it on the API keys page.`,
      );
    }
    if (status === 429) {
      return new EngineError(
        'rate-limited',
        `${name} is limiting requests for this key. Try again in a moment.`,
      );
    }
    if (status === 404) {
      return new EngineError(
        'unknown-model',
        `${name} doesn't offer the model "${model}" to this key.`,
      );
    }
    if (status >= 500) {
      return new EngineError(
        'provider-down',
        `${name} is having trouble right now. Try again later.`,
      );
    }
  }

  // Log the details for whoever runs the server. They never contain the key.
  console.error(`[engine] ${provider}/${model} failed:`, error);
  return new EngineError('unknown', `Something went wrong talking to ${name}.`);
}

/**
 * An engine that calls a provider's API through the Vercel AI SDK.
 * It is handed a ready-made model, so it never sees or stores the key.
 */
export class ApiEngine implements Engine {
  readonly provider: ProviderId;
  readonly model: string;
  private readonly languageModel: LanguageModel;

  constructor(
    provider: ProviderId,
    model: string,
    languageModel: LanguageModel,
  ) {
    this.provider = provider;
    this.model = model;
    this.languageModel = languageModel;
  }

  async *stream(request: EngineRequest): AsyncIterable<string> {
    const result = streamText({
      model: this.languageModel,
      prompt: request.prompt,
      system: request.system,
      abortSignal: request.signal,
      // One quick retry for a hiccup; more would keep people waiting.
      maxRetries: 1,
      // Errors are handled below, so skip the AI SDK's own console logging.
      onError: () => {},
    });

    // `stream` reports provider failures as `error` parts instead of
    // throwing, so each kind of part is handled here.
    try {
      for await (const part of result.stream) {
        if (part.type === 'text-delta') {
          yield part.text;
        } else if (part.type === 'error') {
          throw toEngineError(part.error, this.provider, this.model);
        } else if (part.type === 'abort') {
          throw new EngineError('stopped', 'Stopped.');
        }
      }
    } catch (error) {
      throw toEngineError(error, this.provider, this.model);
    }
  }
}
