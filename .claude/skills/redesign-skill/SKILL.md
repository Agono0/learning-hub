---
name: redesign-skill
description: Upgrades existing websites and apps to premium quality. Audits current design, identifies generic AI patterns, and applies high-end design standards without breaking functionality. Use when a page or surface "works but looks generic" — audit first, then targeted upgrades in priority order.
---

> Source: https://github.com/Leonxlnx/taste-skill (open-design/skills/redesign-skill) — vendored & adapted 2026-11-18. MIT license (Leonxlnx).
>
> Adaptation notes: placeholder-photography advice (picsum stand-ins) and marketing-page
> techniques are removed — an Operate app shows real data or honest empty states, never
> stock photos. Repo law (`ui-signature`, AGENTS.md §5) overrides the upgrade techniques
> below where they conflict.

# Redesign Skill

When applied to an existing project, follow this sequence:

1. **Scan** — Read the codebase. Identify the framework, styling method, and current design
   patterns. (Here: Next.js client components, Tailwind v4 CSS-variable tokens, the `src/ui`
   kit.)
2. **Diagnose** — Run through the audit below. List every generic pattern, weak point, and
   missing state you find. Cross-check `docs/ui-ux-map.md` — most known defects are already
   catalogued there with `file:line` evidence.
3. **Fix** — Apply targeted upgrades working with the existing stack. Do not rewrite from
   scratch. Improve what's there.

## Design Audit

### Typography

- **Browser default fonts used without intent.** Here the system-ui stack IS the committed
  direction — the audit is about *scale and weight discipline*: 4-deep size drift
  (`text-[10px]` next to `text-2xl` on one screen) is the defect, not the font.
- **Headlines lack presence.** Tighten letter-spacing on large display text; reduce
  line-height; headlines should feel heavy and intentional.
- **Body text too wide.** Limit prose measure to ~65ch (`.prose-hub` already does; check
  hand-rolled prose).
- **Only Regular (400) and Bold (700).** Introduce Medium (500)/SemiBold (600) for subtler
  hierarchy.
- **Numbers in proportional font.** Use `font-variant-numeric: tabular-nums` for data-heavy
  interfaces (stats, streaks, intervals).
- **Orphaned words.** Fix with `text-wrap: balance` or `text-wrap: pretty` on headings.

### Color and Surfaces

- **Oversaturated accent colors.** Desaturate so accents blend with neutrals (this repo's
  palettes already do; raw purple/cyan/fuchsia utilities are the leak).
- **More than one accent color.** Pick one. Remove the rest. (This repo: one `--ac-*` family
  per palette + tokenized status colors.)
- **Mixing warm and cool grays.** One gray family — here the `--n-*` tinted ramp.
- **Purple/blue "AI gradient" aesthetic.** The most common AI design fingerprint. Neutral
  bases and a single, considered accent.
- **Generic `box-shadow`.** Tint shadows to the background hue, not pure black.
- **Inconsistent lighting direction.** Audit shadows for a single light source.
- **Random dark sections in a light page.** A single dark section breaking a light page
  reads like a copy-paste accident. Commit to a mode or use a shade of the same palette.
- **Hardcoded dark hexes surviving a palette switch.** (This repo's grey-ghost defect:
  `dark:bg-[#1a1a1f]` families.) Fix by moving to `--hub-*` variables.

### Layout

- **Everything centered and symmetrical.** Break symmetry with left-aligned headers where a
  page needs it — but in an Operate app, predictability beats novelty.
- **Three equal card columns as feature row.** The most generic AI layout. Prefer 2-column
  zig-zag, asymmetric grid, or masonry — when the content justifies it.
- **Using `height: 100vh` for full-screen sections.** Replace with `min-height: 100dvh`
  (mobile browser viewport bug).
- **No max-width container.** (Here the shell already caps at `max-w-5xl`; the defect is
  pages that override it inconsistently, e.g. `max-w-6xl` studio pages.)
- **Uniform border-radius on everything.** Vary slightly: tighter on inner elements, softer
  on containers (repo scale: `rounded-lg` / `xl` / `2xl`).
- **Missing whitespace.** Let the design breathe — but data tools may be dense; density is a
  choice, not an accident.
- **Buttons not bottom-aligned in card groups.** Pin CTAs to the bottom of each card.
- **Mathematical alignment that looks optically wrong.** Icons next to text often need 1-2px
  optical adjustments.

### Interactivity and States

- **No hover states on buttons.** Add background shift or slight scale.
- **No active/pressed feedback.** Add `scale(0.98)` or `translateY(1px)` on press.
- **Instant transitions with zero duration.** 150-300ms on interactive elements (repo motion
  tokens).
- **Missing focus ring.** Visible `:focus-visible` indicators — accessibility, not optional.
- **No loading states.** Skeleton loaders matching the layout shape, not mid-content spinners.
- **No empty states.** An empty dashboard showing nothing is a missed opportunity — a composed
  "getting started" view (repo `EmptyState`).
- **No error states.** Clear, inline error messages. **Never `window.alert()`** — this repo
  has Toast + Callout.
- **Dead links.** Link to real destinations or visually disable.
- **No indication of current page in navigation.** Style the active nav item differently.
- **Animations using `top`/`left`/`width`/`height`.** Switch to `transform` and `opacity`.

### Content

- **Generic names ("John Doe").** Use diverse, realistic content.
- **Fake round numbers (`99.99%`, `$100.00`).** Organic, messy data reads real.
- **AI copywriting cliches.** Never "Elevate", "Seamless", "Unleash", "Next-Gen",
  "Game-changer", "Delve". Write plain, specific language (see `taste` copy layer).
- **Exclamation marks in success messages.** Remove. Be confident, not loud.
- **"Oops!" error messages.** Be direct: "Connection failed. Please try again."
- **Passive voice.** "We couldn't save your changes", not "Mistakes were made."
- **Lorem Ipsum.** Never. Write real draft copy.

### Component Patterns

- **Generic card look (border + shadow + white bg).** Remove the border, or use only
  background color, or only spacing. Cards exist only when elevation communicates hierarchy.
- **Always one filled button + one ghost button.** Add text links or tertiary styles to
  reduce visual noise (repo: the Button hierarchy below).
- **Modals for everything.** Use inline editing, slide-over panels, or expandable sections
  instead of popups for simple actions.
- **Pill-shaped "New"/"Beta" badges everywhere.** Try square badges, flags, or plain text.

### Code Quality

- **Div soup.** Semantic HTML: `<nav>`, `<main>`, `<article>`, `<aside>`, `<section>`.
- **Hardcoded pixel widths.** Relative units for flexible layouts.
- **Missing alt text on images.** Describe content; `alt=""` only for decorative.
- **Arbitrary z-index (`9999`).** Establish a z-index scale in tokens.
- **Commented-out dead code.** Remove before shipping.
- **Missing meta tags.** Title, description, og:image where a surface is shareable.

## Fix Priority

Apply changes in this order for maximum visual impact with minimum risk:

1. **Token repair** — ghost classes, hardcoded hexes, broken mode contrast (here this is P0
   and mostly mechanical)
2. **Color palette cleanup** — remove clashing or oversaturated colors
3. **Hover and active states** — makes the interface feel alive
4. **Layout and spacing** — proper grid, consistent padding
5. **Replace generic components** — swap cliche patterns for kit components
6. **Add loading, empty, and error states** — makes it feel finished
7. **Polish typography scale and spacing** — the premium final touch

## Rules

- Work with the existing tech stack. Do not migrate frameworks or styling libraries.
- Do not break existing functionality. Re-run typecheck/lint/tests after every change (rule
  17: no builds locally).
- Before importing any new library, check `package.json` first.
- If the project uses Tailwind, check the version (v4 here — CSS-first `@theme`, no config
  file) before modifying configuration.
- Keep changes reviewable and focused. Small, targeted improvements over big rewrites.
