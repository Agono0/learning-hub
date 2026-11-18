---
name: impeccable
description: Use to design, redesign, critique, audit, polish or animate a frontend — app UI, dashboards, components, or a design system. Work as an award-winning design director would: production-grade code, a clear POV, exceptional craft. Carries the quality floor (contrast, states, browser surfaces) and the Operate-mode rules for product UI.
version: 4.9.2-vendored
license: Apache 2.0
---

> Source: https://github.com/naedna/impeccable (.claude/skills/impeccable, v4.9.2) — vendored & adapted 2026-11-18. Apache 2.0 license (NOTICE preserved upstream).
>
> Adaptation notes: upstream ships a self-contained launcher binary and ~40 reference
> playbooks that only exist in the impeccable repo. Those steps are replaced here by
> inlined essentials from its upstream `reference/craft-floor.md` and `reference/operate.md`
> (§Craft floor, §Operate mode — the files themselves are not present here). The command table below is an **intent menu** — read the named section here and do
> the work; there is no script to run. In this repo, `ui-signature` is the committed design
> world; impeccable operates *on top of* it, never against it.

This skill gives you the tools and permission to make design that earns the name
out-of-distribution craft. Work as an award-winning design director would: production-grade
code, a clear POV, a deep grasp of what the client and its users need, and exceptional craft.

Core principles:

- **Finish the job.** No hedging, no shortcuts: the deliverable is complete, except assets
  the user must provide.
- **Scale ambition to the surface's mode** (see Modes). Learning HUB surfaces are almost all
  **Operate** and **Read**: ambition shows as precision and restraint; patterns the user
  already knows earn their place.
- **Verify by looking at the rendered result at the sizes it ships at** — in this repo that
  means re-reading the code at 360px against the checklist, batching checks: fix what one
  look shows before looking again, rather than re-auditing after every tweak.

## Modes

The mode names what the visitor's success looks like on this surface.

- **Persuade:** the visitor decides and acts; design is the product. Landing pages,
  marketing, pricing. Earn attention and action.
- **Operate:** the visitor completes a task. App UI, dashboards, editors, settings, tools.
  Scanability, consistency, native expectations, and the real usage scene outrank
  expression. Brand lives in precise details. **← Learning HUB lives here.**
- **Read:** the visitor understands something. Docs, lesson theory, articles, help. Structure
  for comprehension, then make the reading experience worth staying in.
- **Experience:** the visitor is inside the work itself. Portfolios, galleries, 3D worlds.
  Let the artifact lead from the first viewport; the interface recedes. (This repo's
  `/palace-3d`, `/constellation`, `/world` lean here.)

Choose the mode from the requested surface, not the product. A tool's landing page is still
Persuade; a docs index is Read, not Persuade.

## How to design

- **The brief wins.** Honor pinned aesthetics, tokens and palettes even when they conflict
  with a saturated-pattern warning. In this repo the committed world is `ui-signature` +
  `globals.css` tokens; redirecting it toward your taste is failure.
- **Refinement preserves; redesign replaces.** Refinement keeps the incumbent identity,
  behavior, copy, and everything outside scope. Ask before replacing factual copy or adding
  claims. Redesign keeps product truth, content, function and constraints, but treats the
  old look as evidence and anti-reference. Never split the difference into polish on a
  discarded look.
- **Missing DESIGN.md alone does not make a project greenfield.** This repo HAS a design
  world — new work decides whether to preserve, expand, or replace it (replacements go
  through `ui-signature`, not ad-hoc).

## Command (intent) menu

| Intent | What it means | How to run it here |
|---|---|---|
| `shape` | Plan UX/UI before writing code | Write the screen plan: mode, one primary action, states, layout at 360px |
| `critique` | UX design review with heuristic scoring | Use the `ui-signature` 12-point gate + `web-design-guidelines` |
| `audit` | Technical quality checks (a11y, responsive) | Run the a11y/responsive sections of the craft floor below |
| `polish` | Final quality pass before shipping | §Craft floor "Verify" list, batched |
| `quieter` | Tone down overstimulating design | Reduce to one accent; remove glow/pulse/shimmer; check `.panel` vs glass sprawl |
| `distill` | Strip to essence, remove complexity | One primary action per screen; collapse secondary controls into overflow |
| `harden` | Production-ready: errors, edge cases | loading/error/empty states on every query; toasts on every mutation failure |
| `onboard` | First-run flows, empty states, activation | Honest `EmptyState`s that teach the next action; wizard step transitions |
| `animate` | Add purposeful motion | Load `emilkowalski-motion` / `ui-animation` / `gsap-*`; motion = state, never decoration |
| `typeset` | Improve typography hierarchy | Follow the type roles in `ui-signature` token law; kill 4-deep size drift |
| `layout` | Fix spacing, rhythm, hierarchy | Tight groups, generous separation; fix double-padding (shell pads already) |
| `clarify` | Improve UX copy, labels, errors | Load `taste` §voice layer; errors name problem + recovery |
| `adapt` | Adapt for devices/screen sizes | 360px-first sweep; `.scroll-x` for wide content; 44px targets |
| `optimize` | Diagnose UI performance | No layout reads in render; `transform`/`opacity` only; virtualize >50-item lists |

Routing: no argument → present this menu, never auto-run a command. Two commands fit → ask once.

## §Craft floor (inlined from upstream `reference/craft-floor.md`)

Load this after the direction is settled, and build without announcing the checklist. The
committed visual world (`ui-signature`) overrides anything here except a line marked as a
ban; your own habit does not.

### Verify

Each of these is a check on the built result, not an intention. Run them together in each
batched look, not as separate trips; the checks share one look.

- **Contrast:** body and placeholder text ≥4.5:1, large text ≥3:1 — **in light AND dark**.
  On colored surfaces tint secondary text from that hue or the foreground; never gray. (This
  repo's P0.)
- **Depth:** shadows carry an offset and a soft blur. A zero-offset colored halo is decoration.
- **Spacing:** tight groups, generous separation, more space above a heading than below it.
  Read the computed values; watch for shell + page double padding.
- **Type:** body measure 65–75ch for prose, obvious scale and weight steps, balanced headings.
  Run the real copy at every breakpoint and fix what overflows.
- **Motion:** one authored moment, not scattered effects and not one identical entrance on
  every section. Exponential ease-out from an already-visible default.
- **States:** hover, disabled, loading, error, empty. Plus real content, working controls,
  responsive composition, keyboard focus.
- **Browser surfaces:** the parts you did not draw still carry the design — text selection,
  the caret, scrollbars, focus rings, underline offset, tabular numerals. Theme them from the
  palette. This is the cheapest signal that a page was built rather than assembled.
- **Copy:** the product's own language. Controls name their action; errors name the problem
  and the recovery.
- **Coverage:** every requirement present and findable within seconds.

### Refuse (category defaults, not bans — the brief can earn any of them back)

- Same-size cards of icon + heading + text as the page structure; nested cards are always wrong
- The hero-metric template: big number, small label, supporting stats, accent (allowed where it
  is the committed `StatCard` pattern — do not multiply it)
- A kicker/eyebrow above a heading — **this one is a ban**; the heading carries its own weight
- Section numbers (01 / 02 / 03) unless the sequence carries information
- A modal for a task that needs neither interruption nor protected focus
- Gradient text; glass and blur as decoration rather than a specific effect
- A colored `border-left`/`border-right` above 1px on cards, list items, callouts, alerts
- Hard offset shadows (`box-shadow: 4px 4px 0`) outside a neobrutalist world
- Sparklines, progress rings, soft-shadowed rounded rectangles standing in for content
- Monospace as a costume for "technical" rather than for code, data, or measurement
- Unicode glyphs or emoji standing in for an icon system; icons are drawn, one stroke/weight
- Light or dark picked by category — pick from the use scene (here: default dark, honest light)

The floor holds the mechanics; it never picks the direction. When torn between refined and
committed, commit.

## §Operate mode depth (inlined from upstream `reference/operate.md`)

**The product slop test:** can a category-fluent user trust the interface immediately, or must
they pause at every subtly-off component? Product UI's failure mode isn't flatness, it's
strangeness without purpose: over-decorated buttons, mismatched form controls, gratuitous
motion, invented affordances for standard tasks. The bar is **earned familiarity** — the tool
disappears into the task.

**Typography:** one family is often right (this repo ships system-ui); fixed rem scale, not
fluid clamp; tighter scale ratio (1.125–1.2); prose 65–75ch, dense tables can run wider.

**Color:** product defaults to Restrained. State-rich semantic vocabulary standardized
(hover, focus, active, disabled, selected, loading, error, warning, success, info). Accent
for primary actions, current selection, and state indicators only. A second neutral layer for
sidebars/toolbars/panels (this repo: `--hub-panel` vs `--hub-panel-2` vs `--hub-sunken`).

**Components:** every interactive component has default, hover, focus, active, disabled,
loading, error. Skeletons for loading, not mid-content spinners. Empty states that teach the
interface. Consistent affordances across the surface — if the "save" button looks different
in two places, one is wrong. Overlays escape their container (portal/`position: fixed`).

**Motion:** 150–250ms on most transitions; users are in flow. Motion conveys state, not
decoration. No orchestrated page-load sequences — product loads into a task.

**Product constraints:** decorative motion that doesn't convey state; inconsistent component
vocabulary across screens; display fonts in UI labels; reinventing standard affordances;
full-saturation accents on inactive states; modal as first thought (exhaust inline /
progressive alternatives first).

**Product permissions:** system fonts; standard navigation patterns; density where users
need it; consistency over surprise — delight saved for moments, not pages.
