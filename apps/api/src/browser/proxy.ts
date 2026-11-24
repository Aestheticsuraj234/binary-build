import type {IncomingMessage, ServerResponse} from 'node:http';
import http from 'node:http';
import type {AddressInfo, Socket} from 'node:net';
import net from 'node:net';

import {createHostResolver} from '../tools/safe-fetch';

/** What the proxy needs: which addresses are allowed, and how to look up names. */
export type HostResolver = ReturnType<typeof createHostResolver>;

/** A running proxy, and the hosts it refused (for logs and tests). */
export interface GuardedProxy {
  url: string;
  /** "host:port" of the newest refused requests, oldest first. */
  readonly blocked: string[];
  close(): Promise<void>;
}

/** Set on the proxy's own refusals. */
export const BLOCKED_HEADER = 'x-binary-blocked';

/** How many refused hosts are remembered. */
const BLOCKED_KEPT = 100;

/** "example.com:443" → ["example.com", 443]. IPv6 comes as "[::1]:443". */
function splitHostPort(value: string, fallbackPort: number): [string, number] {
  const match = /^\[?([^\]]*?)\]?(?::(\d+))?$/.exec(value);
  const host = match?.[1] ?? value;
  const port = match?.[2] ? Number(match[2]) : fallbackPort;
  return [host, port];
}

/**
 * A small HTTP proxy that only reaches allowed (public) addresses. The
 * browser sends every request through it: plain HTTP as proxy requests,
 * and HTTPS and WebSockets as CONNECT tunnels. For each, the proxy looks
 * the host up itself, refuses it unless every address is public, and
 * connects to exactly the address it checked, so a page can't pass the
 * check and then point the browser at this machine or your network.
 */
export async function startGuardedProxy(
  resolve: HostResolver = createHostResolver(),
): Promise<GuardedProxy> {
  const blocked: string[] = [];
  const refuse = (target: string) => {
    blocked.push(target);
    if (blocked.length > BLOCKED_KEPT) {
      blocked.shift();
    }
  };

  /** Plain HTTP: the browser asks for "http://host/path". */
  async function forward(request: IncomingMessage, response: ServerResponse) {
    let target: URL;
    try {
      target = new URL(request.url ?? '');
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (target.protocol !== 'http:') {
      response.writeHead(400).end();
      return;
    }
    const port = Number(target.port || 80);
    let address: {address: string; family: number};
    try {
      address = await resolve(target.hostname);
    } catch {
      refuse(`${target.hostname}:${port}`);
      response
        .writeHead(403, {
          'content-type': 'text/plain',
          // Lets the browser tools tell a refusal from a site's own 403.
          [BLOCKED_HEADER]: '1',
        })
        .end('Binary only opens public web addresses.');
      return;
    }
    const upstream = http.request(
      {
        host: address.address,
        family: address.family,
        port,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: {...request.headers, host: target.host},
        setHost: false,
      },
      upstreamResponse => {
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502);
      }
      response.end();
    });
    request.pipe(upstream);
  }

  /** HTTPS and WebSockets: a CONNECT tunnel to "host:port". */
  async function tunnel(
    request: IncomingMessage,
    client: Socket,
    head: Buffer,
  ) {
    const [host, port] = splitHostPort(request.url ?? '', 443);
    client.on('error', () => client.destroy());
    let address: {address: string; family: number};
    try {
      address = await resolve(host);
    } catch {
      refuse(`${host}:${port}`);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect({
      host: address.address,
      family: address.family,
      port,
    });
    upstream.on('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        upstream.write(head);
      }
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => {
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
    client.on('close', () => upstream.destroy());
  }

  const server = http.createServer((request, response) => {
    void forward(request, response);
  });
  server.on('connect', (request, client, head) => {
    void tunnel(request, client as Socket, head);
  });
  // Only this machine can use it.
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const {port} = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    blocked,
    close: () =>
      new Promise(done => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
