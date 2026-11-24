import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

import type {RunnerEvent} from '@binary/shared';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {claudeArgs, codexEvents} from '../src/engines';
import {runJob} from '../src/jobs';
import {SharedFolders} from '../src/paths';

let root: string;
let project: string;
let folders: SharedFolders;

beforeAll(async () => {
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-jobs-')));
  project = path.join(root, 'project');
  await mkdir(project);
  await writeFile(path.join(project, 'notes.md'), 'Ship the Runner');
  folders = await SharedFolders.open([project], root);
});

afterAll(async () => {
  await rm(root, {recursive: true, force: true});
});

describe('jobs', () => {
  it('lists, reads and writes inside the shared folder', async () => {
    expect(await runJob({type: 'list_files', path: '.'}, folders)).toEqual({
      ok: true,
      output: {path: project, entries: [{name: 'notes.md', type: 'file'}]},
    });
    expect(
      await runJob({type: 'read_file', path: 'notes.md'}, folders),
    ).toEqual({
      ok: true,
      output: {
        path: path.join(project, 'notes.md'),
        content: 'Ship the Runner',
      },
    });
    const written = await runJob(
      {type: 'write_file', path: 'todo.txt', content: 'one'},
      folders,
    );
    expect(written.ok).toBe(true);
    expect(await readFile(path.join(project, 'todo.txt'), 'utf8')).toBe('one');
  });

  it('runs a command in the shared folder, keeping the exit code', async () => {
    const result = await runJob(
      {type: 'run_command', command: 'cat notes.md; exit 3', cwd: null},
      folders,
    );
    expect(result).toEqual({
      ok: true,
      output: {
        cwd: project,
        exitCode: 3,
        stdout: 'Ship the Runner',
        stderr: '',
      },
    });
  });

  it('stops a command that runs too long, and everything it started', async () => {
    const started = Date.now();
    // Two processes, so the shell can't just become `sleep`: the child
    // must be stopped too, or the Runner waits for it.
    const result = await runJob(
      {type: 'run_command', command: 'sleep 5; echo never', cwd: null},
      folders,
      {commandTimeoutMs: 200},
    );
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.ok && (result.output as {stderr: string}).stderr).toContain(
      'Stopped after 0.2 seconds.',
    );
    expect(result.ok && (result.output as {stdout: string}).stdout).toBe('');
  });

  it('refuses paths and command folders outside, touching nothing', async () => {
    for (const job of [
      {type: 'read_file' as const, path: '../outside.txt'},
      {
        type: 'write_file' as const,
        path: '/tmp/binary-should-not-exist.txt',
        content: 'x',
      },
      {type: 'run_command' as const, command: 'touch made.txt', cwd: root},
    ]) {
      const result = await runJob(job, folders);
      expect(result.ok, JSON.stringify(job)).toBe(false);
      expect(!result.ok && result.error).toContain(
        'outside the folders you shared',
      );
    }
  });
});

describe('Claude Code', () => {
  /** A fake `claude` that prints stream-json and records its arguments. */
  async function fakeClaude(lines: object[]): Promise<string> {
    const script = path.join(
      root,
      `fake-claude-${Math.random().toString(36).slice(2)}.mjs`,
    );
    await writeFile(
      script,
      `#!/usr/bin/env node
import {writeFileSync} from 'node:fs';
writeFileSync(${JSON.stringify(path.join(root, 'args.json'))}, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}));
for (const line of ${JSON.stringify(lines)}) console.log(JSON.stringify(line));
`,
    );
    await chmod(script, 0o755);
    return script;
  }

  it('streams what it says and does, run in the shared folder', async () => {
    process.env.BINARY_CLAUDE_COMMAND = await fakeClaude([
      {type: 'system', subtype: 'init'},
      {
        type: 'assistant',
        message: {
          content: [
            {type: 'text', text: 'Let me look.'},
            {
              type: 'tool_use',
              id: 't1',
              name: 'Read',
              input: {file_path: 'notes.md'},
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              content: 'Ship the Runner',
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {content: [{type: 'text', text: 'It says: Ship the Runner.'}]},
      },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'It says: Ship the Runner.',
      },
    ]);
    const events: RunnerEvent[] = [];

    const result = await runJob(
      {
        type: 'engine',
        engine: 'claude_code',
        prompt: 'What do my notes say?',
        system: 'You are Bolt.',
        permission: 'read_only',
      },
      folders,
      {onEvent: event => events.push(event)},
    );

    expect(result).toEqual({
      ok: true,
      output: {text: 'It says: Ship the Runner.'},
    });
    expect(events).toEqual([
      {type: 'text', text: 'Let me look.'},
      {
        type: 'tool-call',
        id: 't1',
        name: 'Read',
        input: {file_path: 'notes.md'},
        risk: 'read',
      },
      {type: 'tool-result', id: 't1', output: 'Ship the Runner'},
      {type: 'text', text: 'It says: Ship the Runner.'},
    ]);
    const {args, cwd} = JSON.parse(
      await readFile(path.join(root, 'args.json'), 'utf8'),
    ) as {
      args: string[];
      cwd: string;
    };
    expect(await realpath(cwd)).toBe(project);
    expect(args).toEqual(
      expect.arrayContaining([
        '-p',
        'What do my notes say?',
        '--output-format',
        'stream-json',
      ]),
    );
    delete process.env.BINARY_CLAUDE_COMMAND;
  });

  it('maps approval modes to permissions, and never allows shell commands', () => {
    const job = {
      type: 'engine' as const,
      engine: 'claude_code' as const,
      prompt: 'Hi',
      system: '',
    };
    const plan = claudeArgs({...job, permission: 'plan'});
    expect(plan).toEqual(expect.arrayContaining(['--permission-mode', 'plan']));
    const readOnly = claudeArgs({...job, permission: 'read_only'});
    expect(readOnly).toEqual(
      expect.arrayContaining(['--disallowedTools', 'Bash', 'Edit', 'Write']),
    );
    const edits = claudeArgs({...job, permission: 'edits'});
    expect(edits).toEqual(
      expect.arrayContaining([
        '--permission-mode',
        'acceptEdits',
        '--disallowedTools',
        'Bash',
      ]),
    );
  });

  it("says so when the CLI isn't installed", async () => {
    process.env.BINARY_CLAUDE_COMMAND = path.join(root, 'no-such-claude');
    const result = await runJob(
      {
        type: 'engine',
        engine: 'claude_code',
        prompt: 'Hi',
        system: '',
        permission: 'plan',
      },
      folders,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining(
        "Claude Code isn't installed on this computer",
      ) as string,
    });
    delete process.env.BINARY_CLAUDE_COMMAND;
  });
});

describe('Codex', () => {
  it('turns its JSON events into text and tool cards', () => {
    expect(
      codexEvents(
        {
          type: 'item.started',
          item: {id: 'c1', type: 'command_execution', command: 'ls'},
        },
        'read_only',
      ),
    ).toEqual([
      {
        type: 'tool-call',
        id: 'c1',
        name: 'shell',
        input: {command: 'ls'},
        risk: 'read',
      },
    ]);
    expect(
      codexEvents(
        {
          type: 'item.completed',
          item: {id: 'm1', type: 'agent_message', text: 'Done.'},
        },
        'read_only',
      ),
    ).toEqual([{type: 'text', text: 'Done.'}]);
  });
});
