---
name: taste
description: The anti-slop taste skill, adapted for product UI. Use when writing UI copy (voice, labels, empty states, errors), choosing palettes/type with real judgment, or checking whether a page reads generic, templated or "AI-made". Carries the copy-tells database and the preset palette/type libraries, plus a color-science primer (merged from color-expert).
---

> Source: https://github.com/Leonxlnx/taste-skill (skills/taste-skill) — vendored & adapted 2026-11-18. MIT license (Leonxlnx).
>
> Adaptation notes: the upstream skill builds marketing/company websites with its own dealer
> scripts and a headless-Chrome gate; those do not exist here and local builds are forbidden
> in this repo (AGENTS.md rule 17). What survives is the judgment layer — one system, real
> content, a voice of its own, disciplined motion — retargeted to a product app. The
> upstream **color-expert** catalogue skill is merged here as §6 (color science primer).

# Taste — anti-slop judgment for Learning HUB

Build UI a good company would ship: it says plainly what a thing does, shows the real thing
(state, data, content), and looks made for **this** product — not from a template and not
like an art piece. Learning HUB is an Operate-surface app (see `impeccable`): familiarity is
a feature; taste here means *precise restraint*, not decoration.

## House rules (these win over everything else)

1. **One system.** One button pair, one card style, one radius scale, one link look, one
   spacing rhythm. Two boxes deep at most. If a second style appears, one of them is wrong.
2. **One section per screen, one idea per section.** No wall-of-prose panels before the
   first interactive element (the "Studio pages" defect in the UI/UX map).
3. **Real content, honestly labeled.** No invented numbers, fake users or placeholder latin.
   If data is missing, that is what `EmptyState` is for — an empty state that teaches, not a
   blank panel.
4. **Equal edges.** Everything on the shared container/grid lines; nothing drifting out to
   one side; no sideways page scroll at 360px.
5. **Copy is design.** Labels name their action; headings carry nouns; buttons are a verb and
   an object ("Save API Key", not "Continue"). No slop words (§5).
6. **Every visual renders.** No empty ground, no dead surface, at 360/768/1024/1440. A
   refused effect (reduced motion, e-ink) shows its still fallback instead of nothing.
7. **Motion answers the pointer, never the scrollbar.** Cards lift 2px, buttons press
   (scale 0.98), underlines draw. No tilt, no scroll-jacking, no fade-in on every section,
   no parallax on text. The hero/primary surface may enter once on load.
8. **Color is scarce.** Accent for primary actions, current selection and state indicators
   only — not decoration. One accent per surface; status colors are the exception and they
   are tokenized (see `ui-signature`).

## What "generic" looks like here (catch it before review does)

- Icon + heading + paragraph cards as the page's whole structure
- Purple/blue "AI gradient" aesthetics; glass and blur as decoration
- A 3-column "Learning Science Foundations" citation wall before any interactive element
- `title=` tooltips standing in for visible affordances; hover-only actions on touch
- Skeletons that never resolve, spinners mid-content, blank `return null` screens
- Copy that says "Elevate/Seamless/Unleash…" or explains the research instead of the task

## The run (adapted to this repo's constraints)

1. **Read the brief + the map section.** What is the page's one job? Who is stuck on it?
   Check `docs/ui-ux-map.md` for known defects on that route.
2. **Write the copy first.** Name the job, the one primary action, every empty/loading/error
   state. Facts only: the app's real features, real states, real numbers (marked as sample
   if sampled). No invented claims.
3. **Build from the kit.** `PageHeader` + `Panel` + `Button` + `TextField`/`SelectField` +
   `EmptyState` + `Toast`. Extend the kit when a pattern repeats twice (AGENTS.md §5).
   Tokens only — see `ui-signature` token law.
4. **Verify without a build** (rule 17): `npm run typecheck`, `npm run lint`, `npm test`,
   then re-read the page at 360px in code — every target ≥44px, every state rendered,
   contrast passes in light AND dark. The upstream browser gate is replaced by the
   `ui-signature` 12-point review checklist.

## §5 — The voice layer (copy rules)

Read `references/copy-voice.md` before writing UI copy at scale; `references/copy-tells.md`
is the database of model-copy tells. The distilled rules:

- **Facts, not synonyms.** Slop is a missing-fact problem; the fix is real content, never
  rewording. An empty field stays empty — its section shrinks or goes.
- **Every client gets its own voice** — here that means: the app speaks calm, specific,
  second-person ("Your review queue is empty", "We couldn't save your changes").
- **Devices used once.** A fragment-pair heading ("Short menu. Long list of regulars."), a
  dry joke, an em-dash aside — fine once on a page, a tell when repeated.
- **Sincerity is shown, not said:** cut actually, simply, carefully, honest when they are
  doing no work.
- **Errors name the problem and the recovery.** No "Oops!". No exclamation marks in success
  messages — be confident, not loud.
- **Sentence case** headings/buttons; numerals for counts; active voice; specific labels.

## §6 — Color science primer (merged from color-expert)

For palette and contrast decisions (full discipline: OKLCH/OKLAB perceptual spaces):

- **Judge contrast, not colors.** WCAG AA = 4.5:1 normal text, 3:1 large text (≥24px or
  ≥18.66px bold). Compute against the *actual* resolved background in both modes.
- **OKLab/OKLCH is the perceptual space** — this repo already derives its neutral ramp with
  `color-mix(in oklab, …)`. Mix in OKLab to keep ramps perceptually even; mixing in sRGB
  produces muddy midpoints.
- **Tint, don't gray.** Secondary text on tinted surfaces inherits the surface hue (this
  repo's ramp mixes `--tint` into every neutral). Pure gray on a tinted surface reads dirty.
- **Semantic roles over raw steps:** `--ac-strong` (action), `--ac-mid` (fills), `--ac-soft`
  (tints), `--ac-deep` (wells). Never reach for a raw hue when a role exists.
- **Desaturate before you add.** Accents below ~80% saturation blend with neutrals; the
  palette ramp exists so you never need a screaming hue.

## Library

| File | What it is |
|---|---|
| `library/palettes.json` | Curated palettes (id, role colors, mood) — reference for new palette work; the 6 shipped `data-theme` palettes always win |
| `library/type.json` | Curated font pairings/scales — reference only; this app ships the system-ui stack |
| `references/copy-voice.md` | The voice layer: fact sheet, voice card, page shape |
| `references/copy-tells.md` | What makes copy read as model-written, with fixes |

## Never

- A card, row or tile that fades in on scroll; parallax on text; scroll-jacking; random blinking
- Stock placeholders passed off as real data; invented reviews, quotes, users or figures
- A drawn look-alike of a real logo; emoji standing in for icons
- Copying a reference site's code, copy or signature effect
- Violet/lavender as the page's own accent (a real third-party logo keeps its own colors)
- Deleting or gaming a check to clear it — report what you did not verify
