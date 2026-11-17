import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Auth tests share one database, so run test files one at a time.
    fileParallelism: false,
  },
});
