---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance (Vercel). Covers accessibility, focus states, forms, animation, typography, content handling, images, performance, navigation, touch, dark mode, locale, hydration. Use when auditing or reviewing a page/component for product-UI correctness. Includes a distilled Apple HIG section (merged from apple-hig).
metadata:
  author: vercel
  version: "1.0.0-vendored"
  argument-hint: <file-or-pattern>
---

> Source: https://github.com/vercel-labs/web-interface-guidelines (via open-design/skills/web-design-guidelines, pinned snapshot) — vendored & adapted 2026-11-18. MIT license (Vercel Labs).
>
> Adaptation notes: the upstream "fetch latest from URL" step is dropped (vendored snapshot is
> the only path; this repo is offline-first). The **apple-hig** catalogue skill from
> open-design is merged here as §Platform conventions.

# Web Interface Guidelines

Review files for compliance with the guidelines in
[`references/guidelines.md`](references/guidelines.md).

## How it works

1. Load the pinned guidelines from `references/guidelines.md` — this is the default,
   reproducible execution path.
2. Read the specified files (or ask which files/pattern to review).
3. Check against all rules in the guidelines.
4. Output findings in the terse `file:line` format (see the Output Format section of
   `references/guidelines.md`).

Repo-specific overrides (win over the generic guidelines):

- Buttons go through `<Button>` / `.btn`-classes with their loading state, not raw `<button>`
  strings (kit-first law).
- Untrusted content renders via `<Markdown>` only — never `dangerouslySetInnerHTML`.
- All network through `@/lib/transport` helpers — never raw `fetch`.
- Contrast must pass in **both** light and dark modes (see `ui-signature` token law).

## §Platform conventions (Apple HIG, merged from apple-hig)

The upstream apple-hig entry was a catalogue stub for the 14-skill Apple HIG bundle; its
usable essence for a web app like this one:

- **Clarity, deference, depth.** Content first; chrome recedes; hierarchy is communicated by
  weight/space, not boxes. (Deference is this repo's "calm by default".)
- **Consistency:** familiar, standard affordances — a control that looks like a button is a
  button; the same action always looks the same.
- **Direct manipulation with immediate feedback:** every touch has a visible, instant result;
  pressed states on `:active` at 0ms.
- **Perceived response limits:** feedback within ~100ms or show progress; nothing feels
  frozen.
- **Touch first:** ≥44×44pt targets (this repo's law), primary actions within thumb reach,
  bottom-weighted navigation on phones (this repo: the 4-tab bottom bar).
- **Depth without skeuomorphism:** subtle layering to communicate elevation (this repo's
  `--hub-panel` → `--hub-panel-2` layering; no heavy drop shadows).
- **Respect the user's setting:** reduced motion, dynamic type, system theme.
- **Forgiveness:** destructive actions get confirmation or undo — never immediate (Vercel WIG
  agrees: confirmation modal or undo window).
