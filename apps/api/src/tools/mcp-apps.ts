import type {AppRow} from '@binary/db';
import type {ToolRisk} from '@binary/shared';
import type {MCPClient} from '@ai-sdk/mcp';
import {createMCPClient} from '@ai-sdk/mcp';
import {jsonSchema} from 'ai';

import {AppUnreachableError} from '../errors';
import type {Vault} from '../vault';
import type {BinaryTool} from './toolbox';

/** How long connecting to an app and listing its tools may take. */
const CONNECT_TIMEOUT_MS = 8_000;
/** How long one app tool call may take. */
const CALL_TIMEOUT_MS = 30_000;
/** Tool names the model sees are capped at this length. */
const TOOL_NAME_MAX_LENGTH = 64;

/** What the server says about a tool. Only `readOnlyHint` is used here. */
interface ToolAnnotations {
  readOnlyHint?: boolean;
}

/**
 * A tool's risk from what its server says. Only a tool the server marks
 * `readOnlyHint: true` is `read`. Anything else, including no answer at
 * all, is `write`: when in doubt, ask first.
 */
export function riskFromAnnotations(
  annotations: ToolAnnotations | undefined,
): ToolRisk {
  return annotations?.readOnlyHint === true ? 'read' : 'write';
}

/** "Google Calendar" becomes "google_calendar". */
function slugOf(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'app'
  );
}

/**
 * The name the model calls an app's tool by: the app's name, then the
 * tool's own ("shop_lookup_order"), unless the tool already starts with it.
 */
export function appToolName(appName: string, toolName: string): string {
  const app = slugOf(appName);
  const own = toolName.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const name = own.toLowerCase().startsWith(`${app}_`) ? own : `${app}_${own}`;
  return name.slice(0, TOOL_NAME_MAX_LENGTH);
}

/** Where to find an app and how to sign in to it. */
export interface AppConnection {
  /** The saved app's id, so approved requests find its tools again. */
  appId?: string;
  name: string;
  url: string;
  /** The whole Authorization header value, if the app needs one. */
  authorization?: string;
}

/** The Authorization header saved for an app, decrypted. */
export function authorizationOf(app: AppRow, vault: Vault): string | undefined {
  return app.encryptedAuthorization
    ? vault.decrypt(app.encryptedAuthorization, appOwner(app.userId, app.id))
    : undefined;
}

/**
 * Who an app's token belongs to, for the vault. The app's id is part of
 * it, so a token copied onto another app won't decrypt.
 */
export function appOwner(userId: string, appId: string) {
  return {userId, provider: `app:${appId}`};
}

/** A plain reason an app couldn't be reached. Never includes the token. */
function unreachableReason(error: unknown, url: string): string {
  const text = error instanceof Error ? error.message : String(error);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Keep the URL as given.
  }
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(text)) {
    return `${host} refused the connection. Check the Authorization header.`;
  }
  if (/\b404\b/.test(text)) {
    return `${host} has no MCP server at that address. Check the URL.`;
  }
  if (/abort|timed? ?out/i.test(text)) {
    return `${host} took too long to answer.`;
  }
  return `Couldn't reach ${host}. Check the URL and that the server is running.`;
}

/** An app that's connected, with its tools ready for the toolbox. */
export interface OpenApp {
  tools: BinaryTool[];
  close(): Promise<void>;
}

/**
 * Connects to an MCP app over Streamable HTTP and lists its tools. Throws
 * `AppUnreachableError` with a reason that's safe to show.
 */
export async function openApp(connection: AppConnection): Promise<OpenApp> {
  let client: MCPClient | undefined;
  try {
    client = await createMCPClient({
      clientName: 'binary',
      transport: {
        type: 'http',
        url: connection.url,
        headers: connection.authorization
          ? {authorization: connection.authorization}
          : undefined,
        redirect: 'follow',
      },
      initializationOptions: {timeout: CONNECT_TIMEOUT_MS},
    });
    const {tools: definitions} = await client.listTools({
      options: {timeout: CONNECT_TIMEOUT_MS},
    });
    const connected = client;

    const tools = definitions.map((definition): BinaryTool => {
      const annotations = definition.annotations as ToolAnnotations | undefined;
      return {
        name: appToolName(connection.name, definition.name),
        description:
          definition.description?.trim() ||
          `${definition.name} from ${connection.name}.`,
        risk: riskFromAnnotations(annotations),
        source: {
          kind: 'app',
          appId: connection.appId ?? '',
          tool: definition.name,
        },
        inputSchema: jsonSchema(
          definition.inputSchema as Parameters<typeof jsonSchema>[0],
        ),
        async run(input, signal) {
          let result: Awaited<ReturnType<MCPClient['callTool']>>;
          try {
            result = await connected.callTool({
              name: definition.name,
              arguments: (input ?? {}) as Record<string, unknown>,
              options: {signal, timeout: CALL_TIMEOUT_MS},
            });
          } catch (error) {
            throw new Error(unreachableReason(error, connection.url), {
              cause: error,
            });
          }
          if (result.isError) {
            const text = (result.content as Array<{text?: string}> | undefined)
              ?.map(part => part.text ?? '')
              .join(' ')
              .trim();
            throw new Error(
              text
                ? text.slice(0, 500)
                : `${connection.name} reported an error.`,
            );
          }
          return result;
        },
      };
    });
    return {tools, close: () => connected.close()};
  } catch (error) {
    await client?.close().catch(() => {});
    throw new AppUnreachableError(unreachableReason(error, connection.url));
  }
}
