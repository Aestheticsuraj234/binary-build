import http from 'node:http';
import type {AddressInfo} from 'node:net';
import net from 'node:net';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import type {GuardedProxy} from '../src/browser/proxy';
import {startGuardedProxy} from '../src/browser/proxy';
import {createHostResolver} from '../src/tools/safe-fetch';

let proxy: GuardedProxy;
let target: net.Server;
let targetPort = 0;

/** Sends `CONNECT host:port` through the proxy; returns its status line. */
function connect(hostPort: string): Promise<string> {
  const {port} = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), '127.0.0.1', () => {
      socket.write(`CONNECT ${hostPort} HTTP/1.1\r\nHost: ${hostPort}\r\n\r\n`);
    });
    socket.once('data', data => {
      resolve(data.toString().split('\r\n')[0]!);
      socket.destroy();
    });
    socket.on('error', reject);
  });
}

beforeAll(async () => {
  // Something to tunnel to, on this machine.
  target = net.createServer(socket => socket.end());
  await new Promise<void>(done => target.listen(0, '127.0.0.1', done));
  targetPort = (target.address() as AddressInfo).port;
  // As in the browser tests: only 127.0.0.1 counts as public.
  proxy = await startGuardedProxy(
    createHostResolver({isAllowedAddress: address => address === '127.0.0.1'}),
  );
});

afterAll(async () => {
  await proxy.close();
  target.close();
});

describe('the browser proxy', () => {
  it('tunnels to allowed addresses (HTTPS and WebSockets use this)', async () => {
    expect(await connect(`127.0.0.1:${targetPort}`)).toBe(
      'HTTP/1.1 200 Connection Established',
    );
  });

  it.each([
    '10.0.0.1:443',
    '169.254.169.254:443',
    '[::1]:443',
    '127.0.0.2:443',
  ])('refuses a tunnel to %s', async hostPort => {
    expect(await connect(hostPort)).toBe('HTTP/1.1 403 Forbidden');
    expect(proxy.blocked.at(-1)).toBe(hostPort.replace(/[[\]]/g, ''));
  });

  it('refuses plain HTTP to a private address, and marks the refusal', async () => {
    const {port} = new URL(proxy.url);
    const response = await new Promise<http.IncomingMessage>(resolve => {
      http
        .get({host: '127.0.0.1', port, path: 'http://10.0.0.1/secret'}, resolve)
        .end();
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers['x-binary-blocked']).toBe('1');
    response.resume();
  });

  it('only listens on this machine', () => {
    expect(new URL(proxy.url).hostname).toBe('127.0.0.1');
  });
});
