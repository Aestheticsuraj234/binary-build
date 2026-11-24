import type {AppRow, Database} from '@binary/db';
import {AppRepository} from '@binary/db';
import type {AppSummary, AppWithTools} from '@binary/shared';

import {AppUnreachableError} from '../errors';
import type {Vault} from '../vault';
import type {ComposioGateway} from './composio';
import {toBinaryTools} from './composio';
import {activeToolkits} from './integrations';
import {authorizationOf, openApp} from './mcp-apps';
import type {OpenApp} from './mcp-apps';
import type {BinaryTool} from './toolbox';
import {toSummary, Toolbox} from './toolbox';

export function toAppSummary(row: AppRow): AppSummary {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    hasAuthorization: row.encryptedAuthorization !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Opens one saved app. Never throws: a failure comes back as `error`. */
async function tryOpen(
  app: AppRow,
  vault: Vault,
): Promise<{app: AppRow; open?: OpenApp; error?: string}> {
  try {
    const open = await openApp({
      appId: app.id,
      name: app.name,
      url: app.url,
      authorization: authorizationOf(app, vault),
    });
    return {app, open};
  } catch (error) {
    const reason =
      error instanceof AppUnreachableError
        ? error.message
        : `Couldn't open ${app.name}.`;
    return {app, error: reason};
  }
}

/** Gives clashing tool names a number, so every name is unique. */
function uniqueNames(tools: BinaryTool[]): BinaryTool[] {
  const seen = new Set<string>();
  return tools.map(binaryTool => {
    let name = binaryTool.name;
    for (let n = 2; seen.has(name); n++) {
      name = `${binaryTool.name.slice(0, 60)}_${n}`;
    }
    seen.add(name);
    return {...binaryTool, name};
  });
}

/** One person's tools for one answer: built in, plus every app that answers. */
export interface UserToolbox {
  toolbox: Toolbox;
  /** Names of apps that couldn't be reached this time. */
  unavailable: string[];
  /** Closes the app connections. Call it once the answer is done. */
  close(): Promise<void>;
}

/** A person's Composio tools, or nothing if Composio is off or down. */
async function tryComposio(
  composio: ComposioGateway | null,
  db: Database,
  userId: string,
): Promise<{tools: BinaryTool[]; error?: string}> {
  if (!composio) {
    return {tools: []};
  }
  try {
    const toolkits = await activeToolkits(composio, db, userId);
    if (toolkits.length === 0) {
      return {tools: []};
    }
    return {tools: toBinaryTools(await composio.loadTools(userId, toolkits))};
  } catch (error) {
    return {
      tools: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Opens all of a person's apps (and Composio) at once. An app that can't be
 * reached is left out (and named in `unavailable`), so chats keep working.
 */
export async function loadUserToolbox(
  db: Database,
  vault: Vault,
  userId: string,
  builtIn: BinaryTool[],
  composio: ComposioGateway | null = null,
): Promise<UserToolbox> {
  const apps = await new AppRepository(db).listForUser(userId);
  const [opened, fromComposio] = await Promise.all([
    Promise.all(apps.map(app => tryOpen(app, vault))),
    tryComposio(composio, db, userId),
  ]);
  const appTools = opened.flatMap(result => result.open?.tools ?? []);
  for (const result of opened) {
    if (result.error) {
      console.warn(`[tools] ${result.app.name}: ${result.error}`);
    }
  }
  const unavailable = opened.filter(r => r.error).map(r => r.app.name);
  if (fromComposio.error) {
    console.warn(`[tools] Composio: ${fromComposio.error}`);
    unavailable.push('Composio');
  }
  return {
    toolbox: new Toolbox([
      ...builtIn,
      ...uniqueNames([...fromComposio.tools, ...appTools]),
    ]),
    unavailable,
    async close() {
      await Promise.all(
        opened.map(result => result.open?.close().catch(() => {})),
      );
    },
  };
}

/** One app with its tools, for the Apps & tools page. */
export async function describeApp(
  app: AppRow,
  vault: Vault,
): Promise<AppWithTools> {
  const {open, error} = await tryOpen(app, vault);
  await open?.close().catch(() => {});
  return {
    app: toAppSummary(app),
    tools: open?.tools.map(toSummary) ?? [],
    error: error ?? null,
  };
}
