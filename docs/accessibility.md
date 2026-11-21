# Accessibility standards & WCAG 2.2 AAA Compliance

The accessibility architecture for Learning HUB. Sources of law:
[`AGENTS.md`](../AGENTS.md) §5, the ui-signature skill
(`.claude/skills/ui-signature/SKILL.md`) §2/§4/§6, and this specification.
Enforced continuously by unit and contract suites:

- `apps/web/tests/a11y-contract.test.ts` (wiring, skip links, reduced-motion, focus ring)
- `apps/web/tests/a11y-compliance.test.ts` (WCAG 2.2 AAA math, dialog primitives, live regions, roving tabindex, touch targets)
- `apps/web/tests/design-token-contrast.test.ts` (mathematical contrast lock across every palette)
- `packages/core/tests/a11y-wcag.test.ts` (core domain algorithms and state machines)

---

## 1. The 44px Touch Law

Every interactive element has a **≥44px touch target wherever the primary
pointer is coarse** (`@media (pointer: coarse)`), and nothing shrinks below
44px there — not icon buttons, not toggles, not sliders, not tabs, not inline controls:

- **Text buttons:** The global `.btn` / `.btn-ghost` / `.btn-secondary` classes
  grow to `min-height: 44px` on coarse pointers automatically.
- **Icon buttons:** Use kit **`<IconButton>`** — `size="lg"` is 44px
  everywhere, `size="md"` is 36px on fine pointers and 44px on coarse pointers,
  and `size="sm"` is 32px on fine pointers and 44px on coarse pointers.
- **Toggles & Switches:** Kit **`<Toggle>`** enforces a 44x44px touch bounding box
  surrounding the visual pill track.
- **Sliders:** Kit **`<Slider>`** enforces `[@media(pointer:coarse)]:h-11` on range tracks.
- **Tabs:** Kit **`<Tabs>`** enforces `[@media(pointer:coarse)]:min-h-11` on every tab button.
- **Form Controls:** `TextField`, `TextArea`, and `SelectField` provide standard touch clearance.

---

## 2. Focus-Visible Standard (WCAG 2.2 SC 2.4.7)

Every interactive element displays the identical, mode-aware focus ring when keyboard-focused —
never bare `outline-none` without this replacement (enforced across all kit components):

```css
focus-visible:ring-2 focus-visible:ring-(--ac-strong)
focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)
```

Transitions stay strictly on `transition-colors` — `transition-all` is banned
(ui-signature §3.6). Press feedback is `active:scale-[0.98]`.

---

## 3. WCAG 2.2 AAA Contrast Invariant (SC 1.4.3 & SC 1.4.6)

All UI elements adhere to strict contrast floors evaluated via OKLab mathematical mixing
(`@learning-hub/core/design-tokens`):

| Category                  | Level AA Minimum | Level AAA Minimum | Implementation                                           |
| ------------------------- | ---------------- | ----------------- | -------------------------------------------------------- |
| **Normal Body Text**      | 4.5:1            | **7.0:1**         | Mode-scoped tokens `--text-strong`, `--text-body`        |
| **Large / Heading Text**  | 3.0:1            | **4.5:1**         | Mode-scoped tokens `--text-secondary`, `--text-tertiary` |
| **Status Text**           | 4.5:1            | **7.0:1**         | `--danger-text`, `--status-*-text`                       |
| **UI Components & Icons** | 3.0:1            | **3.0:1**         | `--hub-border`, `--ac-strong`, active indicators         |

The contrast lock unit test (`apps/web/tests/design-token-contrast.test.ts`) verifies every mode
and every palette (calm, forest, ocean, sunset, blossom, midnight) to eliminate silent regression.

---

## 4. Skip Link & Landmarks (WCAG 2.2 SC 2.4.1)

`AppShell` renders a **"Skip to content"** link (`<SkipLink>`) as the very first focusable element
(`apps/web/src/components/AppShell.tsx`). It is `sr-only` until focused, then appears
top-left with the focus-visible ring and points directly at `<main id="main-content" tabIndex={-1}>`:

- Programmatic focus lands smoothly on `<main>`.
- The next Tab keystroke immediately enters page content, bypassing all sidebar and navigation chrome.
- Navigation landmarks must never precede the skip link in DOM order.

---

## 5. Radix UI Primitive Compliance & Dialog Semantics (WCAG 2.2 SC 2.1.2)

Modal dialogs use the kit **`<Modal>`** component, which provides:

1. **Semantic Roles:** `role="dialog"` or `role="alertdialog"` with `aria-modal="true"`.
2. **Label Binding:** `aria-labelledby` linked to `<h2>` title; `aria-describedby` linked to subtitle.
3. **Focus Containment:** `<FocusTrap>` captures Tab / Shift+Tab within the modal boundary.
4. **Focus Restoration:** Restores focus to the trigger element when the dialog closes.
5. **Escape Dismissal:** Escape key dismisses the dialog and returns focus immediately.
6. **Scroll Lock:** Locks `document.body` scroll while open, preventing background scroll bleed.
7. **Accessible Dismissal:** Integrated 44px `<IconButton>` close button.

---

## 6. Screen-Reader Friendly Flashcard Flip Transitions

Spaced repetition flashcards use **`<AccessibleFlashcard>`** to provide seamless access:

1. **Accessible Region:** `role="region"`, `aria-roledescription="flashcard"`, and dynamic `aria-label`
   (e.g., `"Card 1 of 10: Question side"`).
2. **Synchronized ARIA Live:** Flips broadcast polite announcements via `useAnnounce`:
   - _"Showing question: [Prompt]"_
   - _"Card flipped to answer: [Answer]"_
3. **Inert Face Protection:** The hidden face is marked `aria-hidden="true"`, preventing screen
   readers from reading the answer before the learner has retrieved it.
4. **Reduced Motion Adaptation:** Under `prefers-reduced-motion: reduce`, the 3D flip animation
   is bypassed in favor of an instantaneous opacity/visibility swap.
5. **Keyboard Hotkeys:** Space or Enter toggles the card; 1-4 records FSRS grades.

---

## 7. Roving Tabindex Composite Widgets (WCAG 2.2 SC 2.1.1)

Composite interactive widgets (tablists, toolbars, radio groups) use **`<KeyboardNavGroup>`**:

- Only the currently active element is reachable via Tab (`tabIndex={0}`).
- Peer elements carry `tabIndex={-1}` and are reached via Arrow keys.
- Disabled items are automatically skipped during directional navigation.
- Home jumps to the first enabled item; End jumps to the last enabled item.
- Orientation (`horizontal`, `vertical`, or `both`) constrains arrow handling cleanly.

---

## 8. Global ARIA Live Announcer (WCAG 2.2 SC 4.1.3)

`AppShell` provides `<LiveAnnouncerProvider>` with dual dedicated live regions:

- `id="a11y-live-polite"`: `role="status"`, `aria-live="polite"`, `aria-atomic="true"`
- `id="a11y-live-assertive"`: `role="alert"`, `aria-live="assertive"`, `aria-atomic="true"`

Components trigger announcements via `useAnnounce()`:

```tsx
const announce = useAnnounce()
announce('Review batch completed. 25 cards mastered.', 'polite')
```

- Deduplication suppresses identical messages within a 1.5s window.
- Urgent notices (`priority="assertive"`) take precedence in the queue.
- Live announcements are reserved for meaningful state transitions (never rapid 1Hz timer ticks).

---

## 9. Reduced-Motion Policy

Two mandatory layers:

1. **CSS Kill-Switch** (`apps/web/app/globals.css`): under `@media (prefers-reduced-motion: reduce)`,
   all animations and transitions are forced to `0.01ms`.
2. **JS Motion Hook** (`apps/web/src/lib/useReducedMotion.ts`): JavaScript animations, GSAP
   sequences, and 3D camera dollies check `useReducedMotion()` and drive durations to 0.

---

## 10. Checklist for PR Authors

Before submitting UI changes:

- [ ] Contrast: text tokens pass AA (4.5:1) and AAA (7:1) in both light and dark modes.
- [ ] Hit footprint: every interactive element is ≥44px on coarse pointers (`[@media(pointer:coarse)]`).
- [ ] Focus ring: interactive elements carry standard `focus-visible:ring-2` on `--ac-strong`.
- [ ] No bare `outline-none`.
- [ ] Modals and sheets use `<Modal>` or `<Sheet>` with focus containment.
- [ ] Screen-reader names on all icon buttons (`<IconButton label="...">`).
- [ ] Forms pair labels with inputs (`<TextField>`, `<TextArea>`, `<SelectField>`).
- [ ] Vitest accessibility suites pass:
  - `npm run test -- --run tests/a11y-contract.test.ts`
  - `npm run test -- --run tests/a11y-compliance.test.ts`
  - `npm run test -- --run tests/design-token-contrast.test.ts`
