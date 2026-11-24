import {defineConfig} from '@trigger.dev/sdk';

// The Trigger.dev project these tasks belong to. A project ref isn't a
// secret (the secret key stays in TRIGGER_SECRET_KEY). Running your own
// copy of Binary? Put your project's ref here (Project settings, proj_…).
export default defineConfig({
  project: 'proj_qygehoaltwwcuczcjfpm',
  runtime: 'node-24',
  logLevel: 'log',
  // The longest a task may run. Routine tasks set their own, shorter limit.
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ['./src/trigger'],
});
