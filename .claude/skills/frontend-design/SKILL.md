---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with strong visual direction, polished typography, considered layout, and working framework code. Use when building a new page or screen, designing a component from scratch, or giving an interface a designed (not assembled) quality.
license: Apache 2.0
---

> Source: https://github.com/anthropics/skills/tree/main/skills/frontend-design (via open-design/skills/frontend-design) — vendored & adapted 2026-11-18. Apache 2.0 license (Anthropic upstream).
>
> Adaptation notes: the OpenDesign integration block is replaced by this repo's design-world
> rule. Repo law always wins over generic craft guidance.

Use this skill when the task is to build or improve a frontend interface: a page, screen,
component, or a visual redesign of an existing UI.

The goal is not just "make it nicer." The goal is to ship working frontend code with a clear
design point of view, strong craft, and enough product detail that the result feels designed
for the user's actual context.

## Workflow

1. **Understand the brief before choosing the look.**
   - Identify the audience, primary job, domain, and emotional tone.
   - Note technical constraints: Next.js client components, existing tokens, accessibility,
     responsive requirements (360px-first).
   - The repo's design system is the source of truth: `apps/web/DESIGN.md`, the tokens in
     `app/globals.css`, the kit in `src/ui`, and above all `ui-signature`. Use those first;
     apply this skill's craft rules where the design system is silent.

2. **Commit to one specific aesthetic direction.**
   - For Learning HUB that direction is already committed: calm, research-backed, focused
     learning tool — warm tinted neutrals, one sage-family accent per palette, quiet depth.
   - Avoid generic AI defaults: purple-blue gradients, vague glass cards, interchangeable
     SaaS layouts, over-rounded cards, stock icon rows, decorative blobs that serve nothing.

3. **Design the real interface, not a placeholder poster.**
   - Include the controls, empty/loading/error states, tables, filters, navigation, and
     responsive behavior a real user would expect.
   - Use honest content. If data is unknown, label it as sample, pending, or unavailable
     instead of inventing claims.
   - Keep workflows efficient for the target user: tools should be scannable and dense enough
     for repeated use.

4. **Build production-grade frontend code.**
   - Prefer the repository's existing conventions: kit components, `@/lib/transport`,
     `nav.ts`, tokens — no new styling approaches.
   - Use semantic markup, keyboard-accessible controls, visible `focus-visible` states,
     AA contrast in both modes, and responsive layout that never scrolls the page
     horizontally at 360px.
   - Use CSS variables (the token layers) for repeated values — never raw hex in class strings.

5. **Refine visual craft.**
   - Typography: expressive but readable hierarchy on the shipped system-ui stack — scale and
     weight carry it, not font swaps.
   - Color: role clarity; accent used sparingly and deliberately (see `taste` §6).
   - Layout: alignment, rhythm, density, and negative space used intentionally; nothing drifts.
   - Motion: purposeful transitions for state changes, reveals, and feedback;
     `transform`/`opacity` only (see `ui-animation`).
   - Details: texture, borders, shadows, dividers, and iconography only when they support the
     concept.

6. **Self-review before final delivery.**
   - Works at mobile (360px) and desktop widths; no text overlap; nothing clipped.
   - Interactive elements have hover/focus/active/disabled (and loading where async) states.
   - The design avoids obvious AI-generated visual tropes (see `taste` house rules).
   - The result has one memorable quality a user could describe after closing the page — for
     this app that is the calm review loop, not decoration.
