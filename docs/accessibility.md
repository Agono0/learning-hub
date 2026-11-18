# Accessibility standards

The rules every UI change in `apps/web` must satisfy. Sources of law:
[`AGENTS.md`](../AGENTS.md) §5, the ui-signature skill
(`.claude/skills/ui-signature/SKILL.md`) §2/§4/§6, and this file. The
mechanical half is pinned by `apps/web/tests/a11y-contract.test.ts` (runs in
CI).

## The 44px touch law

Every interactive element has a **≥44px touch target wherever the primary
pointer is coarse** (`@media (pointer: coarse)`), and nothing shrinks below
44px there — not icon buttons, not toggles, not inline rows. On fine pointers
(mouse) compact sizes (36–40px) are allowed for dense surfaces.

- Text buttons: the global `.btn` / `.btn-ghost` / `.btn-secondary` classes
  grow to `min-height: 44px` on coarse pointers automatically.
- Icon-only buttons: use the kit **`<IconButton>`** — `size="md"` is 44px
  everywhere, `size="sm"` is 36px on fine pointers and 44px on coarse pointers.
- Never hand-roll `grid h-9 w-9 place-items-center` buttons; that pattern is
  how the law got broken (see "retiring hand-rolled buttons" below).

## Focus-visible standard

Every interactive element shows the same focus ring when keyboard-focused —
never `outline-none` without this replacement (LeitnerBox was the first
implementation; every kit component carries it):

```
focus-visible:ring-2 focus-visible:ring-(--ac-strong)
focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)
```

Transitions stay on `transition-colors` — `transition-all` is banned
(ui-signature §3.6). Press feedback is `active:scale-[0.98]`.

## Skip link

`AppShell` renders a **"Skip to content"** link as the first focusable element
(`apps/web/src/components/AppShell.tsx`). It is `sr-only` until focused, then
appears top-left in the primary-button style with the focus-visible ring, and
points at `<main id="main-content" tabIndex={-1}>` — the `tabIndex={-1}` lets
the programmatic focus land so the next Tab continues inside the content, not
back through the sidebar. Keep it first; do not wrap navigation before it.

## Screen-reader discipline

- **Icon-only buttons need an accessible name.** With `<IconButton>` the
  required `label` prop becomes the `aria-label`; the glyph is rendered
  `aria-hidden`. Never ship an unlabeled icon button.
- **State goes in attributes, not pixels:** `aria-expanded` on disclosure
  triggers, `aria-busy` while loading, `aria-current` on nav items.
- **`aria-live` is for meaningful async changes only** — toasts
  (`role="status"`/`role="alert"` via the kit `Toast`), honest warnings like the
  `StorageWarning`. Never announce a value that updates every second.
- **The timer clock is deliberately NOT live.** A 1Hz-updating clock read
  aloud every second is unusable, not helpful; the countdown text is there for
  glancing, and the timer's state changes (start/finish) surface through other
  channels. Do not add `aria-live` to it.
- Decorative glyphs and duplicated visual badges (`aria-hidden`) must not be
  announced — the accessible name carries the information once (the
  notification bell's count lives in its label, not in the badge).

## Icon + text pairing (color is never the only signal)

Color alone never carries meaning (WCAG 1.4.1): pairs like the notification
bell's badge + count-in-label, tone colors + distinct copy, status dots +
text. When you add a status color, add the non-color channel (icon, label, or
text) in the same change.

## Reduced-motion policy

Two layers, both mandatory to keep:

1. **CSS kill-switch** (`apps/web/app/globals.css`): under
   `@media (prefers-reduced-motion: reduce)` every animation and transition is
   forced to ~0 duration. This covers all CSS motion automatically.
2. **JS motion must not rely on the kill-switch alone** (ui-signature §5.7):
   any JavaScript-driven animation gates on the `useReducedMotion` hook
   (`apps/web/src/lib/useReducedMotion.ts` — SSR-safe, live-updates with the
   OS setting) and skips or shortens itself when the user prefers reduced
   motion.

**Audit result (PR feat/a11y-overhaul):** the `setInterval` sweep found no
purely decorative JS motion to guard. Every interval in `apps/web/src` drives
state or feedback, not decoration: exam/countdown timers
(`AdaptiveExamStudio`, `DualProcessStudio`), the 60s relative-time tick
(`NotificationCenter`), reminder scheduling (`platform/reminders.ts`), socket
heartbeats (`online-socket.ts`), audio cue replay
(`SleepConsolidationStudio`), simulated HRV data (`BreathingCoherenceStudio`),
the pedagogical emergence-simulation ticker (`OntologicalShiftStudio`), and
ambience audio (`three/SceneManager.ts`). The 3D canvas surfaces gate motion
per ui-signature §5.8. If you add decorative JS motion (count-ups, canvas
effects, choreography), gate it with `useReducedMotion` and note it here.

## Retiring hand-rolled icon buttons with IconButton

`<IconButton label="…" icon={<X className="h-5 w-5" />} />` replaces the
hand-rolled `grid h-N w-N place-items-center` pattern and adds, in one place:
the accessible name, the focus-visible ring, the ≥44px coarse-pointer target,
the loading state, and the press scale. Migrated so far:

| Call site                             | Button                      | Label kept                         |
| ------------------------------------- | --------------------------- | ---------------------------------- |
| `src/components/NotificationBell.tsx` | bell dropdown trigger (9x9) | `Notifications (N need attention)` |
| `src/components/PermissionNudge.tsx`  | dismiss X                   | `Stop suggesting {title}`          |
| `src/ui/Sheet.tsx`                    | sheet close X               | `Close`                            |
| `src/ui/exercises/inputs.tsx`         | reorder Move up / Move down | `Move up` / `Move down`            |

To migrate more: replace the raw `<button>` with `<IconButton>` carrying the
existing `aria-label` as `label`, move the glyph into `icon`, keep any
`onClick`/`disabled`/`aria-*` props, pick `size="sm"` only when the old button
was ≤36px, and delete the hand-rolled `className`. The remaining ~50 raw icon
buttons (mostly in AppShell chrome and studio HUDs) are follow-up work; the
a11y contract test fails if a migrated call site regresses to the raw pattern.
