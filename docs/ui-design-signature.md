# Learning HUB — UI Design Signature

> The design language of the web app, in one document. Agent-facing form:
> [.claude/skills/ui-signature/SKILL.md](../.claude/skills/ui-signature/SKILL.md) (load-first
> skill for UI work). Evidence base: [docs/ui-ux-map.md](ui-ux-map.md) (full audit,
> 2026-11-18). Implementation plan: [docs/ui-ux-next-plan.md](ui-ux-next-plan.md).
> Repo law: [AGENTS.md](../AGENTS.md) §5 UI + hard rules 1-18.
>
> Status: spec-of-record for the UI modernization effort. Where an older document
> (`DESIGN.md`) or any vendored craft skill disagrees with this file, this file wins.

---

## 1. Identity

Learning HUB is a **calm, research-backed, focused learning tool** — a quiet instrument, not
a dashboard and not a marketing site. Warm tinted neutrals, one accent family per palette,
quiet depth, and a review loop you can trust. The design goal for every screen is that it
answers one question — _what do I do now?_ — while everything else recedes.

Voice: second person, specific, calm. "Your review queue is empty." "We couldn't save your
changes — try again." The learning science lives in the engine; it is not shouted on the
page. Research-prose walls before the first interactive element (the Studio-page template)
are an anti-pattern.

Three sanctioned signature moments where the app is allowed to be _felt_: the **card
reveal**, the **grade commit**, and the **session-complete** celebration. Everywhere else,
earned familiarity beats novelty: the tool disappears into the task.

## 2. Design laws

Non-negotiable; each traces to AGENTS.md §5 or the UI/UX audit:

| #   | Law                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mobile-first at **360px**. No horizontal page scroll; wide content inside `.scroll-x`.                                                                                          |
| 2   | Touch targets **≥ 44px** on coarse pointers — buttons, icon buttons, toggles, tabs, inline controls.                                                                            |
| 3   | **One primary action per screen.** Secondary actions demote to ghost, menu, or overflow.                                                                                        |
| 4   | **Honest states:** loading = skeleton shaped like the content; empty = `EmptyState` with a next action; errors = `Callout`/`Toast`, never silent, never `window.alert/confirm`. |
| 5   | Untrusted content renders via **`<Markdown>`** only; never `dangerouslySetInnerHTML`.                                                                                           |
| 6   | No raw `fetch` — `apiGet/apiSend/…` from `@/lib/transport`.                                                                                                                     |
| 7   | Navigation only from `src/components/nav.ts`; detail pages stay link-reachable.                                                                                                 |
| 8   | **Calm by default:** the global `prefers-reduced-motion` kill-switch and e-ink kill-switch are never fought with JS-driven motion.                                              |
| 9   | **Kit-first:** build pages from `@/ui`; kit the pattern when it repeats twice.                                                                                                  |
| 10  | No local builds (rule 17): verification = typecheck + lint + tests + code-reading against §7.                                                                                   |

## 3. Token law

Source of truth: `apps/web/app/globals.css`. Extend tokens there, in layers; never hardcode
values in components.

### 3.1 Mode-aware text ramp (P0 fix)

The `--n-50…--n-950` OKLab ramp is mode-independent and stays for **surfaces**. Muted
**text** becomes mode-scoped semantic tokens, defined on `:root` (light) and `.dark`:

| Token              | Light                                | Dark      | Role                      |
| ------------------ | ------------------------------------ | --------- | ------------------------- |
| `--text-strong`    | `--n-900`                            | `--n-100` | headings, primary data    |
| `--text-body`      | `--n-800`                            | `--n-200` | body copy                 |
| `--text-secondary` | `--n-700`                            | `--n-300` | subtitles, helper text    |
| `--text-tertiary`  | `--n-600`                            | `--n-400` | labels, metadata          |
| `--text-faint`     | darkest step that still passes 4.5:1 | `--n-500` | disabled/placeholder only |

Every value must pass WCAG AA in **both modes** (4.5:1 body / 3:1 large), computed from the
resolved OKLab token math — the same method the audit used to expose the current 1.5-1.9:1
failures. A unit test locks the guarantee in.

**Banned as text colors:** unconditioned `text-neutral-400/500`, `text-slate-400/500`, and
all 300/400-level accent/status text (`text-indigo-300`, `text-emerald-400`,
`text-amber-300/400`, `text-red-400`, `text-cyan-300`…). The audit counts ~330 such
utilities plus 112 unconditioned `text-indigo-300/400`.

### 3.2 Status colors — one hue per meaning

- **Danger = rose.** `DESIGN.md` §2 and the kit's danger Button already commit to rose; the
  scattered `bg-red-600` usages (review grade buttons, NotificationBell dot, games, online)
  are the defect. Tokens: `--danger-strong` (fills), `--danger-text` (rose-600 light /
  rose-400 dark), `--danger-soft` (tints).
- **Success = emerald, warning = amber, info = sky**, each as a mode-aware
  `--status-*-text` / `--status-*-soft` pair (dark text steps 300/400, light text steps
  600/700).
- The 171 raw purple/cyan/fuchsia/pink/teal/orange/sky utilities migrate to palette
  (`--ac-*`) or status tokens. A color that ignores palette switching is a defect.

### 3.3 Surfaces & palette discipline

- Hardcoded dark hexes (`dark:bg-[#141418]`-family: AppShell ×11, Toast ×3, Skeleton,
  `inputs.tsx`, 7 pages) are banned — use `dark:bg-(--hub-panel)` and friends.
- Surface variants collapse to two: `.panel` (default) and `.panel-elevated` (raised,
  interactive). `.panel-glass` / `.panel-interactive` are deprecated.
- `bg-indigo-600` = `--ac-strong` (the palette-switching alias) stays the way to render
  accent fills.

### 3.4 Ghost classes — banned vocabulary

These shadcn-style utilities resolve to nothing in this Tailwind v4 `@theme` (490 usages in
~15 Studio/HUD files; Tailwind generates no utility for an undefined `--color-*`, so they
silently render nothing):

`bg-card(/40)` · `text-primary` · `text-foreground` · `text-muted-foreground` ·
`border-border(/60)` · `bg-secondary` · `bg-accent` · `text-accent-foreground` ·
`bg-destructive` · `text-destructive` · `bg-muted` · `ring-ring`

Replacements: `.panel` / `bg-white dark:bg-(--hub-panel)` for surfaces; `--text-*` tokens
for text; `border-neutral-200 dark:border-(--hub-border)` for hairlines; `--ac-*` /
`--danger-*` for accent and danger; `bg-neutral-100 dark:bg-(--hub-panel-2)` for subdued
fills.

### 3.5 Motion tokens

```css
--duration-fast: 150ms; /* press, hover, small state swaps */
--duration-base: 240ms; /* sheets, dialogs, reveals, progress fills */
--duration-slow: 400ms; /* large surfaces & world entrances only */
--ease-enter: cubic-bezier(0.22, 1, 0.36, 1);
--ease-move: cubic-bezier(0.25, 1, 0.5, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

Micro-interactions stay ≤ 300ms (`DESIGN.md` §8); `--duration-slow` is reserved for large
surfaces. The dead classes (`animate-fade-in`, `animate-in fade-in zoom-in-95`,
`animate-fadeIn`) are either implemented as real utilities or removed — silent no-ops are
debt either way.

### 3.6 Absolute bans

Raw hex in class strings/inline styles · raw non-palette color utilities ·
`transition: all` in new code · undefined animation classes · hover-only affordances
(`opacity-0 group-hover:`) for touch-reachable actions · new animation dependencies without
a written justification against §6.7.

## 4. Component law

Kit-first, always: `Button`, `TextField`, `TextArea`, `SelectField`, `Tabs`, `Sheet`,
`Panel`, `EmptyState`, `Toast`, `Callout`, `Badge`, `StatCard`/`Stat`, `ProgressBar`/
`ProgressRing`, `Markdown`. Extend the kit when a pattern repeats twice; the pending
additions are `IconButton`, `Toggle`/`Checkbox`, `Slider`, `Tooltip`/`InfoHint`, `Modal`,
`Spinner`, and a merged `Stat`/`StatCard` API.

**Button hierarchy** (contrast pairs verified AA in both modes from token math):

| Variant             | Fill                                  | Text                                          | Notes                          |
| ------------------- | ------------------------------------- | --------------------------------------------- | ------------------------------ |
| `primary`           | `--ac-strong`                         | white (5.23:1 on calm)                        | one per screen                 |
| `secondary` _(new)_ | `--n-100` / `--hub-panel-2`, hairline | `--n-800` / `--n-200`                         | the DESIGN.md-promised variant |
| `ghost`             | transparent, hover tint               | `--n-700` light (8.95:1) / `--n-300` dark     | secondary actions              |
| `danger`            | `--danger-strong`                     | white (≈4.6:1 — verify; darken fill if short) | destructive                    |

Text-only destructive affordances use `--danger-text` (rose-600 light / rose-400 dark) —
never `text-red-400` in light mode (2.77:1). All variants get the focus-visible ring,
`active:scale-[0.98]`, and `aria-busy` loading.

**Focus-visible standard:** one `globals.css` rule applied to `.btn`, `.btn-ghost`, `.input`
and kit components — `focus-visible:ring-2 ring-(--ac-strong) ring-offset-2` with
mode-appropriate offset. Never bare `outline-none`.

**Overlays:** `Sheet` on phones (bottom slide); a new `Modal` wrapper for desktop-centered
dialogs (scale 0.96→1 + fade, focus trap, focus return, scroll lock) — retiring the 15
hand-rolled `fixed inset-0 z-50` overlays.

## 5. Motion law

1. **Motion = feedback & continuity, never decoration.** No mount-on-load choreography on
   product pages; no scroll reveals on product surfaces.
2. **One motion language:** all durations/easings from §3.5 tokens; `transform`/`opacity`
   only; `transition: all` never; interruptions retarget; paired elements share easing and
   duration.
3. **Rhythm:** micro ≤ 300ms; enter fast, exit faster; ephemeral UI (hover, popovers)
   enters instantly and exits with a 100-150ms fade; stagger small groups at 30-50ms/child,
   total < 300ms.
4. **Confirm in place:** results land on the control that caused them; corner `Toast` only
   for results with no on-screen origin.
5. **Patterns:** content enters as 150-240ms fade + 12px rise; exits collapse; sheets slide
   (`--ease-drawer`); dialogs scale from 0.96; toasts slide in and collapse out; progress
   fills share `--ease-enter` so mastery feels like one system; skeletons→content
   crossfade with a 2px blur guard.
6. **Ambient motion is rationed:** `.breathe` (friction gate/focus) and `glow-pulse` (live
   status) only; `shimmer-text` exists solely in the session-complete moment.
7. **GSAP policy (Next.js):** CSS transitions first; GSAP only for coordinated multi-beat
   sequences, number count-ups, canvas/WebGL/3D surfaces, or future Persuade-surface scroll
   art (never scroll-jacking). Client components only; `gsap.context()` + revert on
   unmount; `gsap.matchMedia()` drives reduced motion (don't rely on the CSS kill-switch
   for JS motion); no layout-property tweens; it is a new dependency — justify in the PR.

### The twelve signature opportunities

From the audit §6, with their target feel:

1. **Card reveal** (`/review`) — the signature moment: 200ms question→answer slide/fade.
2. **Grade commit** — interval chip flies to the session meta line, one `hapticLight`.
3. **Session-complete** — `.celebrate` + `shimmer-text` + XP count-up, ≤ 1.5s total.
4. **Sheet/dialog entrance** — phone slide stays; desktop gains scale+fade + content stagger.
5. **Tabs indicator** — sliding active indicator, no layout jump.
6. **Toast choreography** — slide+fade in, collapse out.
7. **Progress semantics** — one fill-easing family across bars/rings/boxes/streaks.
8. **Command palette** — 150ms scale/fade open, 30ms result stagger.
9. **Onboarding steps** — horizontal slide + progress-dot fill.
10. **Visible affordances** — hover-only actions become always-visible on coarse pointers.
11. **Friction-gate breathing** — `.breathe`'s easing family adopted by focus timers.
12. **3D entrances** — 150-300ms camera-dolly/node stagger, reduced-motion-gated.

## 6. The 12-point review gate

Every UI PR passes all twelve; tests are never weakened to pass (rule 13).

1. Contrast AA in **light and dark** for every text token, computed from resolved values.
2. One primary action per screen/state.
3. Touch targets ≥ 44px on coarse pointers, including icon buttons and inline rows.
4. `focus-visible` ring on every interactive element; no bare `outline-none`.
5. Loading / error / empty states present and honest; no `return null`; no
   `window.alert/confirm`.
6. Zero ghost classes (§3.4 vocabulary).
7. Zero raw hex / raw non-palette color utilities.
8. Motion lawful: reduced-motion + e-ink safe; transform/opacity; tokens; no
   `transition: all`; no scroll-jacking; GSAP per §5.7.
9. Kit-first; no new raw `.btn`/`<select>`/`<input>` strings; twice-repeated patterns
   kitted.
10. 360px: no horizontal page scroll; header actions wrap; nothing clipped.
11. Copy: specific labels, no slop words, errors name problem + recovery, sentence case.
12. Boundaries: `<Markdown>` for untrusted content; no raw `fetch`; nav from `nav.ts`;
    zod-surfaced server errors.

## 7. Provenance

| Contribution                                                                    | Source                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Anti-slop voice, one-system discipline, copy-tells, palette/type libraries      | `taste` (MIT)                                                                         |
| Operate-mode discipline, craft floor, refusal list                              | `impeccable` (Apache-2.0)                                                             |
| 120-rule searchable UX database, rule priority order                            | `ui-ux-pro-max` (MIT)                                                                 |
| Three-layer token architecture, state specs, theme application                  | `design-system` (MIT)                                                                 |
| Tailwind v4 wiring, ghost-vocabulary ban table                                  | `ui-styling` (MIT)                                                                    |
| Interface review checklists & findings format; HIG touch/deference              | `web-design-guidelines` (MIT)                                                         |
| Brief-first building, honest states, one memorable quality                      | `frontend-design` (Apache-2.0)                                                        |
| Motion craft: recipes, enter/exit asymmetry, confirm-in-place, review standards | `ui-animation` (MIT)                                                                  |
| Micro-interaction restraint, stagger discipline                                 | `emilkowalski-motion` (Apache-2.0)                                                    |
| Beat maps, choreography layers, defect-to-decision pairs                        | `motion-design` (Apache-2.0)                                                          |
| Audit → atomic fixes, fix priority                                              | `redesign-skill` (MIT)                                                                |
| Color scarcity, hairline borders, invisible motion                              | `minimalist-skill` (MIT)                                                              |
| Visual-audit axis                                                               | `design-review` (merged into `code-review`)                                           |
| OKLab color science, contrast math, tint-don't-gray                             | `color-expert` (merged into `taste`)                                                  |
| Prototype / spec-execution / review / agent-doc discipline                      | `prototype`, `implement-spec`, `code-review`, `writing-for-agents` (MIT, Matt Pocock) |
| GSAP engine knowledge                                                           | `gsap-*` family (MIT, GreenSock)                                                      |
| Repo laws: 360px, 44px, calm-by-default, kit-first, `<Markdown>`, no raw fetch  | `AGENTS.md`, `docs/ui-ux-map.md`                                                      |

**Resolved conflicts** (the opinions this document takes):

- **Danger hue: rose, not red.** DESIGN.md + the kit are the authority; red usages migrate.
- **Mode-scoped semantic text tokens over re-mapping the surface ramp.** Surfaces keep the
  tinted ramp; text gets mode-scoped roles.
- **Tinted grays over pure grays** — taste, minimalist and color-expert agree; the existing
  OKLab tint-mixed ramp already embodies it.
- **CSS-first motion; GSAP a justified exception** — the repo has zero JS-animation
  dependencies and a global reduced-motion kill-switch; gsap-core's "recommend GSAP by
  default" yields to that reality.
- **Earned familiarity over novelty** on Operate surfaces — impeccable's own Operate rules
  outrank its Experience-mode ambition, HIG deference agrees.
- **Visible affordances over hover-minimalism** — the minimalist protocol yields to touch
  reality (196 title-only tooltips are a defect, not restraint).
- **Micro-interaction ceiling 300ms** (DESIGN.md §8) with `--duration-slow` reserved for
  large surfaces, and exactly two sanctioned ambient loops.
