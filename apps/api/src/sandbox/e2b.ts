import {Sandbox} from '@e2b/code-interpreter';

import type {
  CodeRun,
  CommandRun,
  SandboxHandle,
  SandboxProvider,
} from './provider';

/** "is not found" / 404: the sandbox has already stopped. */
function isGone(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : '';
  return /not ?found|404|not running|paused|expired/i.test(text);
}

/** A plain reason for an E2B failure. Never includes the key. */
export function e2bReason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|api key/i.test(text)) {
    return 'E2B refused the API key. Check E2B_API_KEY in .env.';
  }
  if (/rate|limit|quota|concurrent/i.test(text)) {
    return 'E2B is at its limit for your plan. Stop a sandbox or try again later.';
  }
  return "Couldn't reach E2B. Try again in a moment.";
}

function handleOf(sandbox: Sandbox): SandboxHandle {
  return {
    id: sandbox.sandboxId,
    async keepAlive(timeoutMs) {
      await sandbox.setTimeout(timeoutMs);
    },
    async runCode(code, language): Promise<CodeRun> {
      const execution = await sandbox.runCode(code, {
        language: language === 'javascript' ? 'js' : 'python',
        timeoutMs: 120_000,
      });
      const images = execution.results.flatMap(result =>
        result.png ? [{mime: 'image/png', data: result.png}] : [],
      );
      const text = execution.results
        .map(result => (result.png ? '' : (result.text ?? '')))
        .filter(Boolean)
        .join('\n');
      return {
        stdout: execution.logs.stdout.join(''),
        stderr: execution.logs.stderr.join(''),
        result: text || null,
        error: execution.error
          ? `${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`
          : null,
        images,
      };
    },
    async runCommand(command, timeoutMs): Promise<CommandRun> {
      try {
        const run = await sandbox.commands.run(command, {timeoutMs});
        return {exitCode: run.exitCode, stdout: run.stdout, stderr: run.stderr};
      } catch (error) {
        // A non-zero exit is an answer, not a failure.
        const exit = error as {
          exitCode?: number;
          stdout?: string;
          stderr?: string;
        };
        if (typeof exit.exitCode === 'number') {
          return {
            exitCode: exit.exitCode,
            stdout: exit.stdout ?? '',
            stderr: exit.stderr ?? '',
          };
        }
        throw error;
      }
    },
    async writeFile(path, content) {
      await sandbox.files.write(path, content);
    },
    async readFile(path) {
      return sandbox.files.read(path);
    },
    async listFiles(path) {
      const entries = await sandbox.files.list(path);
      return entries.map(entry => ({
        name: entry.name,
        type: entry.type === 'dir' ? ('dir' as const) : ('file' as const),
      }));
    },
  };
}

/**
 * Cloud sandboxes from E2B (e2b.dev). Each is a private Linux machine with
 * Python, Node and a Jupyter kernel, with internet access, that stops by
 * itself when it's idle.
 */
export class E2BProvider implements SandboxProvider {
  readonly name = 'e2b';

  constructor(private readonly apiKey: string) {}

  async create({
    timeoutMs,
    metadata,
  }: {
    timeoutMs: number;
    metadata: Record<string, string>;
  }): Promise<SandboxHandle> {
    const sandbox = await Sandbox.create({
      apiKey: this.apiKey,
      timeoutMs,
      metadata,
    });
    return handleOf(sandbox);
  }

  async connect(id: string): Promise<SandboxHandle | null> {
    try {
      return handleOf(await Sandbox.connect(id, {apiKey: this.apiKey}));
    } catch (error) {
      if (isGone(error)) {
        return null;
      }
      throw error;
    }
  }

  async kill(id: string): Promise<void> {
    try {
      await Sandbox.kill(id, {apiKey: this.apiKey});
    } catch (error) {
      if (!isGone(error)) {
        throw error;
      }
    }
  }
}
