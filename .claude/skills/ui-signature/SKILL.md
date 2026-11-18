---
name: ui-signature
description: THE design language for Learning HUB — load this first for any UI work in apps/web. Defines the identity, token law (mode-aware text ramp, one danger hue, motion tokens), component law (kit-first, button hierarchy, focus-visible), motion law, and the 12-point review gate every UI change must pass. Where any other skill or taste disagrees with this file, this file wins.
---

# Learning HUB — UI Signature

**Load-first skill for UI work in this repo.** The vendored skills under `.claude/skills/`
supply craft; this file supplies *the opinion*. Human-readable spec: `docs/ui-design-signature.md`.
Ground truth for current defects: `docs/ui-ux-map.md`. Repo law: `AGENTS.md` §5 UI + rules 1-18.

## 1. Identity

Learning HUB is a calm, research-backed, focused learning tool. It feels like a **quiet
instrument**: a well-made practice journal you open every day — warm, tinted, unhurried, and
precise. The confidence is in the mechanics: FSRS intervals you can trust, mastery that adds
up, a review loop that never surprises you. It is **not a dashboard** (no wall of KPI tiles
competing for attention) and **not a marketing site** (no hero theatre, no scroll stories).
Every screen answers one question — *what do I do now?* — and everything else recedes.

Brand voice (second person, specific, calm): "Your review queue is empty." "We couldn't save
your changes — try again." Not: "Elevate your learning journey." The research is in the
engine, not shouted on the page (the Studio pages' citation walls are an anti-pattern, not a
feature).

Operate-mode rules apply everywhere (earned familiarity beats novelty; the tool disappears
into the task), with three sanctioned **signature moments** where the app is allowed to be
felt: the card reveal, the grade commit, and the session-complete celebration.

## 2. Design laws (non-negotiable, from AGENTS.md §5 + the UI/UX map)

1. **Mobile-first at 360px.** No horizontal page scroll; wide content inside `.scroll-x`;
   check every change at phone width.
2. **Touch targets ≥ 44px**, everywhere — `.btn` grows on `pointer: coarse`, and so must
   icon buttons, toggles, tab bars, and inline controls. A 28px confidence toggle is a bug.
3. **One primary action per screen.** Secondary actions demote to ghost buttons, menus, or
   overflow. Six simultaneous header actions on `/decks` is the violation to design against.
4. **Honest empty states.** `EmptyState` with a real next action; loading = skeleton shaped
   like the content, never `return null`; errors surface via `Callout`/`Toast` — never
   silent, never `window.alert/confirm`.
5. **Untrusted content renders via `<Markdown>` only.** No `dangerouslySetInnerHTML`.
6. **No raw `fetch`** — all network through `@/lib/transport` helpers.
7. **Navigation only from `src/components/nav.ts`**; detail pages stay link-reachable.
8. **Calm by default:** `prefers-reduced-motion` honored globally (the CSS kill-switch) and
   e-ink mode kills all animation — never fight either with JS.
9. **Kit-first:** build pages from `@/ui`; add to the kit when a pattern repeats twice.
10. **No local builds** (rule 17) — verification is typecheck + lint + tests, and design
    verification is code-reading against §6 of this file.

## 3. Token law

Source of truth: `apps/web/app/globals.css` (`@theme inline`, `--n-*` ramp, `--ac-*`,
`--hub-*` per `data-theme`). Extending tokens happens there, in layers — never as raw values
in components.

### 3.1 Mode-aware text ramp (fixes the P0)

The `--n-50…--n-950` ramp is mode-independent (lightest→darkest) and correct **for
surfaces**. Muted **text** must be mode-scoped. Add semantic text tokens (both defined per
mode, resolved on `:root` and `.dark`):

| Token | Light (on `--n-50`/white) | Dark (on `--hub-*`) | Used for |
|---|---|---|---|
| `--text-strong` | `--n-900` | `--n-100` | headings, primary data |
| `--text-body` | `--n-800` | `--n-200` | body copy |
| `--text-secondary` | `--n-700` (~8.9:1) | `--n-300` | subtitles, helper text |
| `--text-tertiary` | `--n-600` (~6:1) | `--n-400` (dark surface → passes) | labels, metadata |
| `--text-faint` | `--n-600` at reduced emphasis or `--n-500` **only if ≥4.5:1 is verified** | `--n-500` | disabled/placeholder only |

Rules:

- Alias them in `@theme inline` (`--color-text-secondary: var(--text-secondary)` …) so
  `text-secondary`-style utilities exist.
- **Banned as text colors:** unconditioned `text-neutral-400/500`, `text-slate-400/500`,
  and every 300/400-level status/accent text (`text-indigo-300`, `text-emerald-400`,
  `text-amber-300/400`, `text-red-400`, `text-cyan-300`…). Replace with the `--text-*`
  tokens or the mode-aware status tokens below. The map counts ~330 such utilities + 112
  unconditioned `text-indigo-300/400`; they are all P0 bugs, because in light mode they land
  between 1.5:1 and 2.8:1.
- Every `--text-*` value must pass AA (4.5:1 body, 3:1 large) **in both modes**, computed
  from the resolved OKLab token math (the map's method) — lock it in with a contrast unit
  test over `globals.css` so it can't regress silently.

### 3.2 Status colors (one hue per meaning)

- **Danger = rose.** DESIGN.md §2 commits to Rose (`#f43f5e` family) and the kit's danger
  Button is `bg-rose-600`; the `bg-red-600` outliers (review grade buttons, NotificationBell
  dot, games, online) are the bug, not the standard. Introduce
  `--danger-strong` (fills, `rose-600` both modes), `--danger-text`
  (`rose-600` light / `rose-400` dark), `--danger-soft` (tints), and alias the Tailwind
  `red-*` steps used today onto it so old call sites resolve correctly, then migrate.
- **Success = emerald, Warning = amber, Info = sky** — but as mode-aware pairs
  (`--status-*-text`, `--status-*-soft`) with the same light/dark discipline as danger.
  Dark-mode text steps stay 300/400; light-mode text steps become 600/700.
- The `Badge` violet/cyan hardcoded tones and the 171 raw purple/cyan/fuchsia/pink/teal/
  orange/sky utilities migrate to palette (`--ac-*`) or status tokens. A color that doesn't
  respond to palette switching is a defect.

### 3.3 Surfaces & palette discipline

- Hardcoded dark hexes (`dark:bg-[#141418] #18181d #1a1a1f #1e1e23 #232329` families —
  AppShell ×11, Toast ×3, Skeleton, `inputs.tsx`, 7 pages) are **banned**: use
  `dark:bg-(--hub-panel)` / `--hub-panel-2` / `--hub-sunken`.
- Surface variants: `.panel` is the default; `.panel-elevated` for raised/interactive
  tiles; `.panel-glass` and `.panel-interactive` are **deprecated** — fold StatCard's usage
  into `.panel-elevated` and delete the variants (or document one sentence of policy each;
  four undocumented surface styles is sprawl).
- Accent aliases stay: `bg-indigo-600` = `--ac-strong` is the palette-switching mechanism —
  keep using the `indigo-*` aliases for fills, never raw `violet-*`/`purple-*`.

### 3.4 Ghost classes (banned vocabulary)

These shadcn-style utilities resolve to **nothing** in this Tailwind v4 `@theme` (490 usages
across ~15 Studio/HUD files). All are banned; replacements:

| Banned | Replacement |
|---|---|
| `bg-card`, `bg-card/40` | `.panel`, or `bg-white dark:bg-(--hub-panel)` |
| `text-foreground` | inherit, or `text-strong` token |
| `text-muted-foreground` | `text-secondary` / `text-tertiary` token |
| `border-border`, `border-border/60` | `border-neutral-200 dark:border-(--hub-border)` |
| `bg-secondary` | `bg-neutral-100 dark:bg-(--hub-panel-2)` |
| `bg-accent`, `text-accent-foreground` | `--ac-*` roles (`bg-indigo-600`, `--ac-soft` tints) |
| `bg-destructive`, `text-destructive` | `--danger-*` tokens |
| `bg-muted`, `text-primary`, `ring-ring` | closest `--hub-*` / `--n-*` / `--ac-*` role |

### 3.5 Motion tokens

No more hand-typed durations. Define in `globals.css` and use everywhere:

```css
:root {
  --duration-fast: 150ms;   /* press feedback, hovers, small state swaps */
  --duration-base: 240ms;   /* sheets, dialogs, reveals, progress fills */
  --duration-slow: 400ms;   /* large surfaces, world entrances (ceiling: 300ms for micro-interactions per DESIGN.md §8 — slow is for surfaces, never controls) */
  --ease-enter: cubic-bezier(0.22, 1, 0.36, 1);   /* ease-out-quart — entrances, standard */
  --ease-move:  cubic-bezier(0.25, 1, 0.5, 1);    /* slides, drawers */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);  /* iOS-like sheet feel */
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);        /* ease-in — motivated exits only */
}
```

Alias into `@theme` so `duration-(--duration-base)` / `ease-(--ease-enter)` work, and define
the **real** animation utilities the dead classes were reaching for (`animate-fade-in-up`,
`animate-scale-in`, …) — or delete the dead classes; intent that silently no-ops
(`animate-fade-in`, `animate-in fade-in zoom-in-95`, `animate-fadeIn`) is debt either way.

### 3.6 Absolute bans

- Raw hex in class strings or inline styles (print/certificate surfaces included).
- Raw non-palette color utilities (violet/cyan/fuchsia/pink/teal/orange/sky as decoration).
- `transition: all` / `transition-all` in new code (233 existing uses get swept).
- Undefined animation classes; opacity-only affordances (`opacity-0 group-hover:`) for
  actions that must be reachable on touch.
- New dependencies for animation without a written justification against §5's GSAP policy.

## 4. Component law

**Kit-first, always.** The kit is good; the 232 raw `className="btn"` strings, 47 raw
`<select>`, 141 raw `<input>` are rule debt. New code uses `Button`, `TextField`,
`TextArea`, `SelectField`, `Tabs`, `Sheet`, `Panel`, `EmptyState`, `Toast`, `Callout`,
`Badge`, `StatCard`/`Stat`, `ProgressBar`/`ProgressRing`, `Markdown`.

**When to extend the kit:** a pattern repeats twice (AGENTS.md §5). The next kit additions,
in order: `IconButton` (56 hand-rolled icon buttons; fixes the 44px law), `Toggle`/`Checkbox`
(17 raw), `Slider` (29 raw), `Tooltip`/`InfoHint` (196 title-only affordances),
`Modal` (Sheet wrapper for desktop-centered dialogs; 15 hand-rolled overlays), `Spinner`
(14 ad-hoc Loader2 embeds). `Stat` vs `StatCard` merge into one tile API.

**Button hierarchy** (`<Button>` variants; contrast pairs must pass AA in BOTH modes —
verify by computing from token values, per §3.1):

| Variant | Light | Dark | Passing pair |
|---|---|---|---|
| `primary` | white on `--ac-strong` (5.23:1) | same fill on `--hub-*` | fill+white |
| `secondary` *(add)* | `--n-800` text on `--n-100` fill, hairline border | `--n-200` text on `--hub-panel-2` | text/fill |
| `ghost` | `--n-700` text on white (8.95:1) | `--n-300` text on panel | text/bg |
| `danger` | white on `rose-600` (≈4.6:1 — verify, else darken fill step) | same fill | fill+white |

Ghost-danger (text-only destructive affordances) uses `--danger-text`, never `text-red-400`
in light mode (2.77:1). Every variant gets `focus-visible` (below), `active:scale-[0.98]`,
and the loading state (`aria-busy`) — raw `.btn` strings have none of these, which is why
they're banned.

**Focus-visible standard** (currently implemented only in `LeitnerBox`): one rule in
`globals.css` applied to `.btn`, `.btn-ghost`, `.input`, and all kit components —

```
focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2
focus-visible:ring-offset-(--hub-bg)  /* offset-white in light mode */
```

Never `outline-none` without this replacement; never the browser default on a
`transition-colors` button.

**Overlays:** kit `Sheet` for phones (bottom slide) and the new `Modal` wrapper for
desktop-centered dialogs (scale 0.96→1 + fade, `--duration-base`, `--ease-enter`); focus
trap + focus return + scroll lock are part of the wrapper, retiring the 15 hand-rolled
`fixed inset-0 z-50` overlays.

## 5. Motion law

Sources: `ui-animation` + `emilkowalski-motion` + `motion-design` + `gsap-*`, merged:

1. **Motion = feedback & continuity, never decoration.** Animate for feedback, orientation,
   continuity, or deliberate delight — "it looks cool" on a high-frequency surface is a no.
2. **One motion language:** durations from `--duration-*`, easings from `--ease-*`, rate of
   work: micro ≤ 300ms (DESIGN.md §8); `--duration-slow` reserved for large surfaces and
   world entrances. The only sanctioned ambient loops: `.breathe` (friction gate/focus) and
   `glow-pulse` (live status). `shimmer-text` exists solely inside the session-complete
   moment.
3. **Physical rules:** `transform`/`opacity` only; `transition: all` never; interruptions
   retarget (CSS transitions over keyframes); paired elements (overlay+panel) share easing
   and duration; stagger small groups at 30-50ms/child, total < 300ms; enter fast, exit
   faster; ephemeral UI (hover/popover) enters instantly.
4. **Confirm in place:** an action's result lands on the control that caused it (grade chip,
   "Copied"); corner `Toast` only for results with no on-screen origin.
5. **Entrance/exit patterns:** content enters with a 150-240ms fade + 12px rise from an
   already-visible default (no mount-on-load choreography for product pages — no scroll
   reveals on product surfaces at all); exits collapse (height/opacity) rather than vanish.
   Sheets slide (`--ease-drawer`); centered dialogs scale from 0.96; toasts slide+fade in
   and collapse out.
6. **List/dataset choreography:** grids and lists stagger on first render only (one-time),
   30-50ms, capped; removed rows animate out then collapse; skeleton→content crossfades
   with a 2px blur guard, never a hard swap.
7. **GSAP usage policy (Next.js):** CSS transitions first. GSAP is justified only for
   (a) coordinated multi-beat sequences (session-complete, grade-commit), (b) number
   count-up/odometer, (c) canvas/WebGL/3D surfaces, (d) future scroll-scrubbed art on
   Persuade surfaces — none of which scroll-jacks. Rules: client components only (`'use
   client'`), `gsap.context()` + revert on unmount, `gsap.matchMedia()` for reduced-motion
   (drive duration to 0 or skip; never rely on the CSS kill-switch alone for JS motion), no
   layout-property tweens, and it's a new dependency — justify it in the PR against this
   policy before adding.
8. **The map's 12 signature opportunities** (docs/ui-ux-map.md §6) — the target *feel*:
   - **Card reveal** (review): the app's signature moment — 200ms question→answer slide/fade
     (3D flip allowed for basic cards), `--ease-enter`.
   - **Grade commit**: chosen interval chip flies to the session meta line (~300ms arc),
     one `hapticLight`, then the row advances — felt, not watched.
   - **Session-complete**: `.celebrate` + `shimmer-text` + XP count-up composed ONCE, 1.5s
     total ceiling.
   - **Sheet/dialog entrance**: phone slide stays; desktop gains scale+fade + 40ms content
     stagger.
   - **Tabs indicator**: sliding active indicator, cross-fade, no layout jump.
   - **Toast choreography**: slide+fade in, collapse-out, optional duration progress line.
   - **Progress semantics**: one "fill" easing family (`--ease-enter`) shared by
     ProgressBar/ProgressRing/LeitnerBox/streak/course rings — mastery feels like one system.
   - **Command palette**: 150ms scale/fade open, results stagger 30ms, arrow-key highlight
     slides.
   - **Onboarding steps**: horizontal slide + progress-dot fill.
   - **Hover-only → visible affordances**: kebab menus always visible on coarse pointers
     (affordance fix first, then motion).
   - **Friction-gate breathing**: `.breathe`'s easing family is the calm signature; focus
     timer transitions adopt it.
   - **3D surfaces' entrance**: 150-300ms camera-dolly or node stagger on data load,
     `useReducedMotion`-gated (already adopted there — keep it).

## 6. Review checklist — the 12-point gate

Every UI PR passes all twelve. Fail any → fix before merge (tests never weakened; rule 13).

1. **Contrast:** every text token passes AA (4.5:1 / 3:1 large) in light AND dark, computed
   from resolved values — including muted text, status text, accent text, placeholders.
2. **One primary action** per screen/page state; secondary actions demoted.
3. **Touch targets ≥ 44px** on coarse pointers — including icon buttons, toggles, tabs,
   inline rows.
4. **`focus-visible`** ring per §4 on every interactive element; no bare `outline-none`.
5. **States covered:** loading (skeleton, not `return null`), error (Callout/Toast, no
   silent mutation failures, no `window.alert/confirm`), empty (honest `EmptyState` with a
   next action).
6. **No ghost classes** — zero occurrences of the §3.4 banned vocabulary.
7. **No raw hex / raw non-palette color utilities** — everything through `--hub-*`, `--n-*`,
   `--ac-*`, `--text-*`, `--danger-*`, `--status-*`.
8. **Motion lawful:** reduced-motion + e-ink safe; transform/opacity only; tokens for
   duration/easing; no `transition: all` in new code; no scroll-jacking; GSAP per §5.7.
9. **Kit-first:** `<Button>`/`TextField`/`SelectField`/`Sheet`/`EmptyState` used; no new raw
   `.btn`/`<select>`/`<input>` strings; a pattern repeated twice becomes a kit component.
10. **360px:** no horizontal page scroll; wide content in `.scroll-x`; header actions wrap
    below the title; nothing clipped or overlapping.
11. **Copy:** specific labels (verb + object), no slop words, errors name problem + recovery,
    sentence case, numerals for counts.
12. **Boundaries:** untrusted content via `<Markdown>`; no raw `fetch`; nav only from
    `nav.ts`; forms surface server errors (zod at boundaries).

## 7. Provenance

| Principle | Source skill |
|---|---|
| Anti-slop voice, one system, real content, "Never" list, copy-tells, palette/type libraries | `taste` |
| Operate-mode discipline, craft floor (contrast/depth/states/browser surfaces), refusal list | `impeccable` |
| 120-rule UX database, rule priority 1-10, searchable evidence | `ui-ux-pro-max` |
| Three-layer token architecture, component state specs, preset-theme discipline | `design-system` |
| Tailwind v4 token wiring, no-raw-hex, banned-ghost-vocabulary table | `ui-styling` |
| Web Interface Guidelines checklists + output format; HIG deference/touch laws | `web-design-guidelines` (+ merged apple-hig) |
| Brief-first building, honest states, one memorable quality | `frontend-design` |
| Motion = feedback/continuity; enter/exit asymmetry; confirm-in-place; recipes; review standards | `ui-animation` |
| Micro-interaction restraint; 140-220ms; stagger small groups; one motion language | `emilkowalski-motion` |
| Beat maps, primary/secondary/ambient layers, choreography, defect-to-decision pairs | `motion-design` |
| Audit → atomic fixes, fix priority | `redesign-skill` |
| Restraint protocol: color scarcity, hairline borders, invisible motion | `minimalist-skill` |
| Visual-audit-then-fix axis (merged into `code-review`) | `design-review` |
| Prototype discipline (throwaway routes, `?variant=` switching) | `prototype` |
| Task-graph execution, frontier concurrency, context pointers | `implement-spec` |
| Multi-axis review (standards/spec/UI) + Fowler smells | `code-review` |
| Writing discipline for skills/agents docs (leading words, pruning) | `writing-for-agents` |
| GSAP core/timeline/ScrollTrigger/React/plugins/performance/utils/frameworks | `gsap-*` family |
| Color science (OKLab mixing, contrast math, tint-don't-gray) | `color-expert` (merged into `taste` §6) |
| 360px-first, ≥44px, calm-by-default, kit-first, honest states | `AGENTS.md` §5 + `docs/ui-ux-map.md` |

**Conflicts resolved (the record):** danger hue rose over red (DESIGN.md + kit authority);
mode-scoped semantic text tokens over re-mapping the surface ramp (surfaces keep the ramp;
text gets mode-scoped roles); tinted-ramp grays over pure grays (taste/minimalist/color-expert
agree with the existing OKLab ramp); CSS-first motion with GSAP as a justified exception over
GSAP-by-default (repo has zero JS-animation deps and a global reduced-motion kill-switch);
earned familiarity over novelty on Operate surfaces (impeccable's own Operate rules over its
Experience-mode ambition); visible affordances over hover-minimalism (minimalist protocol
yields to touch reality); micro-interaction ceiling 300ms (DESIGN.md §8) with `--duration-slow`
reserved for large surfaces and the two sanctioned ambient loops.
