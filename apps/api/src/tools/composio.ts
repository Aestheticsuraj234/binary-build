import type {ToolRisk} from '@binary/shared';
import {Composio} from '@composio/core';
import {jsonSchema} from 'ai';

import {AppUnreachableError} from '../errors';
import type {BinaryTool} from './toolbox';

/** One toolkit in Composio's catalog, as Binary keeps it. */
export interface CatalogEntry {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  categories: Array<{slug: string; name: string}>;
  /** Every way it can sign in, e.g. ["OAUTH2", "API_KEY"]. */
  authSchemes: string[];
  /** The ways Composio runs for you, with no setup. */
  managedSchemes: string[];
  noAuth: boolean;
  toolsCount: number;
}

/** One of a person's connected accounts. */
export interface ComposioAccount {
  id: string;
  toolkit: string;
  /** ACTIVE, INITIATED, EXPIRED and so on. */
  status: string;
  createdAt: string | null;
}

/** The parts of a Composio tool Binary uses. */
export interface ComposioToolDefinition {
  slug: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  /** Composio's hints, e.g. `readOnlyHint`, `destructiveHint`. */
  tags: string[];
}

/**
 * A tool's risk from Composio's own tags. Only a tool tagged `readOnlyHint`
 * is `read`; anything else is `write`.
 */
export function composioRisk(tags: readonly string[]): ToolRisk {
  return tags.includes('readOnlyHint') ? 'read' : 'write';
}

/** A person's Composio tools for one answer, ready to run. */
export interface ComposioTools {
  definitions: ComposioToolDefinition[];
  /**
   * Runs one tool for this person. Resolves to its result, or throws an
   * `Error` whose message is safe to show.
   */
  execute(
    slug: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

/**
 * Everything Binary asks of Composio. The real one wraps the SDK; tests
 * pass a fake, so they never call Composio.
 */
export interface ComposioGateway {
  /** Every toolkit Composio offers. Cached; it rarely changes. */
  catalog(): Promise<CatalogEntry[]>;
  /** This person's connected accounts, in any state. */
  accounts(userId: string): Promise<ComposioAccount[]>;
  /** Starts connecting a toolkit. Returns the page to sign in on. */
  connect(
    userId: string,
    toolkit: string,
    callbackUrl: string,
  ): Promise<{redirectUrl: string}>;
  /** Removes this person's accounts for a toolkit. */
  disconnect(userId: string, toolkit: string): Promise<void>;
  /** The tools Binary offers from a toolkit (Composio's important ones). */
  toolsOf(toolkit: string): Promise<ComposioToolDefinition[]>;
  /** Tools from these toolkits, runnable for this person. */
  loadTools(userId: string, toolkits: string[]): Promise<ComposioTools>;
}

/** Turns Composio tools into toolbox tools. */
export function toBinaryTools(tools: ComposioTools): BinaryTool[] {
  return tools.definitions.map(definition => ({
    name: definition.slug,
    description: definition.description,
    risk: composioRisk(definition.tags),
    source: {kind: 'composio', slug: definition.slug},
    inputSchema: jsonSchema(
      definition.inputSchema as Parameters<typeof jsonSchema>[0],
    ),
    run: (input, signal) =>
      tools.execute(
        definition.slug,
        (input ?? {}) as Record<string, unknown>,
        signal,
      ),
  }));
}

/** A plain message for any Composio failure. Never includes a key. */
function reasonOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|api key/i.test(text)) {
    return 'Composio refused the API key. Check COMPOSIO_API_KEY.';
  }
  if (/auth ?config/i.test(text)) {
    return 'This app needs an auth config in your Composio dashboard before it can connect.';
  }
  return "Couldn't reach Composio. Try again in a moment.";
}

/** Runs a Composio call, turning failures into `AppUnreachableError`. */
async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof AppUnreachableError) {
      throw error;
    }
    console.warn('[composio]', error instanceof Error ? error.message : error);
    throw new AppUnreachableError(reasonOf(error));
  }
}

/** How long the catalog is kept before asking Composio again. */
const CATALOG_TTL_MS = 60 * 60 * 1000;
/** How many tools to offer from one toolkit, at most. */
const TOOLS_PER_TOOLKIT = 40;

/**
 * The real gateway, on the Composio SDK. Each Binary user is a Composio
 * user (by id), so people's accounts never mix.
 *
 * Tools run inside a session that enables the toolkit's tools, writes
 * included: Binary's approval policy decides what runs, and a tool that
 * changes things only runs after the person approves it (or when the
 * character may accept edits).
 */
export function createComposioGateway(apiKey: string): ComposioGateway {
  const composio = new Composio({
    apiKey,
    allowTracking: false,
    disableVersionCheck: true,
  });
  let cached: {at: number; entries: CatalogEntry[]} | undefined;

  function sessionFor(userId: string, toolkits: string[]) {
    return composio.create(userId, {
      sessionPreset: 'direct_tools',
      toolkits,
      manageConnections: false,
    });
  }

  async function definitionsFor(
    toolkits: string[],
  ): Promise<ComposioToolDefinition[]> {
    if (toolkits.length === 0) {
      return [];
    }
    const tools = await composio.tools.getRawComposioTools({
      toolkits,
      important: true,
      limit: TOOLS_PER_TOOLKIT * toolkits.length,
    });
    return tools.map(tool => ({
      slug: tool.slug,
      description: tool.description?.trim() || tool.name,
      inputSchema: (tool.inputParameters ?? {
        type: 'object',
        properties: {},
      }) as Record<string, unknown>,
      tags: tool.tags ?? [],
    }));
  }

  return {
    catalog: () =>
      guarded(async () => {
        if (cached && Date.now() - cached.at < CATALOG_TTL_MS) {
          return cached.entries;
        }
        const items = await composio.toolkits.get({
          sortBy: 'usage',
          limit: 1000,
        });
        const entries = items
          .filter(item => !item.isLocalToolkit)
          .map((item): CatalogEntry => ({
            slug: item.slug,
            name: item.name,
            logo: item.meta.logo ?? null,
            description: item.meta.description ?? '',
            categories: (item.meta.categories ?? []).map(category => ({
              slug: category.slug,
              name: category.name,
            })),
            authSchemes: item.authSchemes ?? [],
            managedSchemes: item.composioManagedAuthSchemes ?? [],
            noAuth: item.noAuth ?? false,
            toolsCount: item.meta.toolsCount ?? 0,
          }));
        cached = {at: Date.now(), entries};
        return entries;
      }),

    accounts: userId =>
      guarded(async () => {
        const {items} = await composio.connectedAccounts.list({
          userIds: [userId],
          limit: 200,
        });
        return items.map(item => ({
          id: item.id,
          toolkit: item.toolkit.slug,
          status: item.status,
          createdAt: item.createdAt ?? null,
        }));
      }),

    connect: (userId, toolkit, callbackUrl) =>
      guarded(async () => {
        const session = await sessionFor(userId, [toolkit]);
        const request = await session.authorize(toolkit, {callbackUrl});
        if (!request.redirectUrl) {
          throw new AppUnreachableError(
            "Composio didn't send a sign-in page for that app.",
          );
        }
        return {redirectUrl: request.redirectUrl};
      }),

    disconnect: (userId, toolkit) =>
      guarded(async () => {
        const {items} = await composio.connectedAccounts.list({
          userIds: [userId],
          toolkitSlugs: [toolkit],
        });
        await Promise.all(
          items.map(account => composio.connectedAccounts.delete(account.id)),
        );
      }),

    toolsOf: toolkit => guarded(() => definitionsFor([toolkit])),

    loadTools: (userId, toolkits) =>
      guarded(async () => {
        const definitions = await definitionsFor(toolkits);
        if (definitions.length === 0) {
          return {
            definitions,
            execute: () => Promise.reject(new Error('No tools.')),
          };
        }
        const session = await sessionFor(userId, toolkits);
        const tools: ComposioTools = {
          definitions,
          // The SDK can't cancel a tool call yet, so `signal` isn't used.
          async execute(slug, input) {
            let result: Awaited<ReturnType<typeof session.execute>>;
            try {
              result = await session.execute(slug, input);
            } catch (error) {
              throw new Error(reasonOf(error), {cause: error});
            }
            if (result.resultType !== 'completed') {
              throw new Error(
                result.error?.slice(0, 500) ||
                  `${slug} didn't work (${result.resultType}).`,
              );
            }
            return result.data;
          },
        };
        return tools;
      }),
  };
}
