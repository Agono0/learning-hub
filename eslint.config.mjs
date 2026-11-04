// @ts-check
// ESLint 9 flat config. Deliberately minimal: typescript-eslint recommended with
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
)
