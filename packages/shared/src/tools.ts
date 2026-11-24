import {z} from 'zod';

import type {ToolImage} from './computers';

/**
 * How much a tool can do. Every tool has one.
 *
 * - `read` only looks things up. It runs straight away.
 * - `write` changes something outside Binary, like sending or deleting.
 * - `computer` controls a sandbox, a browser or a computer.
 *
 * Whether a tool runs, asks first or isn't offered depends on the
 * character's approval mode (see `APPROVAL_POLICY`).
 */
export const TOOL_RISKS = ['read', 'write', 'computer'] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

/** How each risk level is described to people. */
export const RISK_INFO: Record<ToolRisk, {label: string; description: string}> =
  {
    read: {
      label: 'Read',
      description: 'Only looks things up. Runs straight away.',
    },
    write: {
      label: 'Write',
      description:
        'Changes something outside Binary, like sending or deleting. Asks first, unless the character may accept edits.',
    },
    computer: {
      label: 'Computer',
      description:
        'Controls a sandbox, a browser or your computer. Always asks first.',
    },
  };

/** One tool, as the Apps & tools page lists it. */
export interface ToolSummary {
  /** The name the model calls it by, e.g. `shop_lookup_order`. */
  name: string;
  description: string;
  risk: ToolRisk;
}

/** A connected MCP app. Its token is never included, only whether it has one. */
export interface AppSummary {
  id: string;
  name: string;
  url: string;
  hasAuthorization: boolean;
  /** ISO date. */
  createdAt: string;
}

/** An app with its tools, or why they couldn't be loaded. */
export interface AppWithTools {
  app: AppSummary;
  tools: ToolSummary[];
  /** Set when the app couldn't be reached; `tools` is then empty. */
  error: string | null;
}

/** Everything on the Apps & tools page. */
export interface ToolsOverview {
  builtIn: ToolSummary[];
  apps: AppWithTools[];
}

/**
 * Where a tool call is up to. `waiting` needs the person's OK (its
 * `approvalId` says which request); `rejected` means they said no and it
 * never ran. `blocked` is from before approvals existed.
 */
export type ToolCallStatus =
  'running' | 'done' | 'failed' | 'waiting' | 'rejected' | 'blocked';

/** One tool call inside an answer, as it's shown and saved. */
export interface ToolCallRecord {
  id: string;
  name: string;
  risk: ToolRisk;
  input: unknown;
  status: ToolCallStatus;
  /** The result, once it's `done`. */
  output?: unknown;
  /** Why it `failed` or was `blocked`. */
  error?: string;
  /** The approval request, while it's `waiting` and after it's decided. */
  approvalId?: string;
  /** Images it made for the person (charts). The model never sees them. */
  images?: ToolImage[];
}

export const APP_NAME_MAX_LENGTH = 40;
export const APP_AUTHORIZATION_MAX_LENGTH = 4000;

/** Messages for the connect-an-app form. */
export const APP_MESSAGES = {
  nameRequired: 'Give the app a name.',
  nameTooLong: `Keep the name under ${APP_NAME_MAX_LENGTH} characters.`,
  urlInvalid: 'Paste the full MCP server URL, starting with https://',
  authorizationTooLong: 'That Authorization header is too long.',
} as const;

/** Connects an MCP app. The token goes in `authorization`, not the URL. */
export const connectAppSchema = z.object({
  name: z
    .string({error: APP_MESSAGES.nameRequired})
    .trim()
    .min(1, APP_MESSAGES.nameRequired)
    .max(APP_NAME_MAX_LENGTH, APP_MESSAGES.nameTooLong),
  url: z
    .string({error: APP_MESSAGES.urlInvalid})
    .trim()
    .pipe(z.url({protocol: /^https?$/, error: APP_MESSAGES.urlInvalid})),
  /** The whole header value, e.g. "Bearer sk-…". Empty means none. */
  authorization: z
    .string()
    .trim()
    .max(APP_AUTHORIZATION_MAX_LENGTH, APP_MESSAGES.authorizationTooLong)
    .optional()
    .transform(value => value || undefined),
});

export type ConnectAppInput = z.infer<typeof connectAppSchema>;

/** Where a person's Composio integration stands. */
export type IntegrationStatus =
  | 'connected'
  /** They started signing in but haven't finished. */
  | 'pending'
  /** The account expired or failed; connecting again fixes it. */
  | 'needs-attention'
  | 'not-connected';

/** One Composio toolkit in the Integrations catalog. */
export interface Integration {
  /** Composio's toolkit slug, e.g. `gmail`. */
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  /** Category names, e.g. ["Email", "Productivity"]. */
  categories: string[];
  /** How it can sign in, e.g. ["OAuth2", "API Key"]. */
  authMethods: string[];
  /** True when Composio runs the sign-in for you, so nothing to set up. */
  isManaged: boolean;
  /** True when no account is needed; it's simply switched on or off. */
  needsNoAccount: boolean;
  toolsCount: number;
  status: IntegrationStatus;
}

/** A category to filter the catalog by. */
export interface IntegrationCategory {
  slug: string;
  name: string;
  count: number;
}

/** The Integrations page. */
export interface IntegrationsCatalog {
  /** False when this Binary has no Composio API key. */
  available: boolean;
  integrations: Integration[];
  categories: IntegrationCategory[];
  /** Set when Composio couldn't be reached. */
  error: string | null;
}

/** One connected account behind an integration. */
export interface IntegrationAccount {
  id: string;
  /** Composio's status, e.g. ACTIVE, INITIATED, EXPIRED. */
  status: string;
  /** ISO date. */
  createdAt: string | null;
}

/** Everything the Manage panel shows for one integration. */
export interface IntegrationDetail {
  integration: Integration;
  accounts: IntegrationAccount[];
  /** The tools Binary offers from it, with their risk. */
  tools: ToolSummary[];
}

/** Composio's auth scheme codes, as people read them. */
const AUTH_LABELS: Record<string, string> = {
  OAUTH2: 'OAuth2',
  OAUTH1: 'OAuth1',
  API_KEY: 'API Key',
  BEARER_TOKEN: 'Bearer token',
  BASIC: 'Basic',
  BASIC_WITH_JWT: 'Basic + JWT',
  NO_AUTH: 'No Auth',
  S2S_OAUTH2: 'S2S OAuth2',
  DCR_OAUTH: 'DCR OAuth',
  SERVICE_ACCOUNT: 'Service account',
  GOOGLE_SERVICE_ACCOUNT: 'Service account',
};

/** "API_KEY" becomes "API Key"; unknown codes are tidied up. */
export function authMethodLabel(scheme: string): string {
  return (
    AUTH_LABELS[scheme] ??
    scheme
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/** Composio toolkit slugs: lowercase letters, digits and underscores. */
export const INTEGRATION_SLUG_PATTERN = /^[a-z0-9_]{1,64}$/;

/** Where to send someone after they connect a Composio account. */
export const composioConnectSchema = z.object({
  returnTo: z.enum(['web', 'phone']).default('web'),
});
