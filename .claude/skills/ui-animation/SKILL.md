---
name: ui-animation
description: Implement, review, and debug UI motion — springs, gestures, drag, easing, CSS transitions, keyframes. Sweeps an interface for the moments that would genuinely benefit from motion, and reviews animation code against ten standards with a Block/Approve verdict. Carries a library of transition recipes and component patterns.
license: MIT
---

> Source: https://github.com/mblode/agent-skills (open-design/skills/ui-animation) — vendored & adapted 2026-11-18. MIT license (upstream declares MIT).
>
> Adaptation notes: the OpenDesign host-context block is removed. The reverse-engineering
> branch (screen-recording measurement scripts: `extract_frames.py`, `track_motion.py`,
> `fit_curves.py` and their references) is not vendored — this repo has no builds/dev servers
> to record against (AGENTS.md rule 17). The craft core, recipes and review standards are
> intact under `references/`. Motion One/Framer imports are irrelevant here: this repo uses
> CSS transitions first and GSAP (see `gsap-*`) for sequencing.

# UI Animation

**IS:** designing, implementing, reviewing, debugging UI motion (springs, gestures, drag,
easing, CSS transitions, keyframes), sweeping an interface for the moments that would
genuinely benefit from motion, and reviewing animation code.
**IS NOT:** choosing overall visual direction, palettes, or typography (use `taste`,
`frontend-design`), or sequencing multi-beat stories (use `motion-design`).

## Reference files

| File | Read when |
| --- | --- |
| [references/decision-framework.md](references/decision-framework.md) | Default: deciding whether/why to animate, picking easing character; the Discovery sweep ("where should this animate") |
| [references/spring-animations.md](references/spring-animations.md) | Spring physics, configuring spring params, Apple damping/response values, asymmetric open/close character, interruption mechanics |
| [references/component-patterns.md](references/component-patterns.md) | Buttons, toasts, crossfades, list stagger and removal, hover, step forms, layout morphs and auto height, 3D |
| [references/clip-path-techniques.md](references/clip-path-techniques.md) | clip-path for reveals, tabs, hold-to-delete, comparison sliders |
| [references/gesture-drag.md](references/gesture-drag.md) | Drag, swipe-to-dismiss, momentum, pointer capture, velocity handoff, detents, carousel `touch-action` |
| [references/scroll-animations.md](references/scroll-animations.md) | Scroll-triggered reveals, scrubbed/scroll-driven animation, parallax — and when a scroll animation shouldn't exist |
| [references/performance-deep-dive.md](references/performance-deep-dive.md) | Jank, CSS vs JS, WAAPI, CSS variables trap |
| [references/debugging-symptoms.md](references/debugging-symptoms.md) | An animation feels off and the cause isn't named: symptom-indexed tables for sluggish, robotic, cheap, jumpy, misfiring motion |
| [references/svg-animation.md](references/svg-animation.md) | Animating vector art: line drawing (`stroke-dashoffset`), SVG transform-origin traps, path morphing, ambient life |
| [references/review-format.md](references/review-format.md) | Reviewing animation code: ten standards, Before/After/Why table, Block/Approve verdict |
| [references/contextual-animations.md](references/contextual-animations.md) | Contextual icon swaps, word-level stagger entrances, peripheral de-emphasis, fixed-offset exits |
| [references/transition-recipes.md](references/transition-recipes.md) | Installing a CSS transition: container morph, card resize, badge, dropdown, modal (with `@starting-style`), panel/drawer, page slide, icon swap, number pop-in, odometer roll, text swap, success, error shake |
| [references/choreography.md](references/choreography.md) | Multi-element/multi-phase motion: staggers, blur-before-move, per-edge settling |
| [references/vocabulary.md](references/vocabulary.md) | Naming a motion effect the user describes vaguely ("what's it called when…") |
| [references/interface-sfx.md](references/interface-sfx.md) | Sparse interface sound policy (this repo: haptics exist; sound is off by default) |

## Core rules

- Animate for **feedback, orientation, continuity, or deliberate delight**. If it's just "it
  looks cool" and the user sees it often, don't.
- Keep keyboard focus and repeated navigation immediate. A state transition may animate only
  if focus and task completion do not wait for it.
- Prefer CSS transitions for interruptible UI: keyframes restart from zero on interruption,
  transitions retarget. Use keyframes only for predetermined sequences. Implementation
  priority: **CSS transitions > WAAPI > CSS keyframes > JS (rAF)** — and above all of them,
  GSAP only for what CSS can't do (see `ui-signature` motion law).
- **Asymmetric timing:** occasional interactions can enter slightly slower, exit fast.
  High-frequency ephemeral UI (hover highlights, popovers, panel toggles) inverts this:
  enter instantly (0ms), exit with a brief fade (100–150ms) so the action feels immediate.
- Tappable controls press on `:active` at 0ms and set `touch-action: manipulation`.
- Use `@starting-style` for DOM entry; fall back to a `data-mounted` attribute where
  unsupported.
- A small `filter: blur(2px)` hides rough crossfades between swapped content.

## Motion design principles

- **Continuity over teleportation.** Elements visible in both states transition in place;
  expand from where elements sit rather than fading in a new instance. Never duplicate a
  persistent element or hard-cut between views that share components.
- **Directional motion matches position.** Tab and carousel transitions animate in the
  direction matching spatial layout.
- **Emerge from the trigger.** Overlays, trays, and panels animate outward from the element
  that opened them; generic centre-screen entrances break spatial orientation.
- **Confirm in place, not in a corner.** An action's result belongs on the control that
  caused it: the button becomes "Copied", holds, and reverts. Reserve corner toasts for
  results with no on-screen origin. (This repo: the Toast kit is for background results;
  grade-commit feedback belongs on the grade button.)
- **Animate paired states together.** If open animates, close animates. If hover has motion,
  focus and pressed states get equivalent feedback. Do not polish only one half of a repeated
  interaction.
- **Delight scales inversely with frequency.** Rarer interactions get more personality;
  high-frequency actions must be invisible. (Review grading happens thousands of times —
  grade feedback must be felt, not watched.)
- **Motion enhances perceived speed.** Smooth transitions feel faster than hard cuts.

## What to animate

- Movement: `transform` and `opacity` only; they skip layout and paint.
- State feedback: `color`, `background-color`, and `opacity` are acceptable.
- Never animate layout properties (`width`, `height`, `top`, `left`); they trigger layout
  recalc every frame. (Exception: a deliberate container tween.)
- Never use `transition: all`; it animates unintended properties and silently adopts future
  ones. List them explicitly. **This repo has 233 `transition-all` uses — the sweep to fix
  them is part of the UI plan.**
- Avoid `filter` animation for core interactions; if unavoidable keep blur ≤ 20px.
- SVG: apply transforms on a `<g>` wrapper with `transform-box: fill-box;
  transform-origin: center`.
- `transform: scale()` also scales children (icons, text, borders) — a feature for press
  feedback, but account for it when an inner element must stay fixed-size.
- Disable transitions during theme switches (`[data-theme-switching] * { transition: none
  !important }`), or every themed property animates at once.

## Easing defaults

| Element | Duration | Easing |
| --- | --- | --- |
| Button press feedback | 100-160ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Tooltips, small popovers | 125-200ms | `ease-out` or enter curve |
| Dropdowns, selects | 150-250ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Modals, drawers | 200-350ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Move/slide on screen | 200-300ms | `cubic-bezier(0.25, 1, 0.5, 1)` |
| Page transitions | 250-400ms | enter or move curve |
| Hover (colour/opacity), one control | 200ms | `ease` |
| Hover (transform/scale) | 100-150ms | enter curve |
| Illustrative/marketing | Up to 1000ms | Spring or custom |

Keep routine UI under 300ms; scale duration with distance (a full-screen slide can exceed
300ms, a 6px tooltip shift stays under 150ms). **In this repo these resolve to the motion
tokens** (`--duration-fast/base/slow`, `--ease-out-quart` etc.) — never hand-type raw values
in new code.

**Named curves**

- **Enter:** `cubic-bezier(0.22, 1, 0.36, 1)` for entrances and transform-based hover
- **Move:** `cubic-bezier(0.25, 1, 0.5, 1)` for slides, drawers, panels
- **Drawer (iOS-like):** `cubic-bezier(0.32, 0.72, 0, 1)` (extremely steep start; the reason
  its 500ms doesn't read as slow)
- **Expo out:** `cubic-bezier(0.19, 1, 0.22, 1)` for dramatic reveals, card hovers, text reveals
- **Press:** `cubic-bezier(0.25, 0.46, 0.45, 0.94)` for button press feedback

Avoid `ease-in` for UI: it starts slow, so the element lags the user's action and feels
sluggish.

## Transition decision rules

Match the UI element first, then pick the recipe from
[references/transition-recipes.md](references/transition-recipes.md):

| UI pattern | Recipe |
|---|---|
| Trigger + floating dot/count | Notification badge |
| Trigger grows into the surface it opens | Container morph |
| Trigger + anchored surface | Menu dropdown |
| Centred surface on top of page | Modal dialog |
| Panel sliding into existing container | Panel reveal |
| List ↔ detail or wizard steps | Page side-by-side slides |
| Element dimension changes | Card resize |
| Text updating in place | Text state swap |
| Two icons in same slot | Icon swap |
| Number arriving on its own | Number pop-in |
| Number the user is driving | Odometer digit roll |
| Confirmation / success moment | Success celebration |
| Form validation error | Error state shake |

Prefer lower-overhead transitions (CSS-only) unless the design requires JS orchestration.

## Spatial and sequencing

- Popover `transform-origin` at the trigger (modals stay `center`); dialog/menu entrances
  from `scale(0.9-0.96)` not `scale(0)`; 30-50ms staggers (total under 300ms, most important
  element leading).
- **Paired elements rule:** elements that animate together (modal + overlay, tooltip + arrow)
  must share easing and duration. Mismatched timing is the usual cause of "something feels
  off".

## Accessibility

- Gate hover (motion and paint) behind `@media (hover: hover) and (pointer: fine)`; Tailwind
  v4 already wraps `hover:` in `@media (hover: hover)`.
- During direct manipulation, keep the element locked to the pointer with no easing; add
  easing only after release.
- Reduced motion: replace spatial travel with immediate state changes or restrained fades.
  Keep explicit user-triggered feedback. **This repo already has a global reduced-motion
  kill-switch (`globals.css`) and an e-ink kill-switch — respect both; never fight them with
  JS-driven animation that ignores the media query** (branch on the `useReducedMotion` hook
  for JS animation).

## Performance

- Pause looping animations off-screen with `IntersectionObserver`; they burn GPU even when
  invisible.
- Toggle `will-change` only during heavy motion and only for `transform`/`opacity`; remove it
  after.
- Do not animate drag via CSS variables on a container; every update recalculates styles for
  all children. Set `transform` directly on the moving element.
- Motion that janks only sometimes (on open, during navigation, while data lands) is usually
  a long task sharing the tick. Don't start an animation and expensive work in the same tick.

## Anti-patterns

- Animating on mount without a user trigger: unexpected motion disorients.
- Hard stops on drag boundaries feel broken; apply friction/damping.
- Animating both a container and staggering its children: pick one entrance per container.
- Tooltip animation after the first is open: subsequent tooltips in the group open instantly.
- Scroll-revealing product UI, above-the-fold content, or every section of a page: scroll
  reveals belong to a few chosen moments on marketing surfaces, run once, and never
  re-animate on scroll-up. **Product pages here get none.**
- Easing or duration on scrubbed (scroll-driven) motion: scroll position is the clock, so
  `linear` and no duration is correct there, and only there.
- Reduced motion handled only in CSS: JS-driven animations ignore a
  `@media (prefers-reduced-motion)` block, so the CSS gate passes review while spatial travel
  still plays. Branch on the hook. The opposite overcorrection — a global
  `* { transition: none !important }` — also strips the opacity and colour feedback that
  reduced motion keeps.

## Workflow

1. Answer the four questions in `references/decision-framework.md`: animate? purpose? easing? speed?
2. Pick duration from the easing defaults table above, mapped onto the repo's motion tokens. If the value is contested, note it and keep the token — token drift is worse than a slightly-off curve.
3. Choose implementation: CSS transition > WAAPI > spring > keyframe > JS/GSAP.
4. Load the reference for your component or technique.
5. When reviewing, apply the strict posture in `references/review-format.md`: measure against the ten standards, output the Before/After/Why table, then a tiered verdict ending in a Block/Approve decision.

## Validation

Produce evidence for each check (code-level, not "looks fine" — no builds allowed here):

- Grep the diff for layout property transitions (`width`, `height`, `top`, `left`) and `transition: all`.
- Reason through rapid re-triggering: do transitions retarget instead of restarting from zero?
- Confirm `will-change` is toggled around animations, not permanently set, and looping
  animations pause off-screen.
- Honor `prefers-reduced-motion`: verify the CSS kill-switch covers it and JS animation
  branches on the hook. Exercise the same task in that mode by reading the code path.
