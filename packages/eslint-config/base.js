import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint rules for every package.
 *
 * Follows the Google TypeScript Style Guide
 * (https://google.github.io/styleguide/tsguide.html). Prettier handles
 * formatting, so these rules only cover how code is written.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const baseConfig = [
  {ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Variables: const by default, let when reassigned, never var.
      'no-var': 'error',
      'prefer-const': 'error',
      // Always use === except for `== null`.
      eqeqeq: ['error', 'smart'],
      // Always use braces for if/for/while.
      curly: ['error', 'all'],
      // Only throw Error objects.
      'no-throw-literal': 'error',
      // Named exports only (default exports are allowed per file below).
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
          },
        },
      ],
      // No `any`; use `unknown` and narrow it.
      '@typescript-eslint/no-explicit-any': 'error',
      // `T[]` for simple types, `Array<A | B>` for complex ones.
      '@typescript-eslint/array-type': ['error', {default: 'array-simple'}],
      // Prefer interfaces over type aliases for object shapes.
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],
      // camelCase values, PascalCase types and React components,
      // CONSTANT_CASE for module-level constants.
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
        {selector: 'function', format: ['camelCase', 'PascalCase']},
        // PascalCase lets a component be passed in, as in `{icon: Icon}`.
        {
          selector: 'parameter',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {selector: 'import', format: ['camelCase', 'PascalCase']},
        {selector: 'typeLike', format: ['PascalCase']},
        {selector: 'enumMember', format: ['UPPER_CASE']},
        // Object keys often mirror outside formats (HTTP headers, env vars).
        {selector: ['objectLiteralProperty', 'typeProperty'], format: null},
      ],
    },
  },
  {
    // Config files are read by tools that expect a default export.
    files: ['**/*.config.{js,mjs,ts}'],
    rules: {'no-restricted-exports': 'off'},
  },
  // Must stay last: turns off rules that fight with Prettier.
  prettier,
];
