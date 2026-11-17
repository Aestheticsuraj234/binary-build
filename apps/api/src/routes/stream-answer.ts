import type {ChatTurn, PlaygroundEvent} from '@binary/shared';

import type {Engine} from '../engine/engine';
import {EngineError} from '../engine/engine';

/** What to stream: the newest message and, optionally, the context around it. */
export interface StreamRequest {
  prompt: string;
  system?: string;
  history?: ChatTurn[];
  signal: AbortSignal;
}

/**
 * Streams an engine's answer as newline-delimited JSON: a `start` line, then
 * `text` lines as the model writes, then `done` (or `error`).
 */
export function streamAnswer(engine: Engine, request: StreamRequest): Response {
  const encoder = new TextEncoder();
  let isClosed = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PlaygroundEvent) => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };

      send({type: 'start', model: engine.model});
      try {
        for await (const text of engine.stream(request)) {
          send({type: 'text', text});
        }
        send({type: 'done'});
      } catch (error) {
        const message =
          error instanceof EngineError
            ? error.message
            : 'Something went wrong.';
        send({type: 'error', message});
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
