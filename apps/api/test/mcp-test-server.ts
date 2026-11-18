import type {Server} from 'node:http';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';

/** The token the test shop wants, as a whole Authorization header. */
export const SHOP_AUTHORIZATION = 'Bearer shop-secret-1234';

/**
 * A tiny MCP app for tests: a shop with one tool that only reads
 * (`lookup_order`, marked `readOnlyHint`) and one that changes things
 * (`refund_order`, no hints). `calls` records every tool that actually ran,
 * so tests can prove a blocked tool never did.
 */
export interface TestShop {
  url: string;
  calls: string[];
  close(): Promise<void>;
}

function buildShop(calls: string[]): McpServer {
  const server = new McpServer({name: 'test-shop', version: '1.0.0'});
  server.registerTool(
    'lookup_order',
    {
      description: 'Look up an order by its number.',
      inputSchema: {orderId: z.string()},
      annotations: {readOnlyHint: true},
    },
    async ({orderId}) => {
      calls.push(`lookup_order:${orderId}`);
      return {
        content: [{type: 'text', text: `Order ${orderId}: 2 mugs, shipped.`}],
      };
    },
  );
  server.registerTool(
    'refund_order',
    {
      description: 'Refund an order in full.',
      inputSchema: {orderId: z.string()},
    },
    async ({orderId}) => {
      calls.push(`refund_order:${orderId}`);
      return {content: [{type: 'text', text: `Refunded ${orderId}.`}]};
    },
  );
  return server;
}

/** Starts the shop on a free port. It wants `SHOP_AUTHORIZATION`. */
export async function startTestShop(): Promise<TestShop> {
  const calls: string[] = [];
  const http: Server = createServer((request, response) => {
    if (request.headers.authorization !== SHOP_AUTHORIZATION) {
      response.writeHead(401, {'content-type': 'application/json'});
      response.end(JSON.stringify({error: 'unauthorized'}));
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const body: unknown = text ? JSON.parse(text) : undefined;
      // Stateless: a fresh server and transport for every request.
      const server = buildShop(calls);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      response.on('close', () => {
        void transport.close();
        void server.close();
      });
      server
        .connect(transport)
        .then(() => transport.handleRequest(request, response, body))
        .catch(() => {
          if (!response.headersSent) {
            response.writeHead(500).end();
          }
        });
    });
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const {port} = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    close: () =>
      new Promise(resolve => {
        http.closeAllConnections();
        http.close(() => resolve());
      }),
  };
}

/** A URL where nothing is listening. */
export async function closedUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address() as AddressInfo;
  await new Promise(resolve => server.close(resolve));
  return `http://127.0.0.1:${port}/mcp`;
}
