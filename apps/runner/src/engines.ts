import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

import type {RunnerEvent, RunnerJob, RunnerResult} from '@binary/shared';

import {killTree, OWN_GROUP} from './process-tree';

type EngineJob = Extract<RunnerJob, {type: 'engine'}>;
type Risk = 'read' | 'write' | 'computer';

/** How long one CLI answer may take. */
const ENGINE_TIMEOUT_MS = 10 * 60 * 1000;

/** Claude Code tools that only look; the rest change things or run commands. */
const CLAUDE_READ_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'Task',
]);
const CLAUDE_COMMAND_TOOLS = new Set(['Bash', 'BashOutput', 'KillShell']);

function claudeRisk(name: string): Risk {
  if (CLAUDE_READ_TOOLS.has(name)) {
    return 'read';
  }
  return CLAUDE_COMMAND_TOOLS.has(name) ? 'computer' : 'write';
}

/**
 * Claude Code's flags for a permission. The CLI can't stop and ask Binary
 * mid-run, so it never runs shell commands; `read_only` can only look, and
 * `edits` may also change files in the shared folder.
 */
export function claudeArgs(job: EngineJob): string[] {
  const permission =
    job.permission === 'plan'
      ? ['--permission-mode', 'plan']
      : job.permission === 'edits'
        ? ['--permission-mode', 'acceptEdits', '--disallowedTools', 'Bash']
        : [
            '--permission-mode',
            'default',
            '--disallowedTools',
            'Bash',
            'Edit',
            'Write',
            'MultiEdit',
            'NotebookEdit',
          ];
  return [
    '-p',
    job.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    ...(job.system ? ['--append-system-prompt', job.system] : []),
    ...permission,
  ];
}

/**
 * Codex's flags. Codex reads by running commands, so its sandbox does the
 * limiting: `read-only` can't change anything, and `edits` may write in
 * the shared folder only, with no network.
 */
export function codexArgs(job: EngineJob, cwd: string): string[] {
  const sandbox = job.permission === 'edits' ? 'workspace-write' : 'read-only';
  const prompt = job.system
    ? `${job.system}\n\n---\n\n${job.prompt}`
    : job.prompt;
  return [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    sandbox,
    '--cd',
    cwd,
    '--',
    prompt,
  ];
}

/** Turns one line of Claude Code's stream-json into events. */
export function claudeEvents(line: Record<string, unknown>): RunnerEvent[] {
  const message = line.message as {content?: unknown} | undefined;
  const content = Array.isArray(message?.content)
    ? (message.content as Array<Record<string, unknown>>)
    : [];
  if (line.type === 'assistant') {
    return content.flatMap((part): RunnerEvent[] => {
      if (part.type === 'text' && typeof part.text === 'string') {
        return [{type: 'text', text: part.text}];
      }
      if (part.type === 'tool_use') {
        const name = String(part.name);
        return [
          {
            type: 'tool-call',
            id: String(part.id),
            name,
            input: part.input ?? {},
            risk: claudeRisk(name),
          },
        ];
      }
      return [];
    });
  }
  if (line.type === 'user') {
    return content.flatMap((part): RunnerEvent[] => {
      if (part.type !== 'tool_result') {
        return [];
      }
      const id = String(part.tool_use_id);
      const output =
        typeof part.content === 'string'
          ? part.content
          : Array.isArray(part.content)
            ? (part.content as Array<{text?: string}>)
                .map(piece => piece.text ?? '')
                .join('')
            : part.content;
      return part.is_error
        ? [{type: 'tool-error', id, error: String(output).slice(0, 2000)}]
        : [{type: 'tool-result', id, output}];
    });
  }
  return [];
}

/** Turns one line of `codex exec --json` into events. */
export function codexEvents(
  line: Record<string, unknown>,
  permission: EngineJob['permission'],
): RunnerEvent[] {
  const item = line.item as Record<string, unknown> | undefined;
  if (!item) {
    return [];
  }
  const id = String(item.id ?? '');
  if (item.type === 'agent_message' && line.type === 'item.completed') {
    return [{type: 'text', text: String(item.text ?? '')}];
  }
  if (item.type === 'command_execution') {
    if (line.type === 'item.started') {
      return [
        {
          type: 'tool-call',
          id,
          name: 'shell',
          input: {command: item.command},
          risk: permission === 'edits' ? 'computer' : 'read',
        },
      ];
    }
    if (line.type === 'item.completed') {
      return [
        {
          type: 'tool-result',
          id,
          output: {exitCode: item.exit_code, output: item.aggregated_output},
        },
      ];
    }
  }
  if (item.type === 'file_change' && line.type === 'item.completed') {
    return [
      {
        type: 'tool-call',
        id,
        name: 'edit',
        input: {changes: item.changes},
        risk: 'write',
      },
      {type: 'tool-result', id, output: 'Changed.'},
    ];
  }
  return [];
}

/** What command runs each CLI. Tests point these at a fake. */
function commandFor(engine: EngineJob['engine']): string {
  return engine === 'claude_code'
    ? (process.env.BINARY_CLAUDE_COMMAND ?? 'claude')
    : (process.env.BINARY_CODEX_COMMAND ?? 'codex');
}

/**
 * Runs Claude Code or Codex in the first shared folder, signed in as you,
 * streaming what it says and does as events. Resolves with its final
 * answer, or a reason it failed.
 */
export function runEngine(
  job: EngineJob,
  cwd: string,
  onEvent: (event: RunnerEvent) => void,
): Promise<RunnerResult> {
  const command = commandFor(job.engine);
  const args =
    job.engine === 'claude_code' ? claudeArgs(job) : codexArgs(job, cwd);
  const label = job.engine === 'claude_code' ? 'Claude Code' : 'Codex';

  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so a timeout stops everything it started.
      ...OWN_GROUP,
    });
    let finalText = '';
    let failure: string | undefined;
    let stderr = '';
    child.stderr.on('data', chunk => (stderr += String(chunk)));

    createInterface({input: child.stdout}).on('line', raw => {
      let line: Record<string, unknown>;
      try {
        line = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      if (job.engine === 'claude_code' && line.type === 'result') {
        if (line.is_error) {
          failure = String(line.result ?? `${label} stopped with an error.`);
        } else {
          finalText = String(line.result ?? '');
        }
        return;
      }
      if (
        job.engine === 'codex' &&
        (line.type === 'turn.failed' || line.type === 'error')
      ) {
        const error = line.error as {message?: string} | undefined;
        failure =
          error?.message ??
          String(line.message ?? `${label} stopped with an error.`);
        return;
      }
      const events =
        job.engine === 'claude_code'
          ? claudeEvents(line)
          : codexEvents(line, job.permission);
      for (const event of events) {
        if (event.type === 'text') {
          finalText = event.text;
        }
        onEvent(event);
      }
    });

    const timer = setTimeout(() => {
      killTree(child);
      failure = `${label} took longer than ten minutes, so it was stopped.`;
    }, ENGINE_TIMEOUT_MS);

    child.on('error', error => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error:
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? `${label} isn't installed on this computer (no \`${command}\` command). Install it and sign in, then try again.`
            : `${label} couldn't start: ${error.message}`,
      });
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) {
        resolve({ok: false, error: failure});
      } else if (code !== 0) {
        resolve({
          ok: false,
          error:
            `${label} stopped with exit code ${code}. ${stderr.trim().slice(-500)}`.trim(),
        });
      } else {
        resolve({ok: true, output: {text: finalText}});
      }
    });
  });
}
