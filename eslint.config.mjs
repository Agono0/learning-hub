// @ts-check
// ESLint flat config. Deliberately minimal: typescript-eslint recommended with
// `no-explicit-any` as a warning — style is Prettier's job (see .prettierrc).
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Generated / vendored / private directories — never lint these.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.next-tauri/**',
      'apps/web/public/vendor/**',
      'apps/native/src-tauri/target/**',
      'apps/native/src-tauri/gen/**',
      'data/**',
      '.agents/**',
      '.zcode/**',
      'math-333/**',
      '.husky/_/**',
      'package-lock.json',
    ],
  },
  // TypeScript files: typescript-eslint recommended (syntax-level rules only —
  // no type-aware linting, which keeps lint fast and independent of the compiler).
  ...tseslint.configs.recommended,
  // Plain JS build/tooling scripts get the same parser.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.base],
  },
  {
    rules: {
      // `any` is tolerated in existing code; flag it so new code avoids it.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  // Code that also runs inside the native apps' webview worker must not
  // STATICALLY import Node-only modules: the Tauri build aliases them to stubs
  // (src/platform/shims), so they would compile and then fail on-device.
  // Use a dynamic import() behind a runtime check, or an injected port.
  {
    files: [
      'apps/web/src/server/handlers/**/*.ts',
      'apps/web/src/hub/**/*.ts',
      'apps/web/src/lib/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message:
                'Runs in the native webview — use a dynamic import() behind a runtime check (see docs/native.md).',
            },
            {
              group: ['fs', 'fs/*', 'path', 'os', 'child_process', 'better-sqlite3'],
              message:
                'Node-only module — not available in the native webview (see docs/native.md).',
            },
          ],
        },
      ],
    },
  },
  // AGENTS.md rule 1: No raw fetch in UI code.
  // Raw fetch silently breaks native apps — use apiGet/apiSend/apiUpload/apiStream/apiDownload from @/lib/transport.
  {
    files: [
      'apps/web/app/**/*.{ts,tsx}',
      'apps/web/src/components/**/*.{ts,tsx}',
      'apps/web/src/ui/**/*.{ts,tsx}',
      'apps/web/src/platform/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'Raw fetch in UI code breaks native apps — use apiGet/apiSend/apiUpload/apiStream/apiDownload from @/lib/transport (AGENTS.md rule 1).',
        },
      ],
    },
  },
)
