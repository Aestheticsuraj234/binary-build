import {spawn} from 'node:child_process';
import {readdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

import type {RunnerEvent, RunnerJob, RunnerResult} from '@binary/shared';

import {runEngine} from './engines';
import type {SharedFolders} from './paths';
import {PathRefusedError} from './paths';

/** The most a file read returns, and the most a command's output keeps. */
const MAX_FILE_BYTES = 1_000_000;
const MAX_OUTPUT_CHARS = 64_000;
const MAX_ENTRIES = 500;
/** How long one command may run. */
export const COMMAND_TIMEOUT_MS = 120_000;

function capped(text: string): string {
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (${text.length - MAX_OUTPUT_CHARS} more characters)`
    : text;
}

/** Runs a shell command in `cwd`, as you, with a time limit. */
function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{exitCode: number; stdout: string; stderr: string}> {
  return new Promise(resolve => {
    const shell =
      process.platform === 'win32'
        ? {file: 'cmd.exe', args: ['/d', '/s', '/c', command]}
        : {file: '/bin/sh', args: ['-c', command]};
    const child = spawn(shell.file, shell.args, {cwd, env: process.env});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += String(chunk)));
    child.stderr.on('data', chunk => (stderr += String(chunk)));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += `\nStopped after ${timeoutMs / 1000} seconds.`;
    }, timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout: capped(stdout),
        stderr: capped(stderr),
      });
    });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({exitCode: -1, stdout: '', stderr: error.message});
    });
  });
}

/**
 * Does one job, here on your computer, inside the shared folders. Any path
 * outside them is refused before anything touches the disk. Never throws:
 * every outcome is a result with a reason that's safe to show.
 */
export async function runJob(
  job: RunnerJob,
  folders: SharedFolders,
  {
    onEvent = () => {},
    commandTimeoutMs = COMMAND_TIMEOUT_MS,
  }: {onEvent?: (event: RunnerEvent) => void; commandTimeoutMs?: number} = {},
): Promise<RunnerResult> {
  try {
    switch (job.type) {
      case 'list_files': {
        const dir = await folders.resolve(job.path);
        const entries = await readdir(dir, {withFileTypes: true});
        return {
          ok: true,
          output: {
            path: dir,
            entries: entries.slice(0, MAX_ENTRIES).map(entry => ({
              name: entry.name,
              type: entry.isDirectory() ? 'dir' : 'file',
            })),
            ...(entries.length > MAX_ENTRIES
              ? {more: entries.length - MAX_ENTRIES}
              : {}),
          },
        };
      }
      case 'read_file': {
        const file = await folders.resolve(job.path);
        const info = await stat(file);
        if (info.isDirectory()) {
          return {
            ok: false,
            error: `${job.path} is a folder. List it instead.`,
          };
        }
        if (info.size > MAX_FILE_BYTES) {
          return {
            ok: false,
            error: `${job.path} is too big to read (over 1 MB).`,
          };
        }
        const content = await readFile(file, 'utf8');
        if (content.includes('\0')) {
          return {ok: false, error: `${job.path} isn't a text file.`};
        }
        return {ok: true, output: {path: file, content}};
      }
      case 'write_file': {
        const file = await folders.resolve(job.path);
        await writeFile(file, job.content, 'utf8');
        return {
          ok: true,
          output: {written: file, characters: job.content.length},
        };
      }
      case 'run_command': {
        const cwd = await folders.resolve(job.cwd ?? '.');
        if (!(await stat(cwd)).isDirectory()) {
          return {ok: false, error: `${job.cwd} isn't a folder.`};
        }
        const run = await runCommand(job.command, cwd, commandTimeoutMs);
        return {ok: true, output: {cwd, ...run}};
      }
      case 'engine':
        return await runEngine(job, folders.home, onEvent);
    }
  } catch (error) {
    if (error instanceof PathRefusedError) {
      return {ok: false, error: error.message};
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return {ok: false, error: 'There is no such file or folder.'};
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return {ok: false, error: "This computer doesn't allow that."};
    }
    if (code === 'ENOTDIR') {
      return {ok: false, error: 'Part of that path is a file, not a folder.'};
    }
    return {
      ok: false,
      error: `It didn't work on this computer: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** For logs: "run_command: ls -la" or "read_file: notes.md". */
export function describeJob(job: RunnerJob): string {
  switch (job.type) {
    case 'run_command':
      return `run_command: ${job.command}`;
    case 'engine':
      return `${job.engine} (${job.permission})`;
    default:
      return `${job.type}: ${path.normalize(job.path)}`;
  }
}
