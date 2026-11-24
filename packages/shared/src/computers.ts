import {z} from 'zod';

/**
 * The computers a character can work on. It can have none, one or both:
 *
 * - `cloud_sandbox`: a private Linux machine from E2B, one per chat.
 * - `browser`: a headless Chromium on this machine, one per chat.
 */
export const COMPUTER_KINDS = ['cloud_sandbox', 'browser'] as const;
export type ComputerKind = (typeof COMPUTER_KINDS)[number];

/** A character's computers: each kind at most once, in a fixed order. */
export const computersSchema = z
  .array(z.enum(COMPUTER_KINDS, {error: 'Choose a computer from the list.'}))
  .transform(kinds => COMPUTER_KINDS.filter(kind => kinds.includes(kind)));

/** How each computer is described when hiring or editing a character. */
export const COMPUTER_INFO: Record<
  ComputerKind,
  {label: string; description: string}
> = {
  cloud_sandbox: {
    label: 'Cloud sandbox',
    description:
      'A private Linux machine for each chat: runs Python, JavaScript and shell commands, works with files and draws charts. Every run asks you first.',
  },
  browser: {
    label: 'Browser',
    description:
      'A browser for each chat: opens and reads public web pages on its own, and asks before clicking or typing. You see a screenshot of every step.',
  },
};

/** How long a sandbox may sit idle before it stops (and its files go). */
export const SANDBOX_IDLE_MINUTES = 5;
/** How long a browser may sit idle before it closes. */
export const BROWSER_IDLE_MINUTES = 10;
/** How many browsers may be open at once on this Binary. */
export const BROWSER_MAX_OPEN = 5;

/** What to tell people when sandboxes are off on this Binary. */
export const SANDBOX_SETUP_HINT =
  'Cloud sandboxes need an E2B key. Add E2B_API_KEY to .env (get one at e2b.dev/dashboard) and restart.';

/** What to tell people when there's no Chromium on this Binary. */
export const BROWSER_SETUP_HINT =
  'Browsers need Chromium. Run `pnpm browsers:install` and restart the API.';

/** A running computer (a sandbox or a browser), for the chat and Apps & tools. */
export interface ComputerSummary {
  id: string;
  kind: ComputerKind;
  threadId: string;
  threadTitle: string | null;
  agentName: string;
  /** The character that plays the agent (a `CharacterId`). */
  avatar: string;
  /** ISO dates. */
  startedAt: string;
  lastUsedAt: string;
  /** When it stops by itself unless it's used again. */
  expiresAt: string;
  /** A browser's current page, if it has one. */
  url: string | null;
}

/** Whether each kind is on, and every computer that's running. */
export interface ComputersOverview {
  sandbox: {available: boolean; idleMinutes: number};
  browser: {available: boolean; idleMinutes: number; maxOpen: number};
  computers: ComputerSummary[];
}

/** An image a tool made for the person (a chart or a screenshot). */
export interface ToolImage {
  id: string;
  mime: string;
}

/** Where to load a tool image from, relative to the API. */
export function toolImagePath(id: string): string {
  return `/api/images/${id}`;
}
