import type {PlaygroundEvent} from './api-types';

/**
 * Reads a newline-delimited JSON stream from the API one event at a time,
 * as the lines arrive. A line can be split across network chunks, so text
 * is buffered until a full line is available. Pass the event type you
 * expect, e.g. `readEvents<ChatEvent>(body)`.
 */
export async function* readEvents<Event = PlaygroundEvent>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Event> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }
      buffered += decoder.decode(value, {stream: true});

      let newline = buffered.indexOf('\n');
      while (newline !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) {
          yield JSON.parse(line) as Event;
        }
        newline = buffered.indexOf('\n');
      }
    }
    const last = buffered.trim();
    if (last) {
      yield JSON.parse(last) as Event;
    }
  } finally {
    reader.releaseLock();
  }
}
