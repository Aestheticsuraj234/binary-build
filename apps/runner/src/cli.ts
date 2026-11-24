// The Runner: lets Binary's characters work on this computer, only inside
// the folders you share. It asks Binary for work; nothing here listens.
//
//   pnpm runner pair K7QD-3MXP [--api http://localhost:3001]
//   pnpm runner start --folder ~/code/my-project [--folder …]
//   pnpm runner status
import {release, type} from 'node:os';
import {parseArgs} from 'node:util';

import type {RunnerEvent} from '@binary/shared';

import {ApiClient, NotPairedError} from './client';
import {configPath, loadConfig, saveConfig} from './config';
import {describeJob, runJob} from './jobs';
import {SharedFolders} from './paths';

const VERSION = '0.1.0';
const DEFAULT_API = process.env.BINARY_API_URL ?? 'http://localhost:3001';
/** Where you ran `pnpm runner` from (pnpm moves into apps/runner). */
const CALLED_FROM = process.env.INIT_CWD ?? process.cwd();

function osName(): string {
  const names: Record<string, string> = {
    Darwin: 'macOS',
    Linux: 'Linux',
    Windows_NT: 'Windows',
  };
  // Darwin's kernel version isn't macOS's, but it's close enough to tell.
  return `${names[type()] ?? type()} ${release()}`;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function pair(code: string | undefined, apiUrl: string) {
  if (!code) {
    throw new Error(
      'Usage: pnpm runner pair <code> (the code from Your computers).',
    );
  }
  const paired = await new ApiClient(apiUrl).pair(code);
  await saveConfig({apiUrl, ...paired});
  console.log(
    `✓ Paired as "${paired.name}". Your token is saved in ${configPath()}.`,
  );
  console.log('  Next: pnpm runner start --folder <a folder to share>');
}

async function start(folderArgs: string[]) {
  const config = await loadConfig();
  if (!config) {
    throw new Error(
      'Pair first: pnpm runner pair <code> (from Your computers).',
    );
  }
  const folders = await SharedFolders.open(folderArgs, CALLED_FROM);
  const client = new ApiClient(config.apiUrl, config.token);
  const hello = await client.hello({
    os: osName(),
    version: VERSION,
    folders: folders.folders,
  });
  console.log(`✓ ${hello.name} is online at ${config.apiUrl}`);
  console.log('  Sharing only:');
  for (const folder of folders.folders) {
    console.log(`    ${folder}`);
  }
  console.log(
    '  Commands you approve run as you, starting in these folders. Ctrl+C stops.',
  );

  let wasPaused = false;
  let failures = 0;
  while (true) {
    let next: Awaited<ReturnType<ApiClient['next']>>;
    try {
      next = await client.next();
      failures = 0;
    } catch (error) {
      if (error instanceof NotPairedError) {
        throw error;
      }
      failures++;
      const wait = Math.min(30_000, 1000 * 2 ** failures);
      console.log(
        `… can't reach Binary (${error instanceof Error ? error.message : error}); trying again in ${wait / 1000}s`,
      );
      await sleep(wait);
      continue;
    }
    if (next.paused) {
      if (!wasPaused) {
        console.log('⏸ Paused on Your computers. Waiting until it is resumed…');
      }
      wasPaused = true;
      await sleep(5000);
      continue;
    }
    if (wasPaused) {
      console.log('▶ Resumed.');
      wasPaused = false;
    }
    if (!next.job) {
      continue;
    }
    const {id, job} = next.job;
    console.log(`→ ${describeJob(job)}`);

    // Events go out in small batches, so the chat updates as it happens.
    let batch: RunnerEvent[] = [];
    let sending = Promise.resolve();
    const flush = () => {
      if (batch.length === 0) {
        return sending;
      }
      const events = batch;
      batch = [];
      sending = sending.then(() =>
        client.events(id, events).then(
          () => undefined,
          () => undefined,
        ),
      );
      return sending;
    };
    const ticker = setInterval(() => void flush(), 250);
    const result = await runJob(job, folders, {
      onEvent: event => batch.push(event),
    });
    clearInterval(ticker);
    await flush();
    await client.result(id, result).catch(() => {});
    console.log(result.ok ? '  ✓ done' : `  ✗ ${result.error}`);
  }
}

async function main() {
  const {positionals, values} = parseArgs({
    allowPositionals: true,
    options: {
      folder: {type: 'string', multiple: true, short: 'f'},
      api: {type: 'string'},
    },
  });
  const [command, ...rest] = positionals;
  switch (command) {
    case 'pair':
      await pair(rest[0], values.api ?? DEFAULT_API);
      break;
    case 'start':
      await start(values.folder ?? []);
      break;
    case 'status': {
      const config = await loadConfig();
      console.log(
        config
          ? `Paired as "${config.name}" with ${config.apiUrl}.`
          : 'Not paired yet: pnpm runner pair <code>',
      );
      break;
    }
    default:
      console.log(
        [
          'Binary Runner: lets your characters work in folders you share.',
          '',
          '  pnpm runner pair <code> [--api http://localhost:3001]',
          '  pnpm runner start --folder <folder> [--folder <another>]',
          '  pnpm runner status',
        ].join('\n'),
      );
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
