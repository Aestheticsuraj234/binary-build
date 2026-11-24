import type {ChildProcess} from 'node:child_process';
import {spawn} from 'node:child_process';

/**
 * Spawn options that put a command in its own process group (on macOS and
 * Linux), so a timeout can stop everything it started, not just the shell.
 */
export const OWN_GROUP = {detached: process.platform !== 'win32'} as const;

/**
 * Stops a process and everything it started. Killing only the shell would
 * leave its children (a test runner, a dev server, `sleep`) running and
 * holding the output open.
 */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }
  try {
    // A negative pid is the whole process group.
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}
