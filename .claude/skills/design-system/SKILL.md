---
name: design-system
description: Token architecture discipline — three-layer tokens (primitive → semantic → component), CSS variables, component state specs, Tailwind theme integration. Use when adding or refactoring design tokens, defining component states, or wiring Tailwind v4 @theme to runtime variables.
license: MIT
---

> Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (.claude/skills/design-system) — vendored & adapted 2026-11-18. MIT license (Next Level Builder).
>
> Adaptation notes: the upstream slide-generation system, its CSVs and its scripts are not
> vendored (irrelevant to this repo). The upstream **theme-factory** skill (an Anthropic
> skills-repo catalogue entry, itself a stub) is merged here as §5 "Preset theme application".
> This repo's token source of truth is `apps/web/app/globals.css` (`@theme inline` + `--hub-*`
> + `--n-*` + `--ac-*`); read `ui-signature` first — token law below explains the *why*.

# Design System — token architecture

## When to use

- Adding or renaming design tokens
- Defining component state coverage (hover/focus/active/disabled/loading/error)
- Wiring Tailwind theme configuration to runtime CSS variables
- Deciding where a value belongs: primitive vs semantic vs component layer

## Token architecture (three layers)

Load: `references/token-architecture.md`

```
Primitive (raw values)
       ↓
Semantic (purpose aliases)
       ↓
Component (component-specific)
```

**Example:**

```css
/* Primitive */
--color-blue-600: #2563EB;

/* Semantic */
--color-primary: var(--color-blue-600);

/* Component */
--button-bg: var(--color-primary);
```

**In this repo the layers are already fixed** — do not invent new ones:

| Layer | Where | Examples |
|---|---|---|
| Primitive ramps | `--n-50…--n-950` (OKLab `color-mix` from `--tint`), `--ac-{soft,mid,strong,deep}` | `globals.css:148-160` |
| Semantic surfaces | `--hub-{bg,panel,panel-2,sunken,border,border-strong}` per `data-theme` | `globals.css:62-145` |
| Tailwind aliases | `@theme inline` maps `neutral-*`, `slate-*`, `indigo-*`, `hub-*` to the CSS vars | `globals.css:13-59` |

New UI values extend one of these layers; they never bypass them with raw hex.

## Component spec pattern

Every interactive component documents its full state row before being called done:

| Property | Default | Hover | Active | Disabled | Loading | Error |
|----------|---------|-------|--------|----------|---------|-------|
| Background | primary | primary-dark | primary-darker | muted | muted + spinner | danger tint |
| Text | white | white | white | muted-fg | — | on-danger |
| Border | none | none | strong | muted | — | danger |
| Cursor | — | — | — | not-allowed | progress | — |

The repo's kit components delegate to `.btn`/`.btn-ghost`/`.input` in `globals.css`; when you
extend a component, extend those primitives so every call site inherits the fix (see
`ui-signature` §Component law).

## References

| Topic | File |
|-------|------|
| Token Architecture | `references/token-architecture.md` |
| Primitive Tokens | `references/primitive-tokens.md` |
| Semantic Tokens | `references/semantic-tokens.md` |
| Component Tokens | `references/component-tokens.md` |
| Component Specs | `references/component-specs.md` |
| States & Variants | `references/states-and-variants.md` |
| Tailwind Integration | `references/tailwind-integration.md` |

## Best practices

1. Never use raw hex in components — always reference tokens
2. Semantic layer enables theme switching (light/dark, and here: the 6 `data-theme` palettes)
3. Component tokens enable per-component customization
4. Use HSL/OKLab-capable formats for opacity control
5. Document every token's purpose
6. **Component specs and Tailwind integration win arguments about "just add a class"**: if a state is missing from the spec, the component isn't done

## §5 — Preset theme application (merged from theme-factory)

When applying a preset or user theme (here: the six `data-theme` palettes — calm, forest,
ocean, sunset, blossom, midnight — plus e-ink):

- A theme is a **closed set of semantic variables**. Applying one means swapping variable
  values, never sprinkling new utility classes.
- Every theme swap must leave **no hardcoded-color survivors** — a `dark:bg-[#1a1a1f]` next to
  a palette swap is exactly the "grey ghost" defect this repo audits for.
- Theme application must not animate (`transition: none` during the flip) — see
  `ui-animation` for the theme-switch pattern already used by e-ink mode.
- Validate both modes plus at least two palettes after any token change; a palette-safe change
  uses `--hub-*`/`--n-*`/`--ac-*`, never palette-specific literals.
