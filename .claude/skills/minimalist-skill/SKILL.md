---
name: minimalist-skill
description: Premium utilitarian minimalism — clean editorial-style interfaces, typographic contrast, flat structures, color as a scarce resource, motion that feels invisible. Use when a surface feels cluttered, over-decorated, or noisy and needs to be stripped to a disciplined minimum.
---

> Source: https://github.com/Leonxlnx/taste-skill (open-design/skills/minimalist-skill) — vendored & adapted 2026-11-18. MIT license (Leonxlnx).
>
> Adaptation notes: this is a **protocol**, written for greenfield marketing/editorial pages.
> Where the protocol's absolutism conflicts with the repo's committed world (system-ui fonts,
> Tailwind default shadows, existing kit), **the repo wins** — flagged inline as [repo]. The
> discipline survives; the dogma is re-scoped.

# Protocol: Premium Utilitarian Minimalism UI

An engineering directive for generating highly refined, ultra-minimalist,
"document-style" interfaces: high-contrast restrained palette, bespoke typographic
hierarchies, meticulous macro-whitespace, ultra-flat component architecture with deliberate
muted accents. It actively rejects generic SaaS design trends. For Learning HUB this is the
discipline behind "Calm by default" — not a new skin.

## 1. Absolute negative constraints (banned elements)

- DO NOT use gradients, neon colors, or glassmorphism beyond a deliberate, specific effect.
  [repo: `backdrop-filter` exists only where the committed world sanctions it]
- DO NOT use heavy drop shadows as the depth system. Shadows must be practically
  non-existent or ultra-diffuse and low opacity (< 0.05).
  [repo: `shadow-sm`/`shadow-md` are sanctioned for elevation layers 1-2; nothing heavier]
- DO NOT use primary-color backgrounds for large elements or sections (no bright hero bands).
- DO NOT use `rounded-full` (pill shapes) for large containers, cards, or primary buttons.
  [repo: pills are for badges/metric labels only]
- DO NOT use emojis anywhere in code, markup, headings, or alt text. Replace with proper
  icons or clean SVG primitives. [repo: lucide icons, consistent stroke]
- DO NOT use generic placeholder names ("John Doe", "Acme Corp", "Lorem Ipsum"). Use
  realistic, contextual content.
- DO NOT use AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen",
  "Game-changer", "Delve". Write plain, specific language.

## 2. Typographic architecture

The interface relies on typographic contrast and restraint, not font swapping.

- [repo] The committed stack is `ui-sans-serif, system-ui, …` — do not introduce display
  fonts. Achieve the editorial feel through **scale steps, weight steps, and tracking**:
  tight tracking (`-0.02em` to `-0.04em`) and tight line-height (~1.1) on large headings;
  generous line-height (1.6) on body.
- Monospace for code, keystrokes, and meta-data only — never as a costume for "technical".
- Body text is never absolute black on white / absolute white on black. Use the off-black /
  charcoal ends of the neutral ramp (`--n-900`, `--n-100`) with line-height 1.6. Secondary
  text uses the mode-safe muted ramp — never gray-on-gray (see `ui-signature`).

## 3. Color palette (restrained monochrome + spot accents)

Color is a scarce resource, used only for semantic meaning or subtle accents.

- [repo] Canvas/surfaces are the `--hub-*` variables; accents are the `--ac-*` family; the
  ramp is the `--n-*` family. The rule this protocol adds: **when in doubt, remove a color**.
- Accent colors: desaturated, washed-out tints for tags, inline-code backgrounds, subtle
  icon backgrounds (this is what `--ac-soft` is for).
- Status colors are the one sanctioned saturation exception, and they are tokenized
  (success/warning/danger/info) — never raw `emerald-400` etc.

## 4. Component specifications

- **Cards/panels:** exactly one hairline border (`1px`, `--hub-border` / `neutral-200`),
  crisp radius (`8px`–`12px` — repo `rounded-lg`/`xl`), generous internal padding (24-40px
  where the layout allows; the kit's `p-4` baseline on dense surfaces). Nested cards are
  always wrong.
- **Primary CTA:** solid accent (`--ac-strong`), high-contrast text, small radius, no
  box-shadow. Hover = subtle color shift; active = micro-scale `scale(0.98)`.
- **Tags & status badges:** pill-shaped, small typography, uppercase with wide tracking
  (`letter-spacing: 0.05em`) — this matches the existing `.label` treatment.
- **Accordions/lists:** strip container boxes; separate items with hairline `border-bottom`.
  Clean `+`/`-` toggle state.
- **Keystroke micro-UIs:** `<kbd>` — hairline border, small radius, sunken background,
  monospace.
- [repo] Buttons go through `<Button>`; forms through `TextField`/`SelectField`; overlays
  through `Sheet`. Minimalism never means bypassing the kit.

## 5. Iconography & imagery

- One icon system, one stroke weight, standardized sizes. No emoji, no mixed libraries.
- Photography (where a surface genuinely has it — course art, avatars): desaturated and
  blended, never oversaturated stock. [repo: never placeholder stock as real data]

## 6. Subtle motion & micro-animations

Motion should feel invisible — present but never distracting. Quiet sophistication, not
spectacle.

- Scroll entry: elements fade in gently as they enter the viewport — `translateY(12px)` +
  `opacity: 0` resolving over ~600ms with `cubic-bezier(0.16, 1, 0.3, 1)`, driven by
  `IntersectionObserver`, never a scroll listener. [repo: marketing-surface only; product
  pages get NO scroll reveals — see ui-animation anti-patterns]
- Hover states: ultra-subtle shadow shift (0 → `0 2px 8px rgba(0,0,0,0.04)`) over 200ms;
  buttons `scale(0.98)` on `:active`.
- Staggered reveals: lists enter with a cascade delay
  (`animation-delay: calc(var(--index) * 80ms)`). Never mount everything at once. Stagger
  small groups only.
- Performance: animate exclusively via `transform` and `opacity`; no layout-triggering
  properties; `will-change` sparingly and only while animating.

## 7. Execution protocol

When writing UI under this protocol:

1. Establish macro-whitespace first — more than feels natural between groups; tight inside
   groups.
2. Constrain prose measure (`max-w-prose`/65ch); data surfaces may run denser.
3. Apply the token palette and typographic hierarchy immediately — no raw hex.
4. Every card, divider, and border obeys the hairline rule.
5. Add scroll-entry motion only where it is sanctioned (see §6).
6. Ensure sections have depth through spacing and layering — no empty flat backgrounds, no
   decoration to fill emptiness. If a section is empty, that's an `EmptyState`.
7. Ship code that reflects this uncluttered discipline natively, without requiring manual
   adjustment.
