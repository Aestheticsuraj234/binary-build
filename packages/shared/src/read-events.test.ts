import {describe, expect, it} from 'vitest';

import {readEvents} from './read-events';

/** A stream that delivers `chunks` one at a time, like a slow network. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const events = [];
  for await (const event of readEvents(streamOf(chunks))) {
    events.push(event);
  }
  return events;
}

describe('readEvents', () => {
  it('reads one event per line', async () => {
    expect(
      await collect(['{"type":"text","text":"Hi"}\n{"type":"done"}\n']),
    ).toEqual([{type: 'text', text: 'Hi'}, {type: 'done'}]);
  });

  it('joins a line that arrives in pieces', async () => {
    expect(
      await collect([
        '{"type":"te',
        'xt","text":"Hel',
        'lo"}\n',
        '{"type":"done"}',
      ]),
    ).toEqual([{type: 'text', text: 'Hello'}, {type: 'done'}]);
  });

  it('keeps multi-byte characters split across chunks intact', async () => {
    const bytes = new TextEncoder().encode(
      '{"type":"text","text":"héllo 👋"}\n',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 26));
        controller.enqueue(bytes.slice(26));
        controller.close();
      },
    });
    const events = [];
    for await (const event of readEvents(stream)) {
      events.push(event);
    }
    expect(events).toEqual([{type: 'text', text: 'héllo 👋'}]);
  });
});
