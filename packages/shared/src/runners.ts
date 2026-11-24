import {z} from 'zod';

/**
 * What a character thinks with: an API model (`api`, with your key), or a
 * coding CLI that the Runner runs on your computer, signed in as you.
 */
export const ENGINE_KINDS = ['api', 'claude_code', 'codex'] as const;
export type EngineKind = (typeof ENGINE_KINDS)[number];

export const ENGINE_INFO: Record<
  Exclude<EngineKind, 'api'>,
  {label: string; command: string; description: string}
> = {
  claude_code: {
    label: 'Claude Code',
    command: 'claude',
    description:
      'Runs Claude Code on your computer, in your first shared folder, signed in as you.',
  },
  codex: {
    label: 'Codex',
    command: 'codex',
    description:
      'Runs Codex on your computer, in your first shared folder, signed in as you.',
  },
};

export const RUNNER_NAME_MAX_LENGTH = 40;

/** Adds a computer: just a name you'll recognise. */
export const addRunnerSchema = z.object({
  name: z
    .string({error: 'Give this computer a name.'})
    .trim()
    .min(1, 'Give this computer a name.')
    .max(
      RUNNER_NAME_MAX_LENGTH,
      `Keep it under ${RUNNER_NAME_MAX_LENGTH} characters.`,
    ),
});

/** A paired (or pairing) computer, as Your computers shows it. */
export interface RunnerSummary {
  id: string;
  name: string;
  /** "macOS 27.0.0", once it has said hello. */
  os: string | null;
  /** The folders it shares, as it reported them. */
  folders: string[];
  status: 'pairing' | 'online' | 'offline' | 'paused';
  /** ISO dates. */
  lastSeenAt: string | null;
  createdAt: string;
}

/** After adding a computer: its one-time pairing code, shown once. */
export interface RunnerAdded {
  runner: RunnerSummary;
  code: string;
  /** When the code stops working (ISO date). */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// The Runner protocol. The Runner asks for work; the API never connects to
// it. Shared by the API and apps/runner.

/** Work for the Runner. Paths are checked on the Runner, against its folders. */
export type RunnerJob =
  | {type: 'list_files'; path: string}
  | {type: 'read_file'; path: string}
  | {type: 'write_file'; path: string; content: string}
  | {type: 'run_command'; command: string; cwd: string | null}
  | {
      type: 'engine';
      engine: Exclude<EngineKind, 'api'>;
      prompt: string;
      system: string;
      /** How much the CLI may do, from the character's approval mode. */
      permission: 'plan' | 'read_only' | 'edits';
    };

/** A job as the Runner receives it. */
export interface RunnerJobEnvelope {
  id: string;
  job: RunnerJob;
}

/** Something the Runner reports while an engine job runs. */
export type RunnerEvent =
  | {type: 'text'; text: string}
  | {
      type: 'tool-call';
      id: string;
      name: string;
      input: unknown;
      risk: 'read' | 'write' | 'computer';
    }
  | {type: 'tool-result'; id: string; output: unknown}
  | {type: 'tool-error'; id: string; error: string};

/** How a job ended. `error` is safe to show. */
export type RunnerResult =
  {ok: true; output: unknown} | {ok: false; error: string};

/** What the Runner tells the API when it starts. */
export interface RunnerHello {
  os: string;
  version: string;
  folders: string[];
}
