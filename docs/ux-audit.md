# UX Audit — Learning HUB web app (2026-11-18, second pass)

> The Experience Designer's current-state audit. This is the follow-up to
> [`docs/ui-ux-map.md`](ui-ux-map.md) (the first full audit). That audit's P0 token
> work — mode-scoped `--text-*` tokens, accent aliasing, ghost-class cleanup, dead
> motion utilities, surface-variant policy — has **landed**; this pass verifies what
> remains, with fresh evidence.
>
> Method: full code read of the shell/kit/token layer + rendered verification
> (Next dev server, 1366×850 desktop and 360×740 phone, light + dark + e-ink
> token math) against the seeded database. Every claim cites `file:line` or a
> measured rendering result. Severity: **P0** blocks understanding or excludes
> users · **P1** recurring friction · **P2** polish.

## What the first pass already fixed (verified fixed today)

- Mode-scoped semantic text tokens (`--text-strong…faint`) with a WCAG lock test
  (`apps/web/tests/token-contrast.test.ts`).
- `text-indigo-300/400` aliasing to the mode-aware `--ac-text` (363 former failures).
- All 490 shadcn-style ghost utilities gone (design-laws test enforces zero).
- Dead animation classes replaced by real `animate-fade-in-up` / `animate-scale-in`
  utilities + motion tokens (`--duration-*`, `--ease-*`).
- `red-*` eliminated (danger = rose everywhere), `window.alert/confirm` at zero.
- Honest loading/error states on `/decks`, dashboard, and other core pages.
- `.panel-glass`/`.panel-interactive` retired; `Badge`/`Callout` migrated to status tokens.

## Findings

### P0-1 · Light mode still fails AA in ~460 spots outside the core pages

The token sprint taught the _semantic_ layer AA compliance, but the raw Tailwind
**status hues** were never aliased, so every unconditioned `text-emerald-500`,
`text-amber-500`, `text-rose-500`, `text-sky-500`, `text-violet-500`, `text-cyan-500`,
`text-teal-500`, `text-purple-500` — and `text-indigo-500` (aliased to `--ac-mid`,
which is a fill step, not a text step) — still resolves to a color that fails 4.5:1
on white. Measured against the calm palette, light mode:

| Utility (unconditioned uses)                      | Resolves to        | On white  | Verdict            |
| ------------------------------------------------- | ------------------ | --------- | ------------------ |
| `text-amber-500` (63)                             | #f59e0b            | ≈2.2:1    | fail               |
| `text-emerald-500` (53)                           | #10b981            | ≈2.5:1    | fail               |
| `text-indigo-500` (88)                            | `--ac-mid` #6d8f79 | ≈3.2:1    | fail (normal text) |
| `text-rose-500` (23)                              | #f43f5e            | ≈3.3:1    | fail               |
| `text-sky/violet/purple/teal/cyan-500` (43)       | raw steps          | 2.4–3.4:1 | fail               |
| `text-{emerald,amber,rose,sky,…}-300/400` (~130)  | raw steps          | 1.5–2.8:1 | fail               |
| `text-neutral-400/500`, `text-slate-400/500` (58) | `--n-400/500`      | 1.5–1.8:1 | fail               |

Dark mode passes for the same utilities (raw 300–500 steps were designed for dark
surfaces), which is why the default-dark app hides the bug. The fix is the same
mechanical alias the first pass used for indigo: map the text-critical steps of each
status hue onto the mode-aware `--status-*`/`--danger-*` tokens in `@theme`, and move
neutral/slate/indigo-500 _text_ usages to the `--text-*` tokens.

### P0-2 · No focus-visible standard

`globals.css` defines zero `focus-visible` rules (grep = 0). `.btn`, `.btn-ghost`,
`.btn-secondary` ship none, so every kit button and every raw button in the app gives
keyboard users either the browser default ring rendered on a `transition-colors`
surface or nothing. DESIGN.md §5.3 and ui-design-signature §4 specify the ring; only
`LeitnerBox` implements it. One global rule fixes every surface at once.

### P1-1 · `/decks` overflows horizontally at 360px (measured)

`document.scrollWidth` 650px vs 345px viewport — the only hard 360px-law violation
found. Cause: the header action row renders 6 buttons with `white-space: nowrap`
(decks/page.tsx `actions=`, "New card · Bulk paste · AI generate · Doctor ·
Interleave · Workload") inside a non-wrapping flex container. Same row is also the
app's worst "one primary action" violation.

### P1-2 · IA: the Learn group is a 47-item dump

`src/components/nav.ts:81-132` — 47 of 74 destinations sit in "Learn", including 30+
learning-science studios ("Generation", "Dual Coding", "Element Interactivity"…)
mixed with the daily core loop. The phone "More" sheet renders all 74 tiles in one
3-column grid (`AppShell.tsx:406-436`). New users cannot form a model of the app;
the scrollbar in the sidebar is permanent.

### P1-3 · One-primary-action violations on workhorse screens

- `/decks` header: 6 simultaneous actions (above).
- `/review` pre-session: mode chips + session size + retrieval criterion + speed
  drill + commute digest + workload links all compete before the single "Start
  session" (review/page.tsx ~1334-1427).

### P1-4 · Touch targets below the 44px law in the shell and core loop

- Phone top bar search/sync buttons `h-9 w-9` = 36px (AppShell.tsx:461,470);
  `NotificationBell` 36px.
- Review confidence toggles `px-2 py-1 text-xs` ≈ 28px (review/page.tsx ~1392).
- Dashboard widget reorder controls are hover-only (`hidden group-hover/widget:flex`,
  page.tsx:152-167) — invisible on touch, ~22px targets.
- No `IconButton` kit component; 56 hand-rolled icon buttons with drifting sizes.

### P1-5 · Blank screens while loading on ~7 pages

`return null` during data fetch: courses/course, mindmap, palace, analytics,
exam-sim (partial), review (pre-start), search. Contrast: dashboard/decks skeleton
patterns already exist and are the standard.

### P1-6 · Palette leaks in controls

- 29 raw `<input type="range">` render the browser default **blue** track/thumb
  (screenshot: Metacognitive Calibration HUD JOL slider) — breaks every palette.
  A `Slider` kit component exists and is unused by them.
- `Button` danger variant uses `hover:bg-rose-500` — white text on it is ≈3.3:1.

### P1-7 · Overlay family inconsistencies

Kit `Sheet` has focus in/out, scroll lock, Escape — but no **focus trap** (Tab can
escape into the background), and on desktop it plays the phone's slide-from-bottom
instead of the specified scale+fade. 15 hand-rolled `fixed inset-0 z-50` overlays
still coexist (decks ×3, review, palace, mindmap, backup…).

### P2-1 · Motion pass still pending (the map's §6 signature list)

Card reveal on `/review` is an instant boolean swap; Tabs swap active backgrounds
instantly; Toasts mount/unmount with no transition; `dismiss` target is ~26px;
stat tiles jump. All tokens/utilities needed are already defined — this is adoption.

### P2-2 · Micro-polish

- `/analytics` zero-data: Learning Score ring renders as a heavy solid black donut;
  mini "retention/focus/volume" bars are gray-on-gray.
- `/decks` empty card area is plain text, not `EmptyState`; deck-name input has no
  label (placeholder only).
- e-ink mode leaves `--status-*-text`/`--danger-*` colored (everything else goes B&W).
- Settings is a ~1,150px scroll wall (9 stacked panels; the `Tabs` kit is unused there).

## Fix plan (this branch)

| #   | Fix                                                                                                                              | Severity   |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Alias status-hue text steps to mode-aware tokens + migrate neutral/slate/indigo-500 text usages; extend the contrast lock test   | P0-1       |
| 2   | Global `focus-visible` ring rule in `globals.css`                                                                                | P0-2       |
| 3   | `IconButton` kit component; 44px sweep on shell/bell/confidence/reorder + always-visible reorder affordance                      | P1-4       |
| 4   | Decks header: one primary action + tools menu (new `Menu` kit primitive); kills the 360px overflow                               | P1-1, P1-3 |
| 5   | Nav IA: split "Practice studios" out of Learn (collapsed by default)                                                             | P1-2       |
| 6   | Skeleton loading states for the blank-screen pages                                                                               | P1-5       |
| 7   | Motion pass: toast enter/exit + 44px dismiss, Tabs sliding indicator, card-reveal fade-rise, Sheet desktop scale-in + focus trap | P1-7, P2-1 |
| 8   | e-ink status/danger tokens to black; danger hover token fix                                                                      | P2-2       |

Deferred (need cross-agent coordination or product decisions): merging duplicate
destinations (`/tutor` vs `/voice-tutor`, `/palace` vs `/palace-3d`, `/courses/exam`
vs `/exam-sim`), renaming studio labels to learner language, `/review` pre-session
information architecture, Settings tabs, Slider/HUD adoption sweep, modal consolidation.
