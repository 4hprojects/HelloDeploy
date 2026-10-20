import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Correctness
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Security — no shell string interpolation
      'no-template-curly-in-string': 'warn',

      // Style
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
    },
  },
  {
    // Test files may use process.exit, console, etc.
    files: ['tests/**/*.js'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // CLI scripts intentionally print user-facing output.
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // The base ESLint preset does not associate JSX tag names with imports.
    files: [
      'tests/fixtures/multi-runtime/**/app/**/*.js',
      'tests/fixtures/multi-runtime/**/pages/**/*.js',
    ],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/out/**',
      'build/',
      'coverage/',
      'apps/web/public/assets-dist/',
    ],
  },
];
