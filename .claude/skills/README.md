# Skills — vendored UI/UX + process library

Vendored from six upstream repos (2026-11-18), adapted to be self-contained for this repo,
and combined into `ui-signature` — the load-first design language for Learning HUB UI work.
No skill here overrides `AGENTS.md`; where a vendored skill disagrees with `ui-signature`,
`ui-signature` wins. Licenses are noted per skill and preserved from each upstream `LICENSE`.

## The one to load first

| Skill | What it is |
|---|---|
| **`ui-signature`** | Learning HUB's combined design language: identity, token law (mode-aware text ramp, one danger hue = rose, motion tokens), component law (kit-first, button hierarchy, focus-visible), motion law, the 12-point review gate. **Load for any UI work in `apps/web`, before anything else below.** Composed from all six sources; not vendored. |

## Design craft (vendored)

| Skill | Use for | Source / license |
|---|---|---|
| `taste` | Anti-slop judgment; UI copy voice; palette/type libraries; when a page reads "AI-made" | Leonxlnx/taste-skill · MIT |
| `impeccable` | Design-director discipline: modes (Operate/Read…), craft floor, audit→polish intent menu | naedna/impeccable · Apache-2.0 |
| `ui-ux-pro-max` | Searchable 120-rule UX database + Next.js rules (`scripts/search.py --domain ux`) | nextlevelbuilder/ui-ux-pro-max-skill · MIT |
| `design-system` | Token architecture (primitive→semantic→component), component state specs, theme application | ui-ux-pro-max-skill subskill · MIT (+ merged theme-factory) |
| `ui-styling` | Tailwind v4 craft; the banned shadcn-style ghost-class vocabulary + replacements | ui-ux-pro-max-skill subskill · MIT |
| `web-design-guidelines` | Vercel Web Interface Guidelines review (`file:line` findings) + Apple HIG essentials | vercel-labs/web-interface-guidelines · MIT (+ merged apple-hig stub) |
| `frontend-design` | Building a new page/screen with a real design point of view | anthropics/skills · Apache-2.0 |
| `minimalist-skill` | Stripping clutter; color scarcity; invisible motion | Leonxlnx/taste-skill · MIT |
| `redesign-skill` | Audit → fix existing generic UI, in priority order | Leonxlnx/taste-skill · MIT |
| `motion-design` | Multi-beat sequence planning: beat maps, choreography, timing vs spacing | open-design · Apache-2.0 |
| `ui-animation` | Implementing/reviewing single transitions; recipes, springs, debugging symptoms | mblode/agent-skills · MIT |
| `emilkowalski-motion` | Tasteful micro-interactions on an existing interface | emilkowal.ski via open-design · Apache-2.0 |

## Motion engine (vendored, MIT, GreenSock/gsap-skills)

| Skill | Use for |
|---|---|
| `gsap-core` | Tweens, eases, stagger, `gsap.matchMedia()` (responsive + reduced motion) |
| `gsap-timeline` | Sequencing multiple steps on one timeline |
| `gsap-scrolltrigger` | Scroll-linked animation (only where the motion law allows it) |
| `gsap-react` | `useGSAP`, cleanup, React integration |
| `gsap-plugins` | Flip, Draggable, SplitText, MorphSVG and friends |
| `gsap-performance` | Keeping animation off the main thread's hot path |
| `gsap-utils` | clamp/mapRange/snap helpers |
| `gsap-frameworks` | Next.js/framework integration notes |

GSAP itself is not yet a dependency — see `ui-signature` §5.7 for the usage policy before
adding it.

## Process discipline (vendored, MIT, mattpocock/skills)

| Skill | Use for |
|---|---|
| `prototype` | Throwaway prototypes that answer one question: logic demo (single HTML) or `?variant=` UI routes |
| `implement-spec` | Executing a spec's tickets as a task graph on one integration branch |
| `code-review` | Three-axis review (standards / spec / **UI gate**); Fowler smell baseline; audit→atomic fixes (merged design-review) |
| `writing-for-agents` | Writing/editing skills and agent docs: context pointers, progressive disclosure, pruning |

## Decision table — when to load which

| You are… | Load |
|---|---|
| Starting any UI feature or page | `ui-signature` (always first) → `frontend-design` if building from scratch |
| Reviewing UI (PR/audit) | `ui-signature` §6 gate → `code-review` (UI axis) → `web-design-guidelines` for rule-level findings → `ui-ux-pro-max` search for evidence |
| Reviewing/fixing code generally | `code-review` |
| Adding motion / micro-interactions | `emilkowalski-motion` → `ui-animation` (recipes) → `gsap-timeline`/`gsap-core` only if sequencing justifies GSAP per `ui-signature` §5.7 |
| Planning a multi-beat sequence (celebration, onboarding, 3D entrance) | `motion-design` → `gsap-timeline` |
| Choosing a palette / color decision | `taste` §6 (color science) → repo palettes always win |
| Writing UI copy (labels, empty states, errors) | `taste` §5 + `taste/references/copy-tells.md` |
| A page "works but looks generic" | `redesign-skill` (audit first) + `impeccable` polish/quieter intents |
| A surface feels cluttered | `minimalist-skill` → `impeccable quieter/distill` |
| Adding/refactoring tokens | `ui-signature` §3 → `design-system` → `ui-styling` |
| Prototyping a UI idea | `prototype` (`?variant=` routes inside the real page) |
| Executing a written spec with tickets | `implement-spec` → `code-review` at the end |
| Writing or editing a skill / AGENTS-style doc | `writing-for-agents` |

## Adaptation notes

- All skills are self-contained: no `/tmp` paths, no upstream installer/launcher references.
- Merged-as-sections (upstream was a <2KB stub with no transferable content):
  `apple-hig` → `web-design-guidelines` §Platform conventions; `color-expert` → `taste` §6;
  `theme-factory` → `design-system` §5; `design-review` → `code-review` §UI review.
- Dropped as repo-irrelevant: taste's dealer scripts + headless-Chrome gate (AGENTS.md rule
  17 forbids local builds/dev servers), impeccable's launcher binary + ~40 playbooks
  (essentials inlined), ui-ux-pro-max's `--design-system` bundle (kept `ux-guidelines.csv`,
  `ui-reasoning.csv`, `stacks/nextjs.csv` — 105KB < 500KB budget), ui-animation's
  screen-recording measurement scripts, design-system's slide generator.
- `docs/ui-ux-map.md` is the evidence file this library was tuned against;
  `docs/ui-design-signature.md` is the human-readable form of `ui-signature`;
  `docs/ui-ux-next-plan.md` is the implementation plan that consumes both.
