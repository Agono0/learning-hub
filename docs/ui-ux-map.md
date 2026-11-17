# UI/UX Map — Learning HUB web app

> Full UI/UX audit of `apps/web` as of 2026-11-18. Read-only investigation: every claim cites
> `file:line` evidence. Meant to feed the UI/UX modernization effort — nothing here was
> "fixed" in code. All paths relative to `apps/web/` unless prefixed.
>
> Method: code reading only (per AGENTS.md rule 17, no local builds / dev servers).
> Contrast values computed from the actual token math in `app/globals.css`
> (OKLab `color-mix` per CSS spec), not from rendered pixels.

---

## 1. Executive summary

- **The bones are genuinely good.** A real UI kit exists (`src/ui`, 37 files), a single nav
  model (`src/components/nav.ts`), a design spec (`DESIGN.md`), a token system with 6 palettes +
  dark/light/e-ink modes, honest empty states, a 3-step first-run wizard, and **zero raw-fetch
  violations** in UI code (only react-query `refetch()` matches).
- **But light mode is systemically broken.** The neutral ramp (`--n-50…--n-950`) is
  mode-independent while every muted-text convention (`text-neutral-500/400`,
  `text-indigo-300`, `text-emerald-400`…) was designed against dark surfaces. In light mode
  `text-neutral-500` = `#b9c3bd` on `#f8f9f9` ≈ **1.7:1** contrast (WCAG requires 4.5:1).
  ~330 additional unconditioned `text-{indigo,red,emerald,amber}-{300,400}` utilities fail too.
- **A second, foreign design language is embedded in the app.** 490 class usages of shadcn-style
  tokens that don't exist here (`bg-card/40`, `text-primary`, `text-foreground`,
  `text-muted-foreground`, `border-border/60`) across ~15 AI-generated "Studio" files — they
  silently resolve to nothing (Tailwind v4 generates no utility for an undefined `--color-*`),
  leaving flat, unstyled surfaces.
- **Dead motion classes everywhere.** `animate-fade-in`, `animate-in fade-in`,
  `zoom-in-95`, `animate-fadeIn` are not defined anywhere (no animation plugin installed;
  globals.css defines only 6 keyframes). Someone wrote animation intent that silently no-ops.
- **Kit bypass is the dominant style.** 232 raw `className="btn"/"btn-ghost"` buttons vs 85
  `<Button>` uses; 47 raw `<select>` vs `SelectField`; 17 raw checkboxes; 29 raw range sliders
  (no Slider kit component exists). The kit is good — pages just don't use it.
- **One primary action per screen is violated on workhorse pages.** `/decks` header alone has 6
  simultaneous actions (`app/decks/page.tsx:259-289`); `/review` and `/focus` stack many more.
- **Loading/error discipline is uneven.** ~9 pages render nothing (`return null`) while loading;
  only 10/53 pages handle `isError`; most mutations fail silently without a toast.
- **Touch targets regress below the 44px law** in the shell itself: phone top-bar buttons are
  `h-9 w-9` = 36px (`src/components/AppShell.tsx:461,470`), `NotificationBell` 36px, review
  confidence toggles ~28px (`app/review/page.tsx:1392-1403`), dashboard widget reorder buttons
  ~22px (`app/page.tsx:158-167`).
- **IA overload.** 46 destinations; "Learn" group alone holds 21 items (`nav.ts:66-93`) with
  learning-science jargon labels ("Dual Coding", "Generation", "Faded Scaffolding") that a new
  user can't decode; 3 overlapping quick-access surfaces (⌘K palette, QuickHudModal
  (Ctrl+Shift+Space, no visible trigger), QuickReviewWidget).
- **Duplicate/orphan destinations:** `/tutor` vs `/voice-tutor`; `/palace` vs `/palace-3d`;
  `/courses/exam` vs `/exam-sim`; `/curriculum` vs `/weakness` overlap; `world/page.tsx:238`
  still calls `window.alert()` and `courses/course/page.tsx:461` calls `window.confirm()`.
- **The theming architecture is excellent but leaks.** ~30 call sites hardcode dark hexes
  (`dark:bg-[#1a1a1f]` family) and 171 raw purple/cyan/fuchsia classes that don't participate
  in palette switching — switching calm→ocean re-skins most of the app and leaves grey ghosts.
- **Biggest opportunity:** the app is one motion pass away from feeling crafted — sheets slide,
  progress bars fill, but card reveals, grade commits, tab switches, stat numbers and toasts are
  all instant cuts. DESIGN.md §5 already specifies the target behavior; implementation never
  caught up.
- **Recommended sequence:** (1) fix the light-mode ramp + ghost tokens (P0, mechanical),
  (2) enforce kit adoption + Button hierarchy (P1), (3) one motion pass on the review loop and
  sheet/dialog family (P1→P2), (4) IA pruning (P2).

---

## 2. Route inventory (53 pages under `app/**/page.tsx`)

Clarity = "what a first-time user sees and whether the primary action is obvious" (1 = lost, 5 = obvious).
Shell context: desktop sidebar w/ collapsible groups, tablet icon rail, phone top bar + 4-tab
bottom bar + "More" sheet (`src/components/AppShell.tsx:113-523`); content column capped at
`max-w-5xl` (`AppShell.tsx:566`).

| Route                                                       | Purpose                                                                                                            | First look | Primary action obvious?                                                      | Main risks                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (`app/page.tsx`)                                        | "Today" dashboard — widget registry, reorderable, QuickReviewWidget top                                            | 5          | Yes — `Review N cards` / `Start Daily Loop` big primary (`page.tsx:136-139`) | Reorder buttons only on hover (`page.tsx:152`), invisible on touch; no error UI for failed dashboard query (`page.tsx:22-25`)                     |
| `/review` (`app/review/page.tsx`, 2032 ln)                  | FSRS session: deck picker, modes (normal/pretest/cram/commute), per-format grading, undo, energy, generation modal | 4          | Yes — Reveal → grade buttons w/ interval previews (`page.tsx:1337-1371`)     | 2032-line component; confidence toggles ~28px (`:1392-1403`); blind-grade legend hidden behind `title` tooltip (`:1385`); loading = `return null` |
| `/courses` (`app/courses/page.tsx`)                         | Course list with progress rings                                                                                    | 4          | Yes — "Open course"                                                          | Emoji-only deck chips; `text-emerald-400` unconditional (`:194`)                                                                                  |
| `/courses/new` (`app/courses/new/page.tsx`)                 | 5-step "create course with any AI" wizard (prompt builder → copy → paste/import → review → import)                 | 5          | Yes — numbered steps, disabled-until-valid submit (`:152-159`)               | None material; the best page in the app                                                                                                           |
| `/courses/course` (`app/courses/course/page.tsx`)           | Course detail: lesson list, exam entry, AI improve panel                                                           | 3          | Mostly                                                                       | `window.confirm` for delete (`:461`); title fetched async, header swaps ("Improve with AI" is a section title caught by header scan)              |
| `/courses/lesson` (`app/courses/lesson/page.tsx`)           | Lesson player: theory (`<Markdown>`) + practice exercises + exam handoff                                           | 3          | Yes — exercise inputs                                                        | **Only page without `PageHeader`** — raw `h1` (`:205`); query-param id via `useIdParam`                                                           |
| `/courses/exam` (`app/courses/exam/page.tsx`)               | Course final exam runner                                                                                           | 3          | Yes                                                                          | "No course selected" ghost title when `?id=` missing (`:1` scan)                                                                                  |
| `/courses/certificate` (`app/courses/certificate/page.tsx`) | Certificate view/print                                                                                             | 4          | Yes                                                                          | Print styling untested at 360px                                                                                                                   |
| `/curriculum` (`app/curriculum/page.tsx`, 863 ln)           | Skills & exams graph, weakness v2 bridge, import/export                                                            | 2          | Buried                                                                       | Dense single column; wall-of-text; overlaps `/weakness` and `/courses/exam`                                                                       |
| `/decks` (`app/decks/page.tsx`, 1559 ln)                    | Deck rail + card browser + full card editor + AI generate + Doctor + Interleave                                    | 3          | Partly — 6 header actions compete (`:259-289`)                               | Zero `<Button>` kit uses (28 raw); deck-name input unlabeled (`:302`); card editor is a hand-rolled modal (3× `fixed inset-0 z-50`)               |
| `/reading` (`app/reading/page.tsx`, 1414 ln)                | Incremental reading + SQ3R + multi-format ingest + highlight triage → cards                                        | 4          | Yes — ingest Sheet + triage queue                                            | 23 raw `.btn`; three `Tabs` rows nested (`:621,783,1287`)                                                                                         |
| `/search` (`app/search/page.tsx`)                           | FTS5 + NL search across notes/cards/lessons/highlights/ideas                                                       | 4          | Yes — big input + honest no-results (5× EmptyState)                          | None major                                                                                                                                        |
| `/notes` (`app/notes/page.tsx`)                             | Notes CRUD, backlink-ish related panel                                                                             | 4          | Yes                                                                          | One raw btn hierarchy slip                                                                                                                        |
| `/graph` (`app/graph/page.tsx`)                             | Knowledge graph canvas (svg) w/ dependency + remedial panels                                                       | 3          | Partly — canvas-first, controls top-left                                     | `text-indigo-300` buttons (`:94,266,444`); low discoverability of canvas interactions                                                             |
| `/canvas` (`app/canvas/page.tsx`)                           | Image canvas + dual-coding annotation                                                                              | 3          | Partly                                                                       | Upload-first, empty canvas needs affordance                                                                                                       |
| `/mindmap` (`app/mindmap/page.tsx`)                         | Interactive mind maps → card generation                                                                            | 3          | Partly                                                                       | Hover-only delete affordances (`:375`), `opacity-0` groups fail touch (`:233,305`)                                                                |
| `/palace` (`app/palace/page.tsx`)                           | Memory palace (2D) loci management                                                                                 | 3          | Partly                                                                       | Delete on hover only (`:193,279`); `text-amber-300/80` low contrast (`:378`)                                                                      |
| `/palace-3d` (`app/palace-3d/page.tsx`)                     | 3D memory palace (three.js), reduced-motion aware (`:40`)                                                          | 3          | Yes — Button/EmptyState/Skeleton kit used                                    | WebGL failure path thin; heavy import on first paint                                                                                              |
| `/constellation` (`app/constellation/page.tsx`, 631 ln)     | Knowledge constellation visualization                                                                              | 2          | No — mysterious premise                                                      | Jargon label; canvas interactions undocumented                                                                                                    |
| `/planner` (`app/planner/page.tsx`)                         | Study plan matrix                                                                                                  | 4          | Yes                                                                          | —                                                                                                                                                 |
| `/weakness` (`app/weakness/page.tsx`)                       | Weakness Radar v2 (Elo/BKT per skill)                                                                              | 3          | Yes — EmptyState-driven (9 uses)                                             | Overlaps `/curriculum`                                                                                                                            |
| `/tutor` (`app/tutor/page.tsx`)                             | Socratic text tutor w/ sessions, TransportPanel fallback                                                           | 4          | Yes — chat input                                                             | 7 queries, no isError UI                                                                                                                          |
| `/voice-tutor` (`app/voice-tutor/page.tsx`)                 | Speech-based tutor                                                                                                 | 3          | Yes — mic button                                                             | Mic permission failure UX ad-hoc; duplicate destination w/ `/tutor`                                                                               |
| `/exam-sim` (`app/exam-sim/page.tsx`, 707 ln)               | Mock exam simulator                                                                                                | 3          | Yes                                                                          | 3 nested PageHeaders (loading/active/result states); overlaps `/courses/exam`                                                                     |
| `/feynman` (`app/feynman/page.tsx`, 661 ln)                 | Feynman teach-back w/ AI grading                                                                                   | 3          | Yes                                                                          | 2 PageHeaders (state swap)                                                                                                                        |
| `/audio-commute` (`app/audio-commute/page.tsx`)             | Hands-free audio review w/ speech                                                                                  | 3          | Yes                                                                          | `typeof window === 'undefined' return null` (`:71-75`)                                                                                            |
| `/sleep-tmr` (`app/sleep-tmr/page.tsx`)                     | Targeted Memory Reactivation during sleep                                                                          | 2          | No — needs hardware                                                          | Inline `h1` variant (`:184`); niche hardware dependency unexplained at first look                                                                 |
| `/metacognition` (`app/metacognition/page.tsx`)             | Calibration studio (JOL/Brier)                                                                                     | 2          | No — ghost tokens                                                            | Ghost token classes (`:44-51`), dead `animate-fade-in` (`:21`), research-prose wall (`:44-83`)                                                    |
| `/generation` (`app/generation/page.tsx`)                   | Generative retrieval ladder studio                                                                                 | 2          | No                                                                           | Same studio template issues                                                                                                                       |
| `/dual-coding` (`app/dual-coding/page.tsx`)                 | Visual/verbal encoding studio                                                                                      | 2          | No                                                                           | Same                                                                                                                                              |
| `/self-explanation` (`app/self-explanation/page.tsx`)       | Self-explanation prompts studio                                                                                    | 2          | No                                                                           | Same                                                                                                                                              |
| `/interleaving` (`app/interleaving/page.tsx`)               | Interleaved practice scheduler studio                                                                              | 2          | No                                                                           | Same                                                                                                                                              |
| `/analogy` (`app/analogy/page.tsx`)                         | Analogical transfer studio                                                                                         | 2          | No                                                                           | Same                                                                                                                                              |
| `/scaffolding` (`app/scaffolding/page.tsx`)                 | Worked-example fading studio                                                                                       | 2          | No                                                                           | Same                                                                                                                                              |
| `/pretest` (`app/pretest/page.tsx`)                         | Pretesting lab                                                                                                     | 3          | Partly                                                                       | Same template, smaller                                                                                                                            |
| `/workload` (`app/workload/page.tsx`)                       | Workload balancer + 90-day forecast                                                                                | 3          | Yes                                                                          | Same template issues                                                                                                                              |
| `/difficulty` (`app/difficulty/page.tsx`)                   | Cognitive difficulty audit                                                                                         | 3          | Yes                                                                          | —                                                                                                                                                 |
| `/focus` (`app/focus/page.tsx`, 1255 ln)                    | Focus timers, friction gate, allowlists, breathing studio, flow state                                              | 3          | Partly — multiple timer modes compete                                        | 18 raw `.btn`; deep core import `@learning-hub/core/src/focus` (`:33`); many modes = no single primary                                            |
| `/habits` (`app/habits/page.tsx`)                           | Habit check-ins, streaks, celebration                                                                              | 4          | Yes — check-in button                                                        | `.celebrate` pop-in is the only real micro-animation                                                                                              |
| `/motivation` (`app/motivation/page.tsx`, 661 ln)           | Commitments, quests, streak guardian, quotes                                                                       | 3          | Partly                                                                       | 9 queries stacked                                                                                                                                 |
| `/journal` (`app/journal/page.tsx`)                         | Journaling + weekly AI reflection                                                                                  | 4          | Yes                                                                          | —                                                                                                                                                 |
| `/weekly` (`app/weekly/page.tsx`)                           | Weekly review ritual                                                                                               | 4          | Yes                                                                          | `text-amber-400` unconditional (`:178`)                                                                                                           |
| `/physiology` (`app/physiology/page.tsx`)                   | Breathing coherence, circadian, HRV                                                                                | 3          | Partly                                                                       | Hardware-adjacent; `text-indigo-400` icons (`:90`)                                                                                                |
| `/ideas` (`app/ideas/page.tsx`, 522 ln)                     | Idea inbox + AI council/brainwrite/evolve                                                                          | 3          | Yes                                                                          | 12 raw `.btn`                                                                                                                                     |
| `/quotes` (`app/quotes/page.tsx`)                           | Quote/mnemonic collection + daily quote                                                                            | 4          | Yes                                                                          | `text-indigo-300` author line (`:84,181`)                                                                                                         |
| `/analytics` (`app/analytics/page.tsx`, 493 ln)             | Review analytics: heatmap, calibration, retention                                                                  | 3          | Partly — charts w/o captions                                                 | 7 inline `style={{}}` (bar widths), no empty state for zero data                                                                                  |
| `/backup` (`app/backup/page.tsx`, 1023 ln)                  | Backup/restore, cloud sync providers, import/export, share codes                                                   | 3          | Partly                                                                       | 14 raw `.btn`; long form wall; 4 tabs worth of content untabbed                                                                                   |
| `/online` (`app/online/page.tsx`, 1162 ln)                  | Rooms, boss raids, guilds, leaderboard, buddy library                                                              | 3          | Partly                                                                       | 10 mutations, network-dependency UX                                                                                                               |
| `/games` (`app/games/page.tsx`, 1219 ln)                    | Matching pairs (dnd-kit), boss battles, gist leaderboard                                                           | 4          | Yes — `Tabs` (`:146`)                                                        | Drag-and-drop on touch has fallback? (dnd-kit pointer sensor only)                                                                                |
| `/world` (`app/world/page.tsx`, 803 ln)                     | "Forest of Focus" 3D world + market + avatar                                                                       | 2          | No — gamified 3D w/ economy                                                  | `window.alert` ×2 (`:238,284`); heavy; unclear purpose vs `/focus`                                                                                |
| `/ingest` (`app/ingest/page.tsx`)                           | Universal ingest → cards (thin page around studio)                                                                 | 4          | Yes                                                                          | Studio component carries all styling debt                                                                                                         |

**Pattern worth naming:** 9 pages are a _template_ ("Studio" pages) — thin `PageHeader` +
research-badge chips + one `<XStudio>` component + a 3-column "Learning Science Foundations"
prose card (`app/metacognition/page.tsx:44-83`). All inherit the ghost-token and dead-motion
problems; all have opaque, jargon-first titles.

---

## 3. UI kit inventory (`src/ui` — 37 components + exercises)

Legend: **solid** = production-ready, consistent with tokens; **needs work** = functional but
inconsistent/incomplete; **missing** = pattern exists in pages but no kit component.

| Component                                                                                                                                                                                                                                                                                                | File                                    | Status      | Notes                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` (primary/ghost/danger, loading, icon)                                                                                                                                                                                                                                                           | `src/ui/Button.tsx`                     | solid       | Delegates to `.btn`/.btn-ghost`; aria-busy; disabled+loading merged (`:39-40`). No `secondary` variant promised by DESIGN.md §6. No focus-visible ring of its own.                                                   |
| `.btn` / `.btn-ghost` primitives                                                                                                                                                                                                                                                                         | `app/globals.css:185-193`               | needs work  | 44px on `pointer:coarse` (`:242-247`), but **no `focus-visible` styles**, no `active:scale` (DESIGN.md §5.1), `disabled:opacity-50` only (no cursor/not-allowed, no reduced-contrast rule)                           |
| `Panel`                                                                                                                                                                                                                                                                                                  | `src/ui/Panel.tsx`                      | solid       | `.panel` + title/actions row; `h2` always (`:27`) — pages nesting panels get h2/h3 soup                                                                                                                              |
| `PageHeader`                                                                                                                                                                                                                                                                                             | `src/ui/PageHeader.tsx`                 | solid       | Title/subtitle/actions/icon; adopted on 52/53 pages; `text-2xl` with phone override (globals.css:267-275)                                                                                                            |
| `TextField` / `TextArea` / `SelectField`                                                                                                                                                                                                                                                                 | `src/ui/Field.tsx`                      | solid       | useId + htmlFor + aria-describedby/aria-invalid (`:34-41`); error/hint slots. **Bypassed by 47 raw `<select>`, 141 raw `<input>`**                                                                                   |
| `Tabs`                                                                                                                                                                                                                                                                                                   | `src/ui/Tabs.tsx`                       | solid       | WAI-ARIA tablist, arrow keys, roving tabindex, scroll-x (`:25-69`); py-1.5 = 36px touch height (grows only via `.btn` rule — Tabs don't)                                                                             |
| `Sheet` (bottom sheet / dialog)                                                                                                                                                                                                                                                                          | `src/ui/Sheet.tsx`                      | solid       | Escape, backdrop, scroll lock, focus in/out, footer; `.sheet-panel` slide-up 240ms (`globals.css:320-322`); **no focus trap**, desktop modal slides from bottom (odd), no scale-in                                   |
| `EmptyState`                                                                                                                                                                                                                                                                                             | `src/ui/Feedback.tsx:5-24`              | solid       | icon/title/body/action; dashed border; used on 13 pages — should be everywhere                                                                                                                                       |
| `Badge` (7 tones, dot/pulse)                                                                                                                                                                                                                                                                             | `src/ui/Feedback.tsx:26-79`             | solid       | violet/cyan tones hardcode raw purple/cyan (breaks palette theming)                                                                                                                                                  |
| `Stat`                                                                                                                                                                                                                                                                                                   | `src/ui/Feedback.tsx:82-103`            | needs work  | Overlaps `StatCard` — two stat tiles in the kit; `Stat` lacks trend/progress/accent                                                                                                                                  |
| `Callout`                                                                                                                                                                                                                                                                                                | `src/ui/Feedback.tsx:106-124`           | solid       | role=alert for danger; tone = badge tones                                                                                                                                                                            |
| `Skeleton`                                                                                                                                                                                                                                                                                               | `src/ui/Feedback.tsx:127-134`           | solid       | Hardcodes `dark:bg-[#1b1b20]` (palette leak)                                                                                                                                                                         |
| `StatCard` (glass/elevated/standard + accent + trend + progress)                                                                                                                                                                                                                                         | `src/ui/StatCard.tsx`                   | solid       | Well-built; div-with-role=button for onClick (`:74-93`) instead of real button; "getdesign.md" comment, 490-usage ghost-token cousin files around it                                                                 |
| `ProgressBar` / `ProgressRing`                                                                                                                                                                                                                                                                           | `src/ui/Progress.tsx`                   | solid       | aria progressbar; 500ms width transition (`:30`); ring label `role="img"`                                                                                                                                            |
| `Markdown` (GFM+KaTeX, no raw HTML)                                                                                                                                                                                                                                                                      | `src/ui/Markdown.tsx`                   | solid       | The rule-11 sanitizer; `.prose-hub` styles (globals.css:339-393)                                                                                                                                                     |
| `Toast` (provider + hook, 4 tones)                                                                                                                                                                                                                                                                       | `src/ui/Toast.tsx`                      | solid       | aria-live polite, role=alert for danger, offset above tab bar (`:102`); hardcoded dark hexes in tone styles (`:45-49`); **no enter/exit animation** (mounts instantly)                                               |
| `cx`                                                                                                                                                                                                                                                                                                     | `src/ui/cx.ts`                          | solid       | clsx-lite                                                                                                                                                                                                            |
| `LeitnerProgression`                                                                                                                                                                                                                                                                                     | `src/ui/LeitnerBox.tsx`                 | solid       | focus-visible rings defined here (`:129`) — the only component that has them                                                                                                                                         |
| `CognitiveLoadMeter`                                                                                                                                                                                                                                                                                     | `src/ui/CognitiveLoadMeter.tsx`         | solid       | Domain HUD                                                                                                                                                                                                           |
| `MetacognitionRadar`, `MetacognitiveCalibrationCard`, `MetacognitiveCalibrationHUD`                                                                                                                                                                                                                      | `src/ui/Metacognition*.tsx`             | needs work  | Calibration card 570 ln; ghost tokens in HUD variant                                                                                                                                                                 |
| 15 more domain HUDs (AdaptiveExam, AnalogicalTransfer, CardiacCoherence, ConceptInspector, ConceptSchema, DesirableDifficulty, DualCoding, FadedScaffolding, FeynmanExplanationCard, GenerationMatrix, Interleaving, SelfExplanation, SleepConsolidation, SpatialLocus, TechniqueAudit, ToulminArgument) | `src/ui/*HUD.tsx`                       | needs work  | Solid logic/props APIs; 8 of them carry ghost-token classes (`DesirableDifficultyHUD` 33, `DualCodingHUD` 32, `SelfExplanationHUD` 26, `InterleavingHUD` 25 uses) and 300/400-level text colors                      |
| `InkPad` (handwriting)                                                                                                                                                                                                                                                                                   | `src/ui/InkPad.tsx`                     | solid       | Canvas ink capture for review                                                                                                                                                                                        |
| `RelatedPanel`                                                                                                                                                                                                                                                                                           | `src/ui/RelatedPanel.tsx`               | solid       | Related notes/cards                                                                                                                                                                                                  |
| `ItemPreviewModal`                                                                                                                                                                                                                                                                                       | `src/ui/ItemPreviewModal.tsx`           | needs work  | Hand-rolled overlay (`fixed inset-0 z-50`) duplicating Sheet                                                                                                                                                         |
| `WorldCanvas` / `WorldModal`                                                                                                                                                                                                                                                                             | `src/ui/World*.tsx`                     | solid       | 3D world helpers                                                                                                                                                                                                     |
| `ExerciseInput` + `isAnswerReady` + `defaultAnswer`                                                                                                                                                                                                                                                      | `src/ui/exercises/inputs.tsx` (801 ln)  | solid       | radiogroup/aria-checked, labels, up/down ordering for touch, live regions (`:61,99,127,190,239,626`); one hardcoded `dark:hover:bg-[#18181c]` (`:41-42`)                                                             |
| `ExercisePractice`                                                                                                                                                                                                                                                                                       | `src/ui/exercises/ExercisePractice.tsx` | solid       | Shared by lesson player, exams, review                                                                                                                                                                               |
| `runJavaScriptTests` / `canRunLanguage`                                                                                                                                                                                                                                                                  | `src/ui/exercises/code-runner.ts`       | solid       | Sandboxed runner                                                                                                                                                                                                     |
| `shuffle` (seeded)                                                                                                                                                                                                                                                                                       | `src/ui/exercises/shuffle.ts`           | solid       | Deterministic option shuffling                                                                                                                                                                                       |
| — `IconButton`                                                                                                                                                                                                                                                                                           | —                                       | **missing** | 56 icon-only buttons hand-rolled, sizes drift 22–40px                                                                                                                                                                |
| — `Toggle`/`Switch`/`Checkbox`/`Radio`                                                                                                                                                                                                                                                                   | —                                       | **missing** | 17 raw checkboxes, 8 ad-hoc aria-pressed toggles, settings provider picker hand-rolled (`app/settings/page.tsx:332-346`)                                                                                             |
| — `Slider`                                                                                                                                                                                                                                                                                               | —                                       | **missing** | 29 raw `type="range"` inputs (settings, focus, decks)                                                                                                                                                                |
| — `Tooltip` / `InfoHint`                                                                                                                                                                                                                                                                                 | —                                       | **missing** | 196 `title=`-only tooltips — invisible on touch                                                                                                                                                                      |
| — `Menu`/`Dropdown`                                                                                                                                                                                                                                                                                      | —                                       | **missing** | NotificationBell popover hand-rolled                                                                                                                                                                                 |
| — `Modal` API (Sheet alternative for desktop-style dialogs)                                                                                                                                                                                                                                              | —                                       | **missing** | 15 files hand-roll `fixed inset-0 z-50` overlays (decks ×3, focus, review, palace, mindmap, backup, weakness, sleep-tmr, WorkloadBalancerModal, GenerationPracticeModal, InterleavingSchedulerModal, QuickHudModal…) |
| — `Spinner`                                                                                                                                                                                                                                                                                              | —                                       | **missing** | 14 ad-hoc `animate-spin` Loader2 embeds                                                                                                                                                                              |
| — `Table` primitives                                                                                                                                                                                                                                                                                     | —                                       | **missing** | `.panel table` styled globally (globals.css:263-265) but every table hand-assembled                                                                                                                                  |

**Consistency verdict:** the kit's core 12 primitives are genuinely consistent (spacing scale
4/8px via Tailwind, radii `rounded-lg/xl/2xl`, `transition-colors`, dark-mode via `dark:` +
`--hub-*`). Drift comes from the ~60 call-site bypasses and the AI-generated Studio/HUD layer,
not from the kit.

---

## 4. Tokens & theming findings

**Architecture** (`app/globals.css`):

- Tailwind v4 (`@tailwindcss/postcss`), `@custom-variant dark` on `.dark` class (`:4`); no
  `tailwind.config` file — all tokens in CSS.
- 6 palettes as `data-theme` on `<html>`: calm (default), forest, ocean, sunset, blossom,
  midnight (`:62-145`), each defining `--tint`, `--ac-{strong,mid,soft,deep}` and dark surfaces
  `--hub-{bg,panel,panel-2,sunken,border,border-strong}`.
- Neutral ramp `--n-50…--n-950` derived from tint via OKLab `color-mix` (`:148-160`);
  Tailwind `neutral-*` and `slate-*` aliased to it (`:25-46`); `indigo-*` aliased to accent
  (`:49-58`) — clever: `bg-indigo-600` = palette accent everywhere.
- Theme/palette applied pre-paint by inline script (`app/layout.tsx:28`), synced by
  `src/components/ThemeSync.tsx` (pref: dark/light/system/**e-ink**; e-ink kills all animation,
  borders go black, `:396-439` in globals.css). Default = dark.
- Type scale: system-ui stack; `PageHeader` h1 `text-2xl` → phone `1.375rem`
  (globals.css:266-275); body 15px/7 in `.prose-hub` (`:341`); `.label` = 11px uppercase.
  **No documented `--text-*` token scale** — sizes are ad-hoc Tailwind classes (`text-[10px]`,
  `text-[11px]`, `text-xs`…`text-2xl` all appear, some 4-deep on one screen).
- Spacing/radii: Tailwind defaults; `rounded-lg/xl/2xl` dominate; `.panel` = `rounded-xl p-4`
  (`:181-183`) — DESIGN.md §6 specifies `p-4 sm:p-6`, never implemented.

**The light-mode defect (P0, systemic).** The ramp is mode-independent (lightest→darkest), but
muted-text conventions assume dark surfaces:

| Token (calm palette)                    | As used                                                 | Light bg        | Ratio              | Verdict                       |
| --------------------------------------- | ------------------------------------------------------- | --------------- | ------------------ | ----------------------------- |
| `text-neutral-500` (`#b9c3bd`)          | subtitles, `.label`, hints, EmptyState body, Toast desc | `#f8f9f9`/white | **1.72–1.81**      | fail everywhere in light mode |
| `text-neutral-400` (`#cbd3cf`)          | icons, ghost icons                                      | white           | **1.53**           | fail                          |
| `text-indigo-300` (`--ac-soft #a7c3b0`) | **112 unconditional uses**                              | white           | **1.78**           | fail                          |
| `text-emerald-400/amber-400/red-400`    | **217 unconditional uses**                              | white           | 1.92 / 1.67 / 2.77 | fail                          |
| `text-neutral-900` body                 | body text                                               | `#f8f9f9`       | 17.5               | pass                          |
| `text-neutral-600` (`.btn-ghost`)       | ghost buttons                                           | white           | 8.95               | pass                          |
| white on `--ac-strong` (`#56735f`)      | `.btn`                                                  | —               | 5.23               | pass                          |
| `text-indigo-600` accent text           | links, selected states                                  | `#f8f9f9`       | 4.96               | pass                          |

In dark mode everything passes (6.8–11.3). Since default = dark, the bug hides; anyone picking
Light (or `system` on a light OS) gets an app where every hint, subtitle, badge and status text
is near-invisible. Evidence anchors: ramp `globals.css:148-160`; subtitle `PageHeader.tsx:22`;
`.label` `globals.css:200-202`; fresh-start banner `app/page.tsx:101`; answer reveal
`app/review/page.tsx:1653`; EnergyBar `app/review/page.tsx:1570-1592`.

**Ghost tokens (P0).** 490 usages of `(bg|text|border)-(card|primary|foreground|muted-foreground|
muted|accent|secondary|destructive)` resolve to nothing (no such `--color-*` in `@theme`).
Top offenders: `src/components/DesirableDifficultyStudio.tsx` (93), `MetacognitionStudio.tsx`
(67), `SelfExplanationStudio.tsx` (61), `DualCodingStudio.tsx` (48), plus 8 HUDs and all 9
studio pages' "foundations" cards (`app/metacognition/page.tsx:44-51`).

**Palette leaks.**

- Hardcoded dark hexes: `dark:bg-[#141418] #18181d #1a1a1f #1e1e23 #232329` families in
  `AppShell.tsx` (×11), `Toast.tsx` (×3), `Feedback.tsx` (Skeleton), `Field`-kit siblings,
  `inputs.tsx:41`, plus 7 pages — switching palette changes `--hub-panel` but these stay grey.
- Raw non-palette colors: 171 uses of purple/cyan/fuchsia/pink/teal/orange/sky (e.g.
  `Badge` violet/cyan tones `Feedback.tsx:32-33`, `LeitnerBox` cyan, studios galore) — invisible
  to palette switching.
- Danger color split: `bg-rose-600` (Button danger, `Button.tsx:19`, HUDs) vs `bg-red-600`
  (review grade buttons `app/review/page.tsx:157`, NotificationBell dot `:111`, games, online) —
  two different "danger" hues in the core loop.
- `.panel-glass`/`.panel-elevated`/`.panel-interactive` (globals.css:441-455) are extra surface
  variants with no documented usage policy; only `StatCard` uses them.

**Motion tokens.** 6 keyframes exist (`pop-in`/`celebrate` `:205-221`, `breathe` `:224-237`,
`sheet-up`/`fade-in` `:304-325`, `glow-pulse` `:458-472`, `shimmer` `:475-491`);
global reduced-motion kill-switch (`:328-337`); `useReducedMotion` hook used only by
palace-3d + constellation. **No duration/easing custom properties** — every transition is
hand-typed (`transition-colors` 80×, `transition-all` 233×, durations 150/200/500ms ad hoc).

---

## 5. Top 20 concrete UX problems

Severity: **P0** blocks understanding/task · **P1** friction · **P2** polish.

1. **P0 — Light mode is unreadable for all muted text.** Ramp is mode-independent but
   `text-neutral-500/400`, `text-indigo-300`, `text-*-400` conventions assume dark surfaces.
   `--n-500 #b9c3bd` on `--n-50 #f8f9f9` = 1.72:1 (needs 4.5). `globals.css:148-160`;
   `PageHeader.tsx:22`; `Feedback.tsx:20`; `Toast.tsx:119`; 112 unconditioned
   `text-indigo-300/400` + 217 `text-{red,emerald,amber}-400` uses. Concrete:
   answer reveal `app/review/page.tsx:1653`; EnergyBar `app/review/page.tsx:1570-1592`.
2. **P0 — 490 ghost utility classes render nothing.** `bg-card/40 text-primary text-foreground
text-muted-foreground border-border/60` across 15 Studio/HUD files (Tailwind v4 silently
   generates nothing for undefined colors). `app/metacognition/page.tsx:44-51`;
   `src/components/DesirableDifficultyStudio.tsx` (93 hits). Whole surfaces look broken/flat.
3. **P0 — Dead animation classes.** `animate-fade-in` (6 pages, `app/metacognition/page.tsx:21`),
   `animate-in fade-in zoom-in-95` (`src/components/InterleavingSchedulerModal.tsx:181,377`),
   `animate-fadeIn` (`src/components/AdaptiveExamStudio.tsx:545,679`,
   `src/ui/SpatialLocusHUD.tsx:121`) — none defined; intended entrance motion silently absent.
4. **P1 — Buttons bypass the kit 73% of the time.** 232 raw `className="btn"/"btn-ghost"` vs
   85 `<Button>`; the top workhorse pages use zero kit buttons (`decks` 28, `reading` 23,
   `focus` 18, `review` 16 raw). No aria-busy, no loading state, inconsistent hierarchy
   (`app/decks/page.tsx:259-289`).
5. **P1 — One-primary-action rule broken on core screens.** `/decks` header: New card + Bulk
   paste + AI generate + Doctor + Interleave + Workload all visible at once
   (`app/decks/page.tsx:259-289`); `/review` shows mode chips + deck picker + 5 more controls
   before the loop starts (`app/review/page.tsx:1334-1427`).
6. **P1 — Touch targets below the 44px law in the shell itself.** Phone top bar: search/sync
   `h-9 w-9` = 36px (`AppShell.tsx:461,470`); `NotificationBell` 36px (`:107`); review
   confidence toggles `px-2 py-1` ≈ 28px (`app/review/page.tsx:1392-1403`); dashboard widget
   reorder buttons `p-1` ≈ 22px (`app/page.tsx:158-167`); 56 hand-rolled icon buttons total.
   (`.btn` is correctly patched to 44px on coarse pointers, `globals.css:242-247` — but nothing
   else is.) Also the answer-reveal text at `app/review/page.tsx:1653` carries
   `text-indigo-300` in light mode (1.78:1).
7. **P1 — 196 tooltip-only affordances.** `title="…"` is the only explanation for icon buttons,
   hidden behind long-press on touch. e.g. blind-grade legend `app/review/page.tsx:1385`,
   Doctor/Interleave buttons `app/decks/page.tsx:280-289`, sync states `AppShell.tsx:251`.
   No Tooltip/InfoHint kit component.
8. **P1 — Settings is a 1,150px scroll wall.** 9 stacked `<section className="panel">` blocks
   (AI provider, scheduler, session, theme, weights, reminders, push, sync, data) with no tabs,
   anchors, or grouping (`app/settings/page.tsx:329-1482`); the `Tabs` kit exists and is unused
   here.
9. **P1 — Error states missing on 43/53 pages.** Only 10 pages check `isError`; failed queries
   render either nothing or stale skeletons (`app/page.tsx:22-25` dashboard has none), and most
   mutations rely on the mutation's onError toast or nothing (e.g. `app/decks/page.tsx` create
   deck has no error surface).
10. **P1 — Loading = blank screen on 9 pages.** `return null` while data loads: courses/course,
    mindmap, palace, analytics, exam-sim (partial), review (pre-start), decks, search. Contrast
    with the good pattern: dashboard's skeleton layout (`app/page.tsx:38-60`) and
    `Skeleton` kit.
11. **P1 — Three competing quick-access surfaces, one invisible.** ⌘K `CommandPalette`
    (`AppShell.tsx:562`), `QuickHudModal` on Ctrl+Shift+Space only — no visible trigger
    anywhere (`src/components/QuickHudModal.tsx:49-67`), and dashboard `QuickReviewWidget`
    (`src/components/QuickReviewWidget.tsx:89`). Overlapping jobs (jump/search/quick-review).
12. **P1 — Duplicate destinations fragment the mental model.** `/tutor` vs `/voice-tutor`;
    `/palace` vs `/palace-3d`; `/courses/exam` vs `/exam-sim`; `/curriculum` vs `/weakness`
    vs `/analytics` overlap; `/world` vs `/focus` both do "focus timers" (2D vs 3D).
    `nav.ts:66-138`.
13. **P1 — Learn group is a 21-item dump with jargon labels.** "Generation", "Dual Coding",
    "Self-Explanation", "Analogical Transfer" (`nav.ts:66-93`) — meaningless to a new user; the
    More sheet grids all 46 items in 3 columns (`AppShell.tsx:406-436`) with no descriptions.
14. **P1 — `window.alert/confirm` survive in 3 spots** against the calm-UI law:
    `app/world/page.tsx:238,284`, `app/courses/course/page.tsx:461` (Toast + Sheet exist).
15. **P1 — Focus-visible is not designed.** `.btn`/`.btn-ghost`/`.input` define no
    `focus-visible` styles (globals.css:185-198); keyboard users get browser-default outline on
    a `transition-colors` button, nothing on `.panel` clickable cards, and DESIGN.md §5.3's ring
    spec is unimplemented anywhere except `LeitnerBox.tsx:129`.
16. **P1 — Sheet/dialog family fragmented.** Kit `Sheet` (82 ln, a11y-solid) coexists with 15
    hand-rolled `fixed inset-0 z-50` overlays lacking focus return/scroll-lock consistency
    (`app/decks/page.tsx` ×3, `src/components/WorkloadBalancerModal.tsx`,
    `GenerationPracticeModal.tsx`, `ItemPreviewModal.tsx`…). Sheet also lacks a focus trap, and
    on desktop it plays the phone's slide-from-bottom animation.
17. **P1 — Ghost branding on the highest-traffic surface.** The 9 Studio pages (reached from
    nav) open with research-paper badges and a 3-column prose wall before any interactive
    element (`app/metacognition/page.tsx:26-38,44-83`) — first look = wall of citations, not a
    task.
18. **P2 — Stat tile duplication + surface variant sprawl.** `Stat` (Feedback.tsx:82) vs
    `StatCard` (StatCard.tsx) with different APIs; `panel` vs `panel-glass` vs `panel-elevated`
    vs `panel-interactive` with no selection policy (globals.css:181,441-455).
19. **P2 — Double padding + width drift on Studio pages.** Shell already pads
    (`AppShell.tsx:566` `px-4 py-4 sm:px-6 sm:py-6`, max-w-5xl) while the studio template adds
    `p-4 sm:p-6 lg:p-8 max-w-6xl` (`app/metacognition/page.tsx:21`) — 32px+ padding stacks and
    inconsistent column widths across the app.
20. **P2 — Micro-polish drift:** 30+ inline `style={{}}` (bar widths, transforms; analytics ×7),
    ProgressRing caption 11px (`Progress.tsx:79`), `.label` uppercase 11px everywhere,
    `Badge` pulse + `animate-pulse` + `animate-ping` + `animate-bounce` used ad hoc (36+7+3),
    `shimmer-text`/`glow-pulse` defined but barely adopted (`globals.css:470-491`).

**Explicitly _not_ problems** (verified clean): zero raw `fetch` in UI (rule 1 upheld —
`src/lib/transport.ts` seam); untrusted content always via `<Markdown>` (rule 11; only
react-markdown, no `dangerouslySetInnerHTML` outside the pre-paint theme script in
`layout.tsx:34`); keyboard support on Tabs/Sheet/exercise inputs is genuinely good; honest
empty states where `EmptyState` is adopted (search, weakness, palace-3d, sleep-tmr, audio-commute,
constellation, debate, courses).

---

## 6. Signature opportunities (motion & affordance, GSAP-grade)

Where motion would add clarity (not decoration) — all respect the existing
`prefers-reduced-motion` kill-switch (`globals.css:328-337`) and e-ink kill-switch
(`:421-428`):

1. **Card reveal on `/review`** — currently an instant boolean swap (`app/review/page.tsx:1653`,
   `revealed && …`). A 200ms answer slide/fade (or 3D flip for basic cards) makes the
   question→answer beat legible and is _the_ signature moment of an SRS app.
2. **Grade-commit choreography** — grade buttons already preview the next interval
   (`review/page.tsx:1363-1366`); on commit, animate the chosen interval chip flying into the
   session meta line + a single haptic (`hapticLight` already exists, `src/platform/haptics.ts`).
3. **Session-complete moment** — `.celebrate` pop-in exists (`globals.css:205-221`) but only on
   one surface; compose it with the already-defined `shimmer-text` (`:484-491`) + XP count-up
   for the session summary. Stat counters everywhere else currently jump instantly.
4. **Sheet/dialog entrance** — `sheet-panel` slide (240ms, `globals.css:320-322`) covers
   phones; add scale+fade for centered desktop dialogs and staggered content reveal, then
   retire the 15 hand-rolled overlays to the kit.
5. **Tabs active indicator** — swap is instant background change (`Tabs.tsx:55-60`);
   a sliding indicator (DESIGN.md §5.4 "cross-fade, no layout jump") costs one motion value.
6. **Toast choreography** — toasts mount instantly and vanish on timeout (`Toast.tsx:104-133`);
   slide+fade in, collapse-out on dismiss, and a subtle progress line for durationMs.
7. **Progress semantics** — `ProgressBar`/`ProgressRing` animate width only (`Progress.tsx:30,76`);
   Leitner box fills (`LeitnerBox.tsx`), streak flames, and course rings should share one
   "fill" easing family so mastery feels like one system.
8. **Command palette** — `cmdk` opens with no transition; a 150ms scale/fade + result stagger
   (plus arrow-key highlight motion) would make ⌘K feel like the app's cockpit.
9. **Onboarding step transitions** — the 3-step wizard swaps content instantly
   (`OnboardingWizard.tsx` `step === 1 && …`); a horizontal slide with progress-dot fill
   (dots already exist, `:273-283`) sells "guided setup".
10. **Hover-only affordances → visible affordances** — delete/move actions hidden behind
    `opacity-0 group-hover:` (`app/mindmap/page.tsx:375`, `app/palace/page.tsx:193`,
    `app/page.tsx:152`) are invisible on touch; a long-press menu or always-visible kebab on
    coarse pointers is an affordance fix, not just motion.
11. **Friction gate breathing** — `.breathe` 8s circle (`globals.css:224-237`) is the app's
    calm-motion signature; mirror the same easing family in focus timer transitions so
    "calm" is systematic rather than local.
12. **3D surfaces' entrance** — palace-3d/constellation/world already gate on
    `useReducedMotion`; a camera-dolly or node-stagger entrance (150-300ms) on data load would
    make them feel engineered rather than dropped in.

---

## 7. Constraints inherited from AGENTS.md (design law)

Restated as the non-negotiables any modernization must preserve:

1. **No raw `fetch` in UI.** All network via `apiGet/apiSend/apiUpload/apiStream/apiDownload`
   from `@/lib/transport` (rule 1; ESLint-enforced). _Audit result: currently 0 violations._
2. **Untrusted content never renders as HTML.** `<Markdown>` from `@/ui` only — no
   `dangerouslySetInnerHTML` (rule 11). Applies to lesson theory, notes, AI output, imports.
3. **Mobile-first at 360px.** No horizontal page scroll; wide content inside `.scroll-x`
   (`globals.css:258-301`); check every change at phone width.
4. **Touch targets ≥ 44px.** `.btn`/`.btn-ghost`/`.input` grow on `pointer: coarse`
   (`globals.css:242-255`) — the law must extend to icon buttons, toggles, tab bars, and
   inline controls (currently violated; see problem #6).
5. **Navigation only from `src/components/nav.ts`.** Detail pages must be link-reachable, never
   orphaned (recipe §UI; the `/courses/*` exceptions must keep in-app entry points).
6. **Calm by default.** One primary action per screen; honest empty states; no dark patterns;
   `prefers-reduced-motion` honored globally (`globals.css:328-337`).
7. **No local builds.** Verification = typecheck + lint + tests only (rule 17) — design
   iterations must be validated by reading code and unit/E2E tests, not by running builds.
8. **Build pages from `@/ui`; add to the kit when a pattern repeats twice** (recipe §UI) —
   the 232 raw-button / 47 raw-select bypasses are rule debt to be paid down, and new
   primitives (`IconButton`, `Toggle`, `Slider`, `Tooltip`, `Modal`) have long since passed
   the "repeats twice" bar.
9. **zod at every boundary** (rule 5) — forms surface server errors through `Callout`/toast,
   never silent failures (current gap: problem #9).
10. **Never weaken tests to pass** (rule 13) — UI refactors must keep
    `apps/web/tests/calm-sensory.test.ts`, manual-mode surface tests, and hub-registry tests green.

---

## 8. Suggested modernization sequence (for the effort this map feeds)

1. **Token repair sprint (P0):** add a mode-scoped muted-text layer (e.g. `--text-muted` /
   `--text-faint` per mode), remap `neutral-400/500` text usages, fix the ~330 unconditioned
   300/400-level text colors, define the missing `--color-card/primary/foreground/muted-*`
   aliases (one `@theme` block) so the 490 ghost classes resolve — instant de-uglification.
2. **Delete dead motion classes or implement them** — pick one: either add the keyframes
   (`fade-in` utility, `fade-in-up`) or strip the classes; then add duration/easing CSS
   variables as the single motion vocabulary.
3. **Kit completion + adoption lint:** add `IconButton`, `Toggle`, `Slider`, `Tooltip`,
   `Modal`(Sheet wrapper), `Spinner`; codemod raw `.btn` → `<Button>`; ESLint rule or PR
   checklist for new raw usages.
4. **Review-loop motion pass** (opportunities 1-3) — highest emotional ROI.
5. **IA pruning:** merge tutor variants, palace variants, exam surfaces; rename science jargon
   to learner language; cap Learn group; give QuickHudModal a visible trigger or retire it.
6. **A11y hardening:** focus-visible ring policy, focus traps in overlays, 44px sweep, label
   sweep on the 141 raw inputs.
