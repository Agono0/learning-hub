---
name: ui-styling
description: Tailwind CSS v4 utility-first styling craft — @theme tokens, custom utilities, layers, responsive patterns, dark mode. Use when writing or refactoring Tailwind class strings, adding custom utilities, or structuring responsive behavior.
license: MIT
---

> Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (.claude/skills/ui-styling) — vendored & adapted 2026-11-18. MIT license (Next Level Builder).
>
> Adaptation notes: the upstream skill is shadcn/ui-centric. Learning HUB does **not** use
> shadcn — in fact the app's biggest visual defect (the ~490 "ghost classes" found in the
> UI/UX map) is shadcn-style tokens (`bg-card/40`, `text-muted-foreground`, `border-border/60`)
> that resolve to nothing in this Tailwind v4 `@theme`. Those references are deliberately not
> vendored. What remains is the stack-agnostic Tailwind craft, plus this repo's own rules.

# UI Styling — Tailwind v4 craft (repo-adapted)

## When to use

- Writing/refactoring Tailwind class strings in `apps/web`
- Adding custom utilities or `@theme` tokens in `app/globals.css`
- Responsive patterns (360px-first), dark-mode correctness, container queries
- Deciding "is this a utility, a `@apply` primitive, or a kit component?"

## This repo's styling law (read before any styling task)

1. **No Tailwind config file.** All tokens live in `app/globals.css` via `@theme inline` +
   CSS variables. To add a color/utility, extend the CSS-variable layers (`--hub-*`, `--n-*`,
   `--ac-*`) and alias in `@theme` — never hardcode a hex in a class string.
2. **The shadcn vocabulary is banned.** `bg-card`, `text-primary`, `text-foreground`,
   `text-muted-foreground`, `border-border`, `bg-secondary`, `bg-accent`, `bg-destructive`
   (and their `/opacity` variants) resolve to **nothing** here — Tailwind v4 generates no
   utility for an undefined `--color-*`, so the class silently no-ops. Replacements:

   | Banned (ghost) | Use instead |
   |---|---|
   | `bg-card`, `bg-card/40` | `bg-white dark:bg-(--hub-panel)` (or `.panel`) |
   | `text-foreground` | `text-neutral-900 dark:text-neutral-100` (or just inherit) |
   | `text-muted-foreground` | `text-neutral-600 dark:text-neutral-400` (mode-safe muted ramp; see ui-signature token law) |
   | `border-border/60`, `border-border` | `border-neutral-200 dark:border-(--hub-border)` |
   | `bg-secondary` | `bg-neutral-100 dark:bg-(--hub-panel-2)` |
   | `bg-accent` / `text-accent` | accent roles: `bg-indigo-600` (= `--ac-strong`) or `text-indigo-600 dark:text-indigo-300` |
   | `bg-destructive` / `text-destructive` | the single danger ramp (see ui-signature) |
   | `text-primary` | `text-indigo-600 dark:text-indigo-300` (accent-as-text) or plain text color |

3. **`@apply` lives in `globals.css` primitives** (`.panel`, `.btn`, `.btn-ghost`, `.input`,
   `.label`, `.prose-hub`). Pages use kit components or plain utilities; new `@apply` blocks
   only when the same string repeats across pages.
4. **Layers:** `@custom-variant dark` is defined on the `.dark` class; use `dark:` freely.
   Arbitrary dark hexes (`dark:bg-[#1a1a1f]` family) are banned — they defeat palette
   switching. Use `dark:bg-(--hub-panel)` style variable references instead.

## Tailwind references

| Topic | File |
|-------|------|
| Customization (`@theme`, custom utilities, layers, `@apply`) | `references/tailwind-customization.md` |
| Responsive design (breakpoints, container queries) | `references/tailwind-responsive.md` |
| Utilities reference (layout, spacing, typography, colors) | `references/tailwind-utilities.md` |

## Best practices (repo order)

1. **Kit-first**: `Button`, `TextField`, `Panel`, `Sheet`, `EmptyState` before raw classes
2. **Utility-first styling**: extract components (or `@apply` primitives) only for true repetition
3. **Mobile-first responsive**: start at 360px, layer `sm:`/`md:` variants; verify no horizontal page scroll
4. **Accessibility-first**: visible `focus-visible` rings, semantic HTML before ARIA
5. **Tokens over literals**: consistent spacing scale, palette-aware colors, documented type scale
6. **Dark/palette mode consistency**: every themed element resolves through variables in BOTH modes
7. **Performance**: avoid dynamic class-name construction; Tailwind purges statically
8. **Never `transition: all`** — list transition properties explicitly (see ui-animation)
