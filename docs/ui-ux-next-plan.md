# UI/UX Modernization Plan — Learning HUB web

> The execution plan for the UI/UX effort. Driven by [docs/ui-ux-map.md](ui-ux-map.md)
> (P0/P1 evidence, `file:line`) and governed by [docs/ui-design-signature.md](ui-design-signature.md)
> (the design language) and its agent form `.claude/skills/ui-signature/SKILL.md`.
> Executor constraint reminder: **no local builds or dev servers ever** (AGENTS.md rule 17);
> verification is always `npm run typecheck`, `npm run lint`, `npm test`. Tests are never
> weakened (rule 13) — `apps/web/tests/hub-registry.test.ts`, `calm-sensory.test.ts`, and the
> manual-mode surface tests must stay green throughout.

**Ordering logic (highest-impact ~20% first):** Phase 1 is almost purely mechanical but
fixes the two systemic defects that make light mode unusable (unreadable muted text, 490
rendering-nothing classes) — biggest visual ROI per line changed. Phase 2 pays the kit debt
that makes the app inconsistent. Phase 3 fixes comprehension (IA, first look, touch). Phase 4
adds the crafted layer only once the floor is solid. Each phase ends on a green gate; do not
start the next phase on a red one.

Total shape: ~70-90 files touched across 4 phases, each phase landing as small atomic
Conventional Commits (`fix(ui/…)` / `refactor(ui/…)` / `feat(ui/…)`) so any single commit
can be reverted without entangling others.

---

## Phase 1 — Tokens & contrast (P0, mechanical)

**Goal:** every text token passes AA in light AND dark; the 490 ghost classes resolve;
one danger hue; motion tokens exist. Light mode becomes readable without touching a single
page layout.

### 1.1 Mode-aware text ramp — `apps/web/app/globals.css`

- Keep the `--n-*` OKLab ramp for surfaces. Add mode-scoped semantic text tokens on `:root`
  and `.dark`: `--text-strong / --text-body / --text-secondary / --text-tertiary /
--text-faint` (light: n-900/n-800/n-700/n-600/faint-safe; dark: n-100/n-200/n-300/n-400/n-500).
- Alias into `@theme inline` as `--color-text-*` so `text-strong`…`text-faint` utilities
  exist.
- Sweep unconditioned muted-text utilities: `text-neutral-400/500`, `text-slate-400/500` as
  TEXT → nearest `--text-*` token (surfaces keep `neutral-*`). Evidence anchors:
  `PageHeader.tsx:22`, `Feedback.tsx:20` (EmptyState), `Toast.tsx:119`, `.label`
  (globals.css:200), `app/page.tsx:101`, `app/review/page.tsx:1653`, EnergyBar
  `app/review/page.tsx:1570-1592`.
- Sweep 300/400-level status/accent text (`text-indigo-300/400` ×112,
  `text-{red,emerald,amber}-*` ×217): accent-as-text → a new mode-aware
  `--ac-text` token (light `--ac-strong`, dark `--ac-soft`) aliased as a utility; status
  text → `--status-*-text` tokens (dark 300/400 steps, light 600/700 steps).

### 1.2 Danger consolidation — rose, kill red

- Add `--danger-strong` (rose-600, both modes), `--danger-text` (rose-600 light /
  rose-400 dark), `--danger-soft`; alias the `red-*` Tailwind steps used in-app onto them in
  `@theme` so old call sites resolve correctly, then migrate call sites:
  `app/review/page.tsx:157` grade buttons, `AppShell.tsx`/`NotificationBell` dot, games,
  online pages. `Button.tsx:19` already rose — now backed by tokens.

### 1.3 Ghost classes → real tokens (~490 usages, ~15 files)

Define missing `--color-*` aliases in `@theme inline` **only where a true semantic exists**
(`text-primary` is NOT defined; call sites migrate instead), and migrate call sites:

- Top offenders: `src/components/DesirableDifficultyStudio.tsx` (93),
  `MetacognitionStudio.tsx` (67), `SelfExplanationStudio.tsx` (61), `DualCodingStudio.tsx`
  (48), plus 8 HUD files and the 9 studio pages' "foundations" cards
  (e.g. `app/metacognition/page.tsx:44-51`).
- Replacement table lives in `ui-signature` §3.4 / `.claude/skills/ui-styling/SKILL.md`.
- Mechanical rule: `bg-card*` → `.panel` or `bg-white dark:bg-(--hub-panel)`;
  `text-muted-foreground` → `text-tertiary`-class token; `border-border/60` →
  `border-neutral-200 dark:border-(--hub-border)`; `bg-destructive`/`text-destructive` →
  `--danger-*`; `text-primary` → `--ac-text` or plain text token.

### 1.4 Palette-leak repair

- `dark:bg-[#141418] #18181d #1a1a1f #1e1e23 #232329` families → `--hub-*` variables:
  `AppShell.tsx` (×11), `Toast.tsx` (×3), `Feedback.tsx` (Skeleton), `inputs.tsx:41`, 7 pages.
- Raw purple/cyan/fuchsia/pink/teal/orange/sky utilities (171 uses; `Badge` violet/cyan tones
  `Feedback.tsx:32-33`, `LeitnerBox` cyan, studios) → palette (`--ac-*`) or `--status-*`
  tokens. Badge tones become token-driven so palettes re-skin them.

### 1.5 Motion tokens + real utilities

- Add `--duration-fast/base/slow` + `--ease-enter/move/drawer/exit` to `globals.css`,
  alias into `@theme`.
- Dead classes: implement `animate-fade-in` (defined in globals as fade-in), add
  `animate-fade-in-up` and `animate-scale-in` utilities, then replace dead intent classes:
  `animate-in fade-in zoom-in-95` (`src/components/InterleavingSchedulerModal.tsx:181,377`),
  `animate-fadeIn` (`src/components/AdaptiveExamStudio.tsx:545,679`,
  `src/ui/SpatialLocusHUD.tsx:121`), bare `animate-fade-in` (`app/metacognition/page.tsx:21`
  - 5 pages).

### Acceptance criteria

1. **AA in light+dark for every text token** — add `apps/web/tests/token-contrast.test.ts`
   that parses `globals.css`, resolves the OKLab `color-mix` ramp per mode, and asserts
   ≥4.5:1 (body) / ≥3:1 (large ≥18.66px-bold) for `--text-*` and `--status-*-text` /
   `--danger-text` / `--ac-text` against their documented surfaces, in both modes. This test
   is the regression lock; it must fail loudly if someone reintroduces a failing step.
2. **Zero ghost classes** per the map's list — a grep test (or lint rule) over `apps/web`
   for the banned vocabulary (`bg-card`, `text-primary`, `text-foreground`,
   `text-muted-foreground`, `border-border`, `bg-secondary`, `bg-accent`,
   `text-accent-foreground`, `bg-destructive`, `text-destructive`, `bg-muted`, `ring-ring`)
   returns 0.
3. **One danger hue:** grep `bg-red-|text-red-|red-600` in `apps/web/app` + `src` returns
   only the token-aliased step (or 0 after migration).
4. **Zero dead animation classes:** grep `animate-fadeIn|animate-in fade-in|zoom-in-95` → 0;
   every `animate-*` class used is defined in `globals.css` or Tailwind core.
5. `npm run typecheck && npm run lint && npm test` green (hub-registry + calm-sensory +
   manual-mode untouched and passing).

**Scope guard — do NOT:** redesign any page layout; touch spacing/typography scale; replace
kit components; add new dependencies; rename routes; change `nav.ts`; touch anything under
`apps/` or `packages/` outside `apps/web/app` + `apps/web/src`; re-map the `--n-*` ramp
itself; "fix" contrast by darkening dark-mode text that already passes.

**Files (~30-35):** `globals.css`, `Button.tsx`, `Feedback.tsx`, `Toast.tsx`, `PageHeader.tsx`,
`inputs.tsx`, `AppShell.tsx`, 4 studio components + 8 HUDs + 9 studio pages, review/decks/
games/online pages, `LeitnerBox.tsx`, new `token-contrast.test.ts`.

**Rollback:** every sub-step is an isolated commit (`fix(ui/tokens): …`); the ghost-class
sweep is a mechanical 1:1 class replacement, so `git revert` of any commit restores the
prior class strings with no schema/data impact (UI-only change; no migrations).

---

## Phase 2 — Kit consolidation (P1)

**Goal:** the workhorse pages use the kit; no page renders a blank screen; no native
`alert/confirm`; one stat tile API.

### 2.1 Raw `.btn` → `<Button>` in the top offenders only

- `app/decks/page.tsx` (28 raw), `app/reading/page.tsx` (23), `app/focus/page.tsx` (18),
  `app/review/page.tsx` (16) — the 4 pages carrying most raw-button debt. Each raw button
  maps to `variant="primary"` (one per screen-state) / `"ghost"` / `"danger"` and gains
  `loading`/`aria-busy` where it triggers async work.
- While in each page: raw `<select>` → `SelectField`, raw checkbox → `Toggle` (add the
  `Toggle` kit component first — 17 raw checkboxes repo-wide justify it), raw range → new
  `Slider` kit component (29 raw justify it).
- Do NOT codemod all 232 raw buttons repo-wide in this phase — the long tail rides later
  PRs; this phase targets the top offenders and stops new debt (checklist item 9).

### 2.2 `Stat`/`StatCard` merge — `src/ui/Feedback.tsx`, `src/ui/StatCard.tsx`

- One tile API: `StatCard` absorbs `Stat`'s compact use cases (trend/progress/accent
  already there). `Stat` call sites migrate; `Stat` is deleted. Replace StatCard's
  `div role="button"` (`StatCard.tsx:74-93`) with a real `<button>` or drop the onClick
  affordance — clickable divs fail the gate (item 12 / web-guidelines).
- Collapse `.panel-glass`/`.panel-interactive` (globals.css:441-455) into
  `.panel-elevated`; StatCard is the only consumer.

### 2.3 Error/loading/empty states on the 9 blank-loading pages

`courses/course`, `mindmap`, `palace`, `analytics`, `exam-sim` (partial), `review`
(pre-start), `decks`, `search` (+1 more per audit) — replace `return null` with the
dashboard's pattern (`app/page.tsx:38-60`): `Skeleton` layout while loading, `Callout` +
retry on `isError`. Also give the dashboard itself an isError surface (`app/page.tsx:22-25`).
Target: every page checks `isError` (map: only 10/53 do; this phase fixes the 9 blank-loaders

- dashboard; full-53 sweep is out of scope here).

### 2.4 Replace the 3 `window.alert/confirm`

- `app/world/page.tsx:238,284` → `useToast()` (Toast kit) / destructive confirmation
  through a `Sheet` with explicit confirm button.
- `app/courses/course/page.tsx:461` (`window.confirm` for delete) → same Sheet-confirm
  pattern. Destructive actions need confirmation modal or undo — never immediate
  (web-guidelines law). Add a lint rule or grep test banning `window.alert|window.confirm`
  in `apps/web`.

### Acceptance criteria

1. `decks`/`reading`/`focus`/`review` contain zero raw `className="btn"` strings (grep
   per file = 0) and zero raw `<select>`/`type="range"` where kit equivalents exist.
2. The 9 pages render a skeleton on load and an error+retry surface on failure (testable by
   code inspection + a render test per page where one exists; do not weaken existing tests).
3. Grep `window.alert|window.confirm` over `apps/web` → 0.
4. One stat tile API: `grep -r "from '@/ui/Feedback'"` shows no `Stat` imports; `Stat`
   removed from the kit.
5. Verification gate green; hub-registry test untouched (route shims unchanged in this
   phase).

**Scope guard — do NOT:** change what any page _does_ (no logic changes in the 2032-line
review component beyond button variants/states); restructure `/decks`' header (that's
Phase 3); add `Modal`/`IconButton` kit components yet unless a page needs them anyway
(IconButton lands with Phase 3's touch sweep); fix studio-page IA.

**Files (~18-22):** 4 workhorse pages, `Feedback.tsx`, `StatCard.tsx`, `Button.tsx` (add
`secondary` variant per DESIGN.md §6), new `src/ui/Toggle.tsx` + `src/ui/Slider.tsx`,
9 blank-loader pages + `app/page.tsx`, world + course pages, new lint/grep test.

**Rollback:** kit additions (`Toggle`, `Slider`, `secondary`) are additive commits — safe
to revert independently. Page-level button swaps are one commit per page; `git revert`
restores raw buttons with no functional change (variants are styling-only).

---

## Phase 3 — IA & first-look clarity (P1)

**Goal:** a new user can decode the nav, find one obvious primary action on every workhorse
page, and hit 44px targets everywhere in the shell.

### 3.1 Nav regrouping — `src/components/nav.ts`

- Regroup the 21-item Learn group (`nav.ts:66-93`) into ≤3 scannable sub-groups with
  learner-language labels: e.g. "Practice" (review, decks, courses, planner),
  "Techniques" (the 9 studios — renamed to learner language: "Generation" → "Retrieval
  practice", "Dual Coding" → "Words + Pictures", "Faded Scaffolding" → "Guided practice",
  …), "Understand" (curriculum/weakness/analytics). Keep all 46 destinations reachable
  (no orphans — AGENTS.md §5); this is regrouping + renaming, not deletion.
- Sync the phone More sheet (`AppShell.tsx:406-436`): grouped 2-column grid with one-line
  descriptions instead of a 46-item 3-column wall.

### 3.2 One primary action per page (start with the two worst)

- `/decks` header (`page.tsx:259-289`): keep **New card** as the primary; demote Bulk paste /
  AI generate / Doctor / Interleave / Workload into a ghost row + overflow menu
  (`Menu` affordance via a small `IconButton`+popover, or secondary buttons in the toolbar).
- `/review` pre-start (`page.tsx:1334-1427`): deck picker + mode chips collapse into one
  "Session setup" Sheet; the screen's primary is **Start review**.
- `/focus` mode competition and `/settings` tab-wall (`app/settings/page.tsx:329-1482`,
  9 stacked panels → the existing `Tabs` kit with 4-5 groups) follow in the same phase if
  budget allows; they're the documented next two offenders.

### 3.3 Duplicate-destination dedupe (conservative)

- `/tutor` vs `/voice-tutor`: one surface with a mode toggle (text ⇄ voice), one nav entry;
  keep the `/voice-tutor` route redirecting for share-links.
- `/palace` vs `/palace-3d`: one nav entry "Memory palace" with 2D/3D mode switch (3D keeps
  its `useReducedMotion` gate); secondary route stays as redirect.
- `/courses/exam` vs `/exam-sim` and `/curriculum` vs `/weakness`: **decide, don't merge
  yet** — add a cross-link + clarify labels in nav; full merge needs product judgment and
  its own PR (record the decision in this doc when made).

### 3.4 Touch-target sweep (shell first)

- `AppShell.tsx:461,470` phone top-bar buttons 36px → 44px; `NotificationBell` (`:107`) →
  44px; dashboard widget reorder buttons (`app/page.tsx:158-167`) → always-visible kebab,
  44px (affordance fix per map opportunity 10 — reorder buttons are currently hover-only).
- Review confidence toggles (`app/review/page.tsx:1392-1403`) ≥44px + visible grade labels
  (blind-grade legend stops being `title=`-only, `:1385`).
- Add the `IconButton` kit component (`src/ui/IconButton.tsx`) with 44px-on-coarse baked in;
  migrate the shell's icon buttons to it (56 hand-rolled icon buttons repo-wide get migrated
  progressively — shell + review + dashboard this phase).
- Mindmap/palace hover-only delete affordances (`app/mindmap/page.tsx:375`,
  `app/palace/page.tsx:193`) → always-visible kebab on coarse pointers.

### Acceptance criteria

1. Nav: no group exceeds ~8 items; every nav label is learner-language (jargon renamed);
   all previous destinations still reachable (hub-registry test stays green; add a nav
   snapshot test rather than weakening anything).
2. `/decks` and `/review` pre-start each expose exactly one primary button (code
   inspection + grep for `variant="primary"`/`.btn` count in the header regions).
3. Grep for `h-9 w-9`/`p-1` interactive elements in `AppShell.tsx` → replaced with the
   44px IconButton; confidence row min-height ≥44px.
4. QuickHudModal gets a visible trigger or is retired (decision recorded; no invisible
   Ctrl+Shift+Space-only surfaces).
5. Verification gate green; E2E/manual-mode surface tests untouched.

**Scope guard — do NOT:** delete any route or feature; rename URL paths (redirects only);
touch the 9 studio pages' internals beyond what Phase 1 already did; redesign AppShell's
layout (grouping + targets only); merge exam/curriculum surfaces without a recorded product
decision.

**Files (~12-16):** `nav.ts`, `AppShell.tsx`, `QuickHudModal.tsx`, decks/review/focus/settings
pages, tutor + voice-tutor, palace + palace-3d, dashboard `app/page.tsx`, mindmap/palace
kebabs, new `src/ui/IconButton.tsx`, possibly `Menu.tsx`.

**Rollback:** nav regrouping is one commit (revert restores original groups); dedupe pairs
are each one commit with redirects left in place, so revert is lossless for share-links.
No migrations; hub-registry untouched.

---

## Phase 4 — Signature motion (P1→P2)

**Goal:** implement the map's 12 opportunities under the motion law — feedback and
continuity, tokens everywhere, GSAP only where CSS can't.

### 4.1 Foundation (CSS-only, no new deps)

- Retire the 15 hand-rolled overlays onto the kit: extend `Sheet.tsx` with a focus trap +
  desktop `Modal` mode (scale 0.96→1 + fade, `--duration-base`, `--ease-enter`, content
  stagger 40ms) — map opportunity 4. Migrate the highest-value hand-rolled overlays first
  (`decks` card editor ×3, `ItemPreviewModal.tsx`, `WorkloadBalancerModal.tsx`,
  `GenerationPracticeModal.tsx`, `InterleavingSchedulerModal.tsx`).
- `Tabs.tsx` sliding active indicator (opportunity 5); `Toast.tsx` slide+fade in / collapse
  out + optional duration line (opportunity 6; also removes its hardcoded hexes from Phase 1
  leftovers); `Progress.tsx` + `LeitnerBox` + streak/ring fills share `--ease-enter`
  (opportunity 7); `CommandPalette` 150ms scale/fade + 30ms result stagger (opportunity 8);
  `OnboardingWizard.tsx` horizontal step slide + dot fill (opportunity 9); `.breathe`
  easing family adopted by focus-timer transitions (opportunity 11); 3D entrances on
  palace-3d/constellation/world stay reduced-motion-gated (opportunity 12 — they already
  gate; add the 150-300ms entrance).
- Replace `transition-all` uses (233) with explicit transition properties in the files
  touched.

### 4.2 The review-loop moments (the emotional core)

- **Card reveal** (opportunity 1): `app/review/page.tsx:1653` boolean swap → 200ms
  `--ease-enter` slide/fade (3D flip allowed for basic cards only). CSS transition on the
  revealed block; respects the global kill-switch automatically.
- **Grade commit** (opportunity 2): interval chip flies to session meta line (~300ms) +
  `hapticLight` (`src/platform/haptics.ts` exists). CSS `@starting-style`/keyframe or a
  FLIP micro-implementation; GSAP justified here only if the FLIP math gets ugly — record
  the choice in the PR.
- **Session-complete** (opportunity 3): compose `.celebrate` + `shimmer-text` + XP count-up
  (one-time odometer). Count-up = the one place a tiny rAF/GSAP tween is justified if CSS
  counters aren't enough; cap the composed moment at ~1.5s.

### 4.3 GSAP decision point

If 4.2 needs GSAP, this is where `gsap` (+`@gsap/react`) is added as a dependency under the
ui-signature §5.7 policy: client components only, `gsap.context()` + revert, matchMedia
reduced-motion, no layout-property tweens. The vendored `gsap-*` skills are the reference.
If 4.2 lands CSS-only, **GSAP is not added** and the vendored skills simply document future
policy.

### Acceptance criteria

1. Every motion property in changed files comes from `--duration-*`/`--ease-*` (grep raw
   `ms`/cubic-bezier values outside globals.css → 0 in touched files).
2. `prefers-reduced-motion` + e-ink kill-switches still blanket-apply (calm-sensory test
   stays green); JS-driven moments branch on `useReducedMotion`.
3. The 12 opportunities each have a one-line "implemented / consciously deferred" status in
   this doc's changelog table below.
4. Verification gate green.

**Scope guard — do NOT:** add scroll-triggered reveals to product pages; animate layout
properties; introduce framer-motion/motion (the ui-animation skill explains why); animate
theme switches; exceed 300ms on any control interaction; add GSAP without the written
policy justification.

**Files (~14-18):** `globals.css`, `Sheet.tsx` + `Modal.tsx` (new), `Tabs.tsx`, `Toast.tsx`,
`Progress.tsx`, `LeitnerBox.tsx`, `CommandPalette`, `OnboardingWizard.tsx`, review page,
session-summary component, focus page, 3D page entrances, the migrated overlay call sites.

**Rollback:** motion changes are strictly additive (keyframes/utilities/classes) — revert
per commit restores instant state changes, which was the pre-existing behavior; no state or
data coupling.

---

## Cross-phase rules

- **AGENTS.md rule 13:** no test is weakened or deleted in any phase; `hub-registry.test.ts`
  must keep passing (Phases 1-4 don't add/remove API routes; if a phase ever does, registry
  updates come with the route change, never by relaxing the test). The new tests this plan
  adds (token contrast, ghost-class grep, alert/confirm ban, nav snapshot) strengthen the
  gate.
- **Verification per phase/commit:** `npm run typecheck && npm run lint && npm test` — and
  for UI PRs, re-read changed pages at 360px in code against the ui-signature 12-point gate
  (no builds; rule 17).
- **PR hygiene:** one phase per PR branch (phase-1-tokens …), Conventional Commits, CI green
  before merge (rules 14/15/18), pipelining the next phase's exploration during CI (rule 16).
- **Status ledger:** keep the table below updated as phases land.

| Phase | Scope                   | ~Files | Risk                      | Status  |
| ----- | ----------------------- | ------ | ------------------------- | ------- |
| 1     | Tokens & contrast       | 30-35  | Low (mechanical)          | planned |
| 2     | Kit consolidation       | 18-22  | Low-medium                | planned |
| 3     | IA & first-look clarity | 12-16  | Medium (product judgment) | planned |
| 4     | Signature motion        | 14-18  | Low-medium                | planned |
