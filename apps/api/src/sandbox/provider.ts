/** An image a run made, base64-encoded (a chart). */
export interface MadeImage {
  mime: string;
  data: string;
}

/** What running code produced. */
export interface CodeRun {
  stdout: string;
  stderr: string;
  /** The last expression's value, as text, if it had one. */
  result: string | null;
  /** "NameError: x is not defined", plus the traceback. */
  error: string | null;
  images: MadeImage[];
}

export interface CommandRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
}

/** One live sandbox, connected. */
export interface SandboxHandle {
  readonly id: string;
  /** Keeps it up for `timeoutMs` more from now. */
  keepAlive(timeoutMs: number): Promise<void>;
  runCode(code: string, language: 'python' | 'javascript'): Promise<CodeRun>;
  runCommand(command: string, timeoutMs: number): Promise<CommandRun>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  listFiles(path: string): Promise<FileEntry[]>;
}

/**
 * Where sandboxes come from. E2B in real use; tests pass a fake, so they
 * never start a real machine.
 */
export interface SandboxProvider {
  readonly name: 'e2b';
  /** Starts a new sandbox that stops by itself after `timeoutMs` idle. */
  create(options: {
    timeoutMs: number;
    metadata: Record<string, string>;
  }): Promise<SandboxHandle>;
  /** Reconnects to a sandbox, or null if it has stopped. */
  connect(id: string): Promise<SandboxHandle | null>;
  /** Stops a sandbox. Already stopped is fine. */
  kill(id: string): Promise<void>;
}
