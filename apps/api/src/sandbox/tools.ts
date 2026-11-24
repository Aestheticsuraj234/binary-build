import {SANDBOX_IDLE_MINUTES} from '@binary/shared';
import {z} from 'zod';

import type {BinaryTool} from '../tools/toolbox';
import {IMAGES_KEY} from './images';
import type {SandboxManager, SandboxOwner} from './manager';

/** The most text a tool hands back to the model from one run. */
const MAX_TEXT = 8000;
/** How long one shell command may run. */
const COMMAND_TIMEOUT_MS = 60_000;
/** Where files go by default (the sandbox user's home). */
const HOME = '/home/user';

function clip(text: string): string {
  return text.length > MAX_TEXT
    ? `${text.slice(0, MAX_TEXT)}\n… (${text.length - MAX_TEXT} more characters)`
    : text;
}

/** What read tools say before anything has run in this chat. */
const NOTHING_YET =
  "This chat's sandbox isn't running, so there are no files: nothing has " +
  `run yet, or it stopped after ${SANDBOX_IDLE_MINUTES} idle minutes and ` +
  'its files went with it.';

/**
 * The sandbox tools for one chat. Running code, running commands and
 * writing files are `computer` tools, so they always ask first; reading
 * and listing files are `read` and never start a sandbox.
 */
export function sandboxTools(
  manager: SandboxManager,
  owner: SandboxOwner,
): BinaryTool[] {
  const source = (tool: string) => ({kind: 'sandbox' as const, tool});
  return [
    {
      name: 'run_code',
      description:
        "Runs Python or JavaScript in this chat's cloud sandbox (a Jupyter " +
        'kernel: variables and files carry over between runs). Charts from ' +
        'matplotlib and similar are shown to the person. Returns stdout, ' +
        'stderr, the last value and any error.',
      risk: 'computer',
      source: source('run_code'),
      inputSchema: z.object({
        language: z
          .enum(['python', 'javascript'])
          .default('python')
          .describe('python (default) or javascript'),
        code: z.string().min(1).describe('The code to run.'),
      }),
      async run(input) {
        const {language, code} = input as {
          language?: 'python' | 'javascript';
          code: string;
        };
        const sandbox = await manager.ensure(owner);
        const run = await sandbox.runCode(code, language ?? 'python');
        return {
          stdout: clip(run.stdout),
          stderr: clip(run.stderr),
          result: run.result ? clip(run.result) : null,
          error: run.error ? clip(run.error) : null,
          [IMAGES_KEY]: run.images,
        };
      },
    },
    {
      name: 'run_command',
      description:
        "Runs a shell command in this chat's cloud sandbox (Linux, in " +
        `${HOME}). Use it to install packages or inspect files. Returns the ` +
        'exit code, stdout and stderr.',
      risk: 'computer',
      source: source('run_command'),
      inputSchema: z.object({
        command: z.string().min(1).describe('The shell command to run.'),
      }),
      async run(input) {
        const {command} = input as {command: string};
        const sandbox = await manager.ensure(owner);
        const run = await sandbox.runCommand(command, COMMAND_TIMEOUT_MS);
        return {
          exitCode: run.exitCode,
          stdout: clip(run.stdout),
          stderr: clip(run.stderr),
        };
      },
    },
    {
      name: 'write_file',
      description:
        "Writes a text file in this chat's cloud sandbox, replacing it if " +
        `it exists. Relative paths are inside ${HOME}.`,
      risk: 'computer',
      source: source('write_file'),
      inputSchema: z.object({
        path: z.string().min(1).describe('Where to write, e.g. data.csv'),
        content: z.string().describe('The whole file.'),
      }),
      async run(input) {
        const {path, content} = input as {path: string; content: string};
        const sandbox = await manager.ensure(owner);
        const full = path.startsWith('/') ? path : `${HOME}/${path}`;
        await sandbox.writeFile(full, content);
        return {written: full, characters: content.length};
      },
    },
    {
      name: 'read_file',
      description:
        "Reads a text file from this chat's cloud sandbox. Relative paths " +
        `are inside ${HOME}.`,
      risk: 'read',
      source: source('read_file'),
      inputSchema: z.object({
        path: z.string().min(1).describe('The file to read.'),
      }),
      async run(input) {
        const {path} = input as {path: string};
        const sandbox = await manager.existing(owner);
        if (!sandbox) {
          return {note: NOTHING_YET};
        }
        const full = path.startsWith('/') ? path : `${HOME}/${path}`;
        return {path: full, content: clip(await sandbox.readFile(full))};
      },
    },
    {
      name: 'list_files',
      description:
        "Lists files in a folder of this chat's cloud sandbox (default " +
        `${HOME}).`,
      risk: 'read',
      source: source('list_files'),
      inputSchema: z.object({
        path: z.string().optional().describe(`A folder; defaults to ${HOME}.`),
      }),
      async run(input) {
        const {path} = input as {path?: string};
        const sandbox = await manager.existing(owner);
        if (!sandbox) {
          return {note: NOTHING_YET};
        }
        const full = !path
          ? HOME
          : path.startsWith('/')
            ? path
            : `${HOME}/${path}`;
        return {path: full, entries: await sandbox.listFiles(full)};
      },
    },
  ];
}
