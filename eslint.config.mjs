// One ESLint config for the five apps. Each app runs `eslint src` from its own
// folder and ESLint walks up to this file.
//
// The apps are installed separately (CI runs `npm ci` per app, never at the
// root), so the plugins are resolved from the app ESLint was started in, not
// from the root's node_modules. The backend has no JSX and does not install
// the React plugins; their rules simply do not load there.
//
// Correctness only: undefined names, unused bindings, hook rules. No style.

import { createRequire } from 'node:module';
import path from 'node:path';

const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const load = (name) => {
  const mod = appRequire(name);
  return mod?.default ?? mod;
};
const loadOptional = (name) => {
  try {
    return load(name);
  } catch {
    return null;
  }
};

const js = load('@eslint/js');
const tseslint = load('typescript-eslint');
const globals = load('globals');
const react = loadOptional('eslint-plugin-react');
const reactHooks = loadOptional('eslint-plugin-react-hooks');

const unusedVarsOptions = {
  args: 'none',
  caughtErrors: 'none',
  ignoreRestSiblings: true,
  varsIgnorePattern: '^(_|React$)',
};

const testFiles = ['**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs}', '**/__tests__/**', '**/test/**', '**/tests/**', '**/setupTests.*'];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/android/**',
      '**/ios/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '.claude/**',
    ],
  },

  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    // Existing comments disable rules this config does not run (exhaustive-deps,
    // style rules from older setups); reporting them would be noise.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // __APP_VERSION__ is injected by Vite's `define` at build time.
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', unusedVarsOptions],
      // Style, not bugs.
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-extra-boolean-cast': 'off',
    },
  },

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // TypeScript itself reports undefined names, and knows about types and
      // ambient declarations that no-undef cannot see.
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions],
    },
  },

  {
    files: testFiles,
    languageOptions: { globals: { ...globals.vitest } },
  },

  ...(react
    ? [{
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: { react },
        settings: { react: { version: 'detect' } },
        rules: {
          // Without these, a component used only in JSX reads as unused.
          'react/jsx-uses-vars': 'error',
          'react/jsx-no-undef': 'error',
        },
      }]
    : []),

  ...(reactHooks
    ? [{
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
          'react-hooks/rules-of-hooks': 'error',
          // Off: 48 findings in breeder alone, each a judgment call where adding
          // a dependency can start a render loop. Not a mechanical fix.
          'react-hooks/exhaustive-deps': 'off',
        },
      }]
    : []),
];
