import type {
  CodeRun,
  SandboxHandle,
  SandboxProvider,
} from '../src/sandbox/provider';

/** A 1×1 PNG, base64: the "chart" fake code draws. */
export const FAKE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface FakeMachine {
  files: Map<string, string>;
  alive: boolean;
  runs: string[];
}

/**
 * Sandboxes in memory, for tests. Code that mentions `plot` draws a chart;
 * anything else prints what it ran. Files persist per sandbox.
 */
export class FakeSandboxProvider implements SandboxProvider {
  readonly name = 'e2b';
  readonly machines = new Map<string, FakeMachine>();
  created = 0;
  killed: string[] = [];
  /** Makes `create` slow, so two runs can race. */
  createDelayMs = 0;

  reset() {
    this.machines.clear();
    this.created = 0;
    this.killed = [];
    this.createDelayMs = 0;
  }

  /** Every code run, in every sandbox. */
  get runs(): string[] {
    return [...this.machines.values()].flatMap(machine => machine.runs);
  }

  private handle(id: string, machine: FakeMachine): SandboxHandle {
    return {
      id,
      keepAlive: async () => {},
      async runCode(code): Promise<CodeRun> {
        machine.runs.push(code);
        return {
          stdout: `ran ${code.length} characters\n`,
          stderr: '',
          result: null,
          error: null,
          images: code.includes('plot')
            ? [{mime: 'image/png', data: FAKE_PNG}]
            : [],
        };
      },
      async runCommand(command) {
        machine.runs.push(command);
        return {exitCode: 0, stdout: `$ ${command}\n`, stderr: ''};
      },
      async writeFile(path, content) {
        machine.files.set(path, content);
      },
      async readFile(path) {
        const content = machine.files.get(path);
        if (content === undefined) {
          throw new Error(`No such file: ${path}`);
        }
        return content;
      },
      async listFiles(path) {
        return [...machine.files.keys()]
          .filter(file => file.startsWith(`${path}/`))
          .map(file => ({
            name: file.slice(path.length + 1),
            type: 'file' as const,
          }));
      },
    };
  }

  async create(): Promise<SandboxHandle> {
    if (this.createDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.createDelayMs));
    }
    this.created++;
    const id = `sbx_${this.created}`;
    const machine = {files: new Map<string, string>(), alive: true, runs: []};
    this.machines.set(id, machine);
    return this.handle(id, machine);
  }

  async connect(id: string): Promise<SandboxHandle | null> {
    const machine = this.machines.get(id);
    return machine?.alive ? this.handle(id, machine) : null;
  }

  async kill(id: string): Promise<void> {
    this.killed.push(id);
    const machine = this.machines.get(id);
    if (machine) {
      machine.alive = false;
    }
  }
}
