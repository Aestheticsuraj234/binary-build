import reactHooks from 'eslint-plugin-react-hooks';

import {baseConfig} from './base.js';

/**
 * ESLint rules for the Expo mobile app.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const expoConfig = [
  {ignores: ['.expo/**', 'expo-env.d.ts']},
  ...baseConfig,
  reactHooks.configs.flat.recommended,
  {
    // Expo Router requires every screen and layout to use a default export.
    files: ['src/app/**/*.tsx'],
    rules: {'no-restricted-exports': 'off'},
  },
];
