import type {ChatTurn, PlaygroundEvent} from '@binary/shared';

import type {Engine} from '../engine/engine';
import {EngineError} from '../engine/engine';

/** What to stream: the newest message and, optionally, the context around it. */
export interface StreamRequest {
  prompt: string;
  system?: string;
  history?: ChatTurn[];
  signal?: AbortSignal;
}

/** The safe-to-show message for anything an engine threw. */
export function engineErrorMessage(error: unknown): string {
  return error instanceof EngineError ? error.message : 'Something went wrong.';
}

/**
 * A response that streams newline-delimited JSON: one event per line, sent
 * the moment `produce` calls `send`. If the person goes away, `send` quietly
 * does nothing and `produce` still runs to the end.
 */
export function ndjsonResponse<Event>(
  produce: (send: (event: Event) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  let isClosed = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };
      try {
        await produce(send);
      } catch (error) {
        // `produce` sends its own errors; this is only for the unexpected.
        console.error('[stream] failed:', error);
      }
      if (!isClosed) {
        isClosed = true;
        controller.close();
      }
    },
    cancel() {
      // The browser went away; stop sending.
      isClosed = true;
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Streams an engine's answer for the Playground: a `start` line, then
 * `text` lines as the model writes, then `done` (or `error`).
 */
export function streamAnswer(engine: Engine, request: StreamRequest): Response {
  return ndjsonResponse<PlaygroundEvent>(async send => {
    send({type: 'start', model: engine.model});
    try {
      for await (const text of engine.stream(request)) {
        send({type: 'text', text});
      }
      send({type: 'done'});
    } catch (error) {
      send({type: 'error', message: engineErrorMessage(error)});
    }
  });
}
