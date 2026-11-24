import type {LookupAddress} from 'node:dns';
import type {Server} from 'node:http';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {z} from 'zod';

import {UnsafeUrlError} from '../src/errors';
import {currentTimeTool, webPageTool} from '../src/tools/built-in';
import {appToolName, riskFromAnnotations} from '../src/tools/mcp-apps';
import {
  createPageFetcher,
  htmlToText,
  isPublicAddress,
} from '../src/tools/safe-fetch';
import type {BinaryTool} from '../src/tools/toolbox';
import {isWaitingResult, Toolbox, WAITING_MESSAGE} from '../src/tools/toolbox';

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['2606:4700::1111', true],
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.16.0.1', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false], // cloud metadata
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['224.0.0.1', false],
    ['::1', false],
    ['fe80::1', false],
    ['fc00::1', false],
    ['::ffff:127.0.0.1', false],
    ['64:ff9b::7f00:1', false],
    ['2002:7f00:1::', false],
    ['not an address', false],
  ])('%s → %s', (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });

  it('allows a public IPv4 address written as IPv6', () => {
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });
});

/** A DNS lookup that answers every name with `address`. */
function lookupTo(address: string) {
  return ((
    _host: string,
    _options: unknown,
    callback: (error: null, addresses: LookupAddress[]) => void,
  ) => callback(null, [{address, family: 4}])) as never;
}

describe('the page fetcher', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/to-private') {
        response.writeHead(302, {location: 'http://10.0.0.1/admin'});
        response.end();
      } else if (request.url === '/to-name') {
        response.writeHead(302, {location: 'http://inside.test/'});
        response.end();
      } else if (request.url === '/image') {
        response.writeHead(200, {'content-type': 'image/png'});
        response.end('PNG');
      } else {
        response.writeHead(200, {'content-type': 'text/html'});
        response.end(
          '<html><head><title>Mugs &amp; more</title><style>p{}</style></head>' +
            '<body><h1>Orders</h1><p>Two&nbsp;mugs<br>shipped</p>' +
            '<script>alert(1)</script></body></html>',
        );
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  /** Lets the test server through, like a public site would be. */
  const loopbackIsPublic = (address: string) =>
    address === '127.0.0.1' || isPublicAddress(address);

  it('refuses this computer, by name or by address', async () => {
    const fetchPage = createPageFetcher();

    for (const url of [
      'http://localhost:5433/',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      await expect(fetchPage(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it('refuses a public-looking name that points at a private address', async () => {
    const fetchPage = createPageFetcher({
      lookup: lookupTo('10.0.0.5'),
    });

    await expect(
      fetchPage('http://totally-public.example/'),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('refuses other schemes', async () => {
    await expect(createPageFetcher()('file:///etc/passwd')).rejects.toThrow(
      'Binary only opens http and https addresses.',
    );
  });

  it('checks every redirect, by address and by name', async () => {
    const fetchPage = createPageFetcher({
      isAllowedAddress: loopbackIsPublic,
      lookup: lookupTo('192.168.0.9'),
    });

    await expect(fetchPage(`${base}/to-private`)).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(fetchPage(`${base}/to-name`)).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it('reads an allowed page as text', async () => {
    const page = webPageTool(
      createPageFetcher({isAllowedAddress: loopbackIsPublic}),
    );

    expect(await page.run({url: `${base}/`}, undefined)).toEqual({
      url: `${base}/`,
      status: 200,
      title: 'Mugs & more',
      text: 'Orders\nTwo mugs\nshipped',
      truncated: false,
    });
    await expect(page.run({url: `${base}/image`}, undefined)).rejects.toThrow(
      "That page isn't text",
    );
  });

  it('stops reading a huge page', async () => {
    const fetchPage = createPageFetcher({
      isAllowedAddress: loopbackIsPublic,
      maxBytes: 20,
    });

    const page = await fetchPage(`${base}/`);

    expect(page.body).toHaveLength(20);
    expect(page.truncated).toBe(true);
  });
});

describe('htmlToText', () => {
  it('decodes numeric entities and keeps list items apart', () => {
    expect(
      htmlToText('<ul><li>caf&#233;</li><li>&#x2713; done</li></ul>').text,
    ).toBe('• café\n• ✓ done');
  });
});

describe('get_current_time', () => {
  const tool = currentTimeTool(() => new Date('2026-11-18T03:00:00Z'));

  it('tells the time in a time zone, or UTC', async () => {
    expect(await tool.run({timeZone: 'Asia/Tokyo'}, undefined)).toMatchObject({
      timeZone: 'Asia/Tokyo',
      now: expect.stringContaining('12:00:00') as string,
    });
    expect(await tool.run({}, undefined)).toMatchObject({timeZone: 'UTC'});
  });
});

describe('risk', () => {
  it('is read only when the server says the tool only reads', () => {
    expect(riskFromAnnotations({readOnlyHint: true})).toBe('read');
    expect(riskFromAnnotations({readOnlyHint: false})).toBe('write');
    expect(riskFromAnnotations({})).toBe('write');
    expect(riskFromAnnotations(undefined)).toBe('write');
  });
});

describe('appToolName', () => {
  it('puts the app first, unless the tool already does', () => {
    expect(appToolName('Shop', 'lookup_order')).toBe('shop_lookup_order');
    expect(appToolName('Google Calendar', 'list events')).toBe(
      'google_calendar_list_events',
    );
    expect(appToolName('Gmail', 'GMAIL_SEND_EMAIL')).toBe('GMAIL_SEND_EMAIL');
    expect(appToolName('A', 'x'.repeat(100))).toHaveLength(64);
  });
});

describe('the toolbox policy', () => {
  const ran: string[] = [];
  const make = (name: string, risk: BinaryTool['risk']): BinaryTool => ({
    name,
    description: name,
    risk,
    inputSchema: z.object({}),
    run: async () => {
      ran.push(name);
      return 'ran';
    },
  });
  const toolbox = new Toolbox([
    make('look', 'read'),
    make('send', 'write'),
    make('click', 'computer'),
  ]);
  const options = {toolCallId: 'x', messages: []} as never;

  /** What each tool does in a mode: its output, or "missing". */
  async function outcomes(mode: Parameters<Toolbox['toToolSet']>[0]) {
    ran.length = 0;
    const set = toolbox.toToolSet(mode);
    const result: Record<string, unknown> = {};
    for (const name of ['look', 'send', 'click']) {
      const output: unknown = set[name]
        ? await set[name].execute!({}, options)
        : 'missing';
      result[name] = isWaitingResult(output) ? 'asks' : output;
    }
    return {result, ran: [...ran]};
  }

  it('Auto-approve reads: reads run, the rest ask', async () => {
    expect(await outcomes('auto_reads')).toEqual({
      result: {look: 'ran', send: 'asks', click: 'asks'},
      ran: ['look'],
    });
  });

  it('Ask first: everything asks, nothing runs', async () => {
    expect(await outcomes('ask_first')).toEqual({
      result: {look: 'asks', send: 'asks', click: 'asks'},
      ran: [],
    });
  });

  it('Accept edits: reads and writes run, computer asks', async () => {
    expect(await outcomes('accept_edits')).toEqual({
      result: {look: 'ran', send: 'ran', click: 'asks'},
      ran: ['look', 'send'],
    });
  });

  it('Plan only: no tools are offered at all', async () => {
    expect(toolbox.toToolSet('plan_only')).toEqual({});
  });

  it('tells the model a waiting tool has not run', async () => {
    const output = await toolbox.toToolSet('auto_reads').send!.execute!(
      {},
      options,
    );
    expect(output).toEqual({
      status: 'waiting_for_approval',
      message: WAITING_MESSAGE,
    });
  });

  it('treats an unknown tool as write', () => {
    expect(toolbox.riskOf('mystery')).toBe('write');
  });
});
