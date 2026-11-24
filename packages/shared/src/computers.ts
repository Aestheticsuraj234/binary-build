import {z} from 'zod';

/**
 * The computer a character can work on. `cloud_sandbox` is a private
 * Linux machine from E2B, one per chat. Later chapters add more.
 */
export const COMPUTERS = ['none', 'cloud_sandbox'] as const;
export type Computer = (typeof COMPUTERS)[number];

export const computerSchema = z.enum(COMPUTERS, {
  error: 'Choose a computer for this character.',
});

/** How each computer is described when hiring or editing a character. */
export const COMPUTER_INFO: Record<
  Computer,
  {label: string; description: string}
> = {
  none: {
    label: 'None',
    description: 'No computer. It chats and uses your apps.',
  },
  cloud_sandbox: {
    label: 'Cloud sandbox',
    description:
      'A private Linux machine for each chat: runs Python, JavaScript and shell commands, works with files and draws charts. Every run asks you first.',
  },
};

/** How long a sandbox may sit idle before it stops (and its files go). */
export const SANDBOX_IDLE_MINUTES = 5;

/** What to tell people when sandboxes are off on this Binary. */
export const SANDBOX_SETUP_HINT =
  'Cloud sandboxes need an E2B key. Add E2B_API_KEY to .env (get one at e2b.dev/dashboard) and restart.';

/** A running sandbox, as the chat and Apps & tools show it. */
export interface SandboxSummary {
  id: string;
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
}

/** Apps & tools: whether sandboxes are on, and what's running. */
export interface SandboxesOverview {
  /** False without an E2B key: characters get no sandbox. */
  available: boolean;
  idleMinutes: number;
  sandboxes: SandboxSummary[];
}

/** An image a tool made for the person (a chart), served by the API. */
export interface ToolImage {
  id: string;
  mime: string;
}

/** Where to load a tool image from, relative to the API. */
export function toolImagePath(id: string): string {
  return `/api/images/${id}`;
}
