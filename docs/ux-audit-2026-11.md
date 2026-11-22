# UX Audit — 2026-11 (motion-pass follow-up)

Evidence-based audit of `apps/web` performed after the motion pass (PR #106): a
3-agent read of the design tokens, kit, shell, dashboard, review, settings,
studios and mobile patterns, followed by an implementation sweep on the page
layer. This document records **what was found**, **what this branch fixed**
(page/component layer only), and the **kit-layer fix-list** that remains for the
design-system owner (`src/ui/**` + `globals.css` are deliberately untouched by
this branch — see "Ownership" in the PR).

Severity scale: 🔴 high (visible breakage / AA / honesty), 🟡 medium, ⚪ low.

---

## 1. Fixed in this branch (page + `src/components` layer)

| Finding                                                                                                                                                                    | Sev | Fix                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** Dashboard stat tiles render bare — `StatCard` default `variant="glass"` maps to the retired `.panel-glass` class (`src/ui/StatCard.tsx:49,66` vs `globals.css:744`) | 🔴  | All dashboard call sites now pass `variant="elevated"` explicitly. Kit default still broken → kit fix-list §3.1                                                                                                           |
| **T6** Grade buttons fail WCAG AA — raw 600-step fills (white on `emerald-600` ≈ 3.1:1)                                                                                    | 🔴  | Review grade fills moved to the AA-aliased 500 steps (`bg-rose-500`/`bg-amber-500`/`bg-emerald-500` = `--danger-strong`/`--status-*-strong`, AA-locked by token tests)                                                    |
| **Y1** 10–11px micro-type as primary data (1,182 uses app-wide)                                                                                                            | 🔴  | Every scan-critical `text-[10px]`/`text-[11px]` on page/`src/components` layer bumped to `text-xs`; hierarchy via `text-tertiary`/`text-faint`, not size                                                                  |
| **D1** Dark-hardcoded styles leak into light mode (8+ pages)                                                                                                               | 🔴  | `text-neutral-100/200`, `bg-neutral-900/800`, `slate-*` surfaces → token classes on every page. Intentional dark surfaces (3D viewports, night-mode sleep screen, mind-map canvas) scoped with `dark`-class or documented |
| **S3** Timeline/Insights widget queries fail silently (no `isError` branch)                                                                                                | 🔴  | Skeleton + `Callout tone="danger"` branches added                                                                                                                                                                         |
| **S6** Notes delete fires immediately                                                                                                                                      | 🔴  | `AlertDialog` (destructive) — same pattern applied to deck/card delete, reset-weights, plan removal, habit/goal delete, canvas/palace/dependency/friend removal, backup import-overwrite, FSRS reset                      |
| **M3** Sub-44px tap targets (settings presets, notes rows, shell group headers)                                                                                            | 🔴  | `[@media(pointer:coarse)]:min-h-11` guards + ChipPicker kit-native targets                                                                                                                                                |
| **M7** Tablet rail dumps all 81 nav items                                                                                                                                  | 🔴  | Rail groups now collapsible (`lh-rail-collapsed-v2`), auto-expand on active                                                                                                                                               |
| **L1** Container-width anarchy (7 widths; studio `max-w-6xl` unreachable inside shell's `max-w-5xl`)                                                                       | 🔴  | Double page padding + dead caps removed; single `space-y-5` rhythm                                                                                                                                                        |
| **L6** Settings = unbounded stack, no scanning scaffold                                                                                                                    | 🔴  | Sticky "Jump to" anchor chips + section ids + `scroll-mt`; 4 low-frequency sections in Accordion                                                                                                                          |
| **L7** Three save models on one page (silent non-persist Quick-HUD/Anki, instant-save World, global Save)                                                                  | 🔴  | Quick-HUD/Anki → localStorage (device-local, documented); World instant-save → explicit toasts; every save path gives visible feedback                                                                                    |
| **L3** Dashboard led with a widget above the page title                                                                                                                    | 🟡  | PageHeader first                                                                                                                                                                                                          |
| **G4** Heatmap/forecast/energy data exposed only via `title`                                                                                                               | 🟡  | `role="img"` + `aria-label` per cell/bar; EnergyBar `aria-label`                                                                                                                                                          |
| **S4** OpenLoops vanishing empty state                                                                                                                                     | 🟡  | Compact kit `EmptyState`                                                                                                                                                                                                  |
| **C6** 5 hand-rolled "choose one" patterns with divergent active styles                                                                                                    | 🟡  | `ChipPicker` component; 12+ call sites converted (search kinds, world theme/categories, raid bosses, view switchers, dopamine filter, provider/palette/identity/camera/Quick-HUD)                                         |
| **C7** Section eyebrows ×3 styles, icon tiles ×11, metric grids, unkit-ized                                                                                                | 🟡  | `SectionHeader`, `IconTile`, `KeyMetricRow` components adopted                                                                                                                                                            |
| **R-setup** Review setup = one dense panel, CTA buried                                                                                                                     | 🟡  | Grouped steps + isolated full-width primary CTA                                                                                                                                                                           |
| **R-coherence** Overlay without Escape/focus-trap in the highest-stakes flow                                                                                               | 🟡  | New clay `Dialog` (Radix)                                                                                                                                                                                                 |
| **S5** Review summary discards per-card results                                                                                                                            | 🟡  | `SessionRecap` (misses first, capped)                                                                                                                                                                                     |
| **S8** Fabricated cognitive-load inputs (hardcoded 35/10)                                                                                                                  | 🟡  | Honest `loadReadout` derived from actual session data                                                                                                                                                                     |
| **M5** Tab labels via `label.split(' ')[0]`                                                                                                                                | ⚪  | `shortLabel` field in nav.ts                                                                                                                                                                                              |
| **M4** Reorder chrome unreachable by keyboard                                                                                                                              | 🟡  | (page layer) `group-focus-within`                                                                                                                                                                                         |
| **T2** Two competing focus-ring systems on page layer                                                                                                                      | 🟡  | New components use the single `focus-visible:ring-(--ac-strong)` law                                                                                                                                                      |
| **G5** Emoji-as-semantics                                                                                                                                                  | ⚪  | lucide icons in UI chrome (user-data emoji in journal kept)                                                                                                                                                               |

**Component layer added** (`src/components/ui`, shadcn-pattern composition,
clay-restyled, Radix-powered): `lib.ts` (`cn`), `dialog`, `alert-dialog`,
`dropdown-menu`, `tooltip`, `popover`, `accordion`, `chip-picker`,
`section-header`, `icon-tile`, `key-metric-row`. Motion: framer entrances +
`useGsapReveal` (ScrollTrigger) + `useGsapCountUp`; every animation gated by the
synchronous `motionOK()` (reduced-motion + e-ink).

**Per-page motion mandate**: every page now carries a framer entrance (motion
pass) **and** one GSAP moment (ScrollTrigger reveal or count-up), single
animation-owner per element.

**Library strategy** (user-selected): shadcn copy-in sources restyled to the
clay token system — the banned `bg-card`/`text-muted-foreground`-family
vocabulary (`design-laws.test.ts`) is rewritten to repo utilities at copy-in
time. HeroUI v3 was evaluated: it requires `@import "@heroui/styles"` inside
`globals.css` (the only Tailwind v4 entry) — off-limits under the ownership
split — so its interaction/animation patterns were adopted as reference while
the package itself is not installed. If the kit layer is ever merged, enabling
HeroUI is a one-line follow-up.

---

## 2. Verified constraints (kept green)

- `design-laws.test.ts` — zero ghost classes / `red-*` / unknown `animate-*` / `transition-all` on the touched layer (grep-swept per task).
- `a11y-contract.test.ts` — AppShell's pinned literals preserved verbatim.
- `route-safety.test.ts` — no href removals, transport-wrapper-only calls.
- SSR contract — every integration test renders final-state HTML; wrappers only, no hidden initial styles.
- Local gate: `typecheck` + `lint` + `format:check` green after every task commit (rule 17).

---

## 3. Kit-layer fix-list (for the design-system owner — untouched here)

1. **`StatCard` default variant is broken** — `glass: 'panel-glass p-4'` references the retired `.panel-glass`. Either restore a fallback or change the default to `standard`. Same dead class referenced by `CognitiveLoadMeter.tsx:64`, `LeitnerBox.tsx:81`, `MetacognitionRadar.tsx:75`, `SleepConsolidationHUD.tsx:47`.
2. **Elevation scale missing** — only 3 ad-hoc shadows (`--clay-shadow`, `-sm`, `--pressed`); no `--clay-shadow-lg`; `.panel-elevated:hover` hardcodes an indigo glow that ignores the 6 palettes (`rgba(79,70,229,0.2)` on forest/ocean/sunset/blossom/midnight). Derive from `--tint`.
3. **Token gaps** — no spacing scale (`--space-*`), no type-scale tokens, no container-width tokens, no focus-ring token (two ring systems coexist: `outline: var(--ac-text)` global vs `ring-(--ac-strong)` components).
4. **`--danger-soft` / `--ac-soft` lack `.dark` overrides** (light pastels in dark mode).
5. **E-ink incompleteness** — `html.theme-e-ink` whitewashes `.panel` but not `.panel-elevated`, `.clay-peach/blue/mint/lilac` (pastel gradients still render in monochrome mode).
6. **Dark clay pastels too faint** — `.dark .clay-*` are 7–14% alpha washes; the Daily Loop tiles lose their identity in dark mode.
7. **Badge dead variants** — `violet`/`cyan` tones render identically to `accent`/`success`.
8. **Button has no size prop** — callers hand-roll `h-11 px-6 text-base` per site; grade buttons bypass the kit color system (now AA-fixed at call site, but kit-level grade tokens would prevent recurrence).
9. **Field/Toggle/Slider adoption** — now done in settings; other heavy-form surfaces (kit consumers in `src/ui` HUDs) may still bypass.
10. **Micro-type inside kit** — `text-[10px]`/`text-[11px]` remain in HUD components (out of this branch's reach); same 12px floor should apply.
11. **Dark-hardcoded HUDs** — `SleepConsolidationHUD.tsx:63,106` leaks light-mode values.
12. **`viewport.themeColor` hardcodes `#fafafa`/`#0a0a0b`** (`layout.tsx`) — matches no token; derive from `--hub-bg`.
13. **`Sheet.tsx` was missing the default `import React`** — with the modern JSX transform off in the kit's tsconfig, every `Sheet` consumer (15+ surfaces: dialogs, the task detail panel, repeat/reminders dialogs) crashed on SSR render. W1 fixed it on `feature/mega-run` (default `import React` restored at the top of `src/ui/Sheet.tsx`); the kit owner should KEEP that fix when merging — and grep the other kit files for the same omission (`src/ui/*.tsx` with JSX but no React import).

## 4. Known remaining gaps (deliberate scope decisions)

- `QuickHudModal` is fixed, but a full HUD-component audit (~80 `src/ui/*HUD.tsx`) is kit-owner territory.
- ChipPicker keyboard roving (arrow keys) is documented as a future add without API break.
- `notifications`/`permissions` pages are thin wrappers — their center components live in `src/components` and only received the earlier motion pass (not the quality sweep; their internals were outside the page-layer split to avoid cross-agent file collisions).
- Nav IA taxonomy (81 destinations, 36-item studios group) was deliberately left intact — presentation (collapse, short labels, active pill) was improved; re-architecture is a product decision, not a styling one.
