import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import {baseConfig} from './base.js';

/**
 * ESLint rules for the Next.js web app.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const nextConfig = [
  {ignores: ['.next/**', 'out/**', 'next-env.d.ts']},
  ...baseConfig,
  {
    languageOptions: {globals: {...globals.browser, ...globals.node}},
    plugins: {'@next/next': nextPlugin},
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  reactHooks.configs.flat.recommended,
  {
    // Next.js requires pages and layouts to use a default export.
    files: ['app/**/{page,layout,not-found,error,loading}.tsx'],
    rules: {'no-restricted-exports': 'off'},
  },
];
