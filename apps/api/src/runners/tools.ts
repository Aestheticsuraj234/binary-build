import type {RunnerJob} from '@binary/shared';
import {z} from 'zod';

import type {BinaryTool} from '../tools/toolbox';
import type {RunnerAccess} from './access';

/** Which person and which of their Runners a chat's tools go to. */
export interface RunnerTarget {
  userId: string;
  runnerId: string;
}

/**
 * The "Your computer" tools. Reading files is `read`; writing files and
 * running commands are `computer`, so they ask first. Every path is checked
 * on your computer by the Runner, against the folders you shared, whatever
 * is asked here. Relative paths start in your first shared folder.
 */
export function runnerTools(
  access: RunnerAccess,
  {userId, runnerId}: RunnerTarget,
): BinaryTool[] {
  const source = (tool: string) => ({kind: 'runner' as const, tool, runnerId});
  const run = async (job: RunnerJob) => {
    const result = await access.run(userId, runnerId, job);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.output;
  };

  return [
    {
      name: 'computer_list_files',
      description:
        "Lists a folder on the person's computer, inside the folders they " +
        'shared. "." is the first shared folder.',
      risk: 'read',
      source: source('computer_list_files'),
      inputSchema: z.object({
        path: z
          .string()
          .default('.')
          .describe('A folder; "." for the first shared one.'),
      }),
      run: input =>
        run({type: 'list_files', path: (input as {path?: string}).path ?? '.'}),
    },
    {
      name: 'computer_read_file',
      description:
        "Reads a text file on the person's computer, inside the folders they shared.",
      risk: 'read',
      source: source('computer_read_file'),
      inputSchema: z.object({path: z.string().min(1)}),
      run: input =>
        run({type: 'read_file', path: (input as {path: string}).path}),
    },
    {
      name: 'computer_write_file',
      description:
        "Writes a text file on the person's computer, inside the folders " +
        'they shared, replacing it if it exists. Asks the person first.',
      risk: 'computer',
      source: source('computer_write_file'),
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
      run: input => {
        const {path, content} = input as {path: string; content: string};
        return run({type: 'write_file', path, content});
      },
    },
    {
      name: 'computer_run_command',
      description:
        "Runs a shell command on the person's computer, starting in a shared " +
        'folder. It runs as them, so keep it small and clear. Asks the person ' +
        'first. Returns the exit code, stdout and stderr.',
      risk: 'computer',
      source: source('computer_run_command'),
      inputSchema: z.object({
        command: z.string().min(1).max(2000),
        cwd: z
          .string()
          .optional()
          .describe(
            'Where to start, inside a shared folder (default: the first).',
          ),
      }),
      run: input => {
        const {command, cwd} = input as {command: string; cwd?: string};
        return run({type: 'run_command', command, cwd: cwd ?? null});
      },
    },
  ];
}
