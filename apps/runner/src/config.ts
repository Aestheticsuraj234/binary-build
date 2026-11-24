import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';

/** What pairing saves: where the API is, and this Runner's token. */
export interface RunnerConfig {
  apiUrl: string;
  token: string;
  runnerId: string;
  name: string;
}

/** ~/.binary-runner, or BINARY_RUNNER_HOME (tests use a temp folder). */
function configDir(): string {
  return (
    process.env.BINARY_RUNNER_HOME ?? path.join(homedir(), '.binary-runner')
  );
}

export function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export async function loadConfig(): Promise<RunnerConfig | null> {
  try {
    return JSON.parse(await readFile(configPath(), 'utf8')) as RunnerConfig;
  } catch {
    return null;
  }
}

/** Saves the token where only you can read it. */
export async function saveConfig(config: RunnerConfig): Promise<void> {
  await mkdir(configDir(), {recursive: true, mode: 0o700});
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(configPath(), 0o600);
}
