---
name: motion-design
description: Motion craft for planning sequences — beat mapping, choreographing attention, timing vs spacing, easing direction, and the primary/secondary/ambient layer model. Use when planning a multi-step animation sequence (onboarding, celebration, 3D world entrance) or diagnosing why a motion sequence reads badly. For single UI transitions use ui-animation or emilkowalski-motion first.
---

> Source: https://github.com/open-design (open-design/skills/motion-design) — vendored & adapted 2026-11-18. Apache 2.0 license (open-design repo).
>
> Adaptation notes: upstream is heavily bound to a video-film production host (MP4 export
> contracts, OD renderer commands, sound tracks, replication tooling) — none of that applies
> to a Next.js app and it is all removed. What survives is the choreography craft, retargeted
> from "motion films" to in-app sequences. In this repo, GSAP is the sequencing engine
> (see `gsap-timeline`) and reduced motion is a hard gate (see `ui-signature` motion law).

# Motion Design — choreography craft

Use this skill to plan **sequences**: multi-beat motion where several elements animate in a
deliberate order (session-complete celebrations, onboarding steps, 3D world entrances, grade
commit choreography). Quality means the user understands and remembers the idea while
wanting to watch it move — and, in an Operate app, only when the sequence *carries meaning*.

## Resolve the brief without stalling

Use the user's assets, references and previous decisions first. Resolve: message; where it
plays; duration; exact copy; must-show elements; and required output. Ask only when missing
information would change the story. Otherwise choose a coherent direction and state the
meaningful assumption briefly. Do not impose three style options or an approval round on a
user who asked you to make the thing.

For an unconstrained in-app sequence, a useful starting scale is **0.6–2.5 seconds total**
(UI sequences are films compressed ~10×). Existing motion tokens, duration law and
reduced-motion policy override these defaults. Do not invent product claims, metrics or
assets.

Create a compact **beat map** as part of the existing plan, not a second document:

```
time → user takeaway → focal element → transformation → copy/audio → exit
```

Time budget includes entrances, reading holds and exits. Choose a recurring object, shape,
line or typographic motif that connects the beats.

Example mechanism for this app (adapt, don't copy as a universal style): grade chip →
attracts to the session meta line → interval preview lands → progress bar takes the fill.
Each movement changes the meaning; four unrelated pops would lose the mechanism.

## Art direction before adding movement

Resolve one strong representative frame before expanding all beats. Choose the actual
hierarchy, crop, type, palette and focal element. A weak still will not be rescued by
particles, camera shake or effects.

- Use a specific visual premise tied to the subject. "Premium", "cinematic" and "modern"
  alone are not art directions. Define what fills the frame, where attention rests, and the
  contrast structure.
- Typography is a graphic object. Compose with scale, alignment, line breaks and negative
  space.
- Prefer a small palette with intentional contrast — here, the token palette only.
- Choose one material/world logic and carry it through: for this app, "calm instrument" —
  precise, quiet, never bouncy by default.
- Supplied product screens and logos retain their proportions and content. Crop deliberately
  rather than stretching.

## Choreograph attention

Choose the **lead action** and let supporting motion answer it. Offset independent elements
when that clarifies reading; move them together when collective motion is the idea. Do not
mechanically stagger every word or enforce a fixed moving fraction of the screen.

Use three possible layers, not three mandatory effects:

1. **Primary action** carries the idea.
2. **Secondary action** conveys weight or causality: a trailing label, a shadow settling, a
   reaction in a connected element.
3. **Ambient motion** provides life only when the scene needs it. Quiet scenes and reading
   holds may be genuinely still. (This repo's `.breathe` breathing circle is the one
   sanctioned ambient loop.)

**Timing and spacing have different jobs:** timing places story beats; spacing controls
acceleration and weight between them. Starting ranges (film heuristics, not UI response
limits):

| Job | Starting range | Shape |
| --- | --- | --- |
| Small accent / punctuation | 120–220ms | decisive snap, then settle |
| Main element arrival | 350–650ms | quick travel, controlled landing |
| Meaningful shape transformation | 600–1200ms | readable setup and resolution |
| Large reveal / camera move | 900–1800ms | sustained trajectory, clear destination |

Use ease-out for an arrival, ease-in for a motivated exit, and smooth
acceleration/deceleration for a camera move. Constant-speed travel is appropriate for
conveyors, clocks, scans and intentional mechanical motion. Playful material can overshoot;
precise instruments should not bounce by default — **Learning HUB is a precise instrument**.

- Give fast actions preparation and recovery. Anticipation may be tiny, but there should be a
  legible cause rather than an unexplained teleport.
- Change position on arcs when physical motion calls for it; straight paths for precision.
- Match-cut across shared shapes; track a moving object into the next beat; reveal through a
  meaningful mask. Choose transitions because of the relationship between beats, not variety.
- Preserve velocity and direction at hand-offs. Avoid accidental jumps in scale or identity.
- Alternate action and rest. Reserve the strongest transformation for the central idea;
  endless maximum intensity makes everything feel equal.
- Close intentionally: resolve the motif and hold the final message. Loops need matching
  start/end state AND velocity.

## Determinism and seekability (GSAP)

- Define initial states explicitly, then animate scene objects at absolute times on a
  `gsap.timeline()`; keep duration, easing and scene timings in one small configuration
  (motion tokens) near the component.
- Group each beat's elements and motion together. Separate content/data from drawing.
- Deterministic motion must survive interruption and reversal: no `Date.now()`-based scene
  state, no unseeded randomness, no independent CSS animation competing with the master
  timeline. Kill/revert timelines on unmount (`gsap.context()` or `mm.revert()`).
- Never make visible content depend on timeline callbacks for correctness (`onUpdate` state
  writes); drive React state through data, not through the animation.

## Quality while composing

For each beat, account for focal point, motion cause, reading time and exit. At a
transition, account for both outgoing and incoming states and their overlap. At the end,
account for resolution, holding time and replay behavior.

Defect-to-decision pairs:

| Defect | Better decision |
| --- | --- |
| Feels like a slideshow | Carry one object through a meaningful transformation |
| Everything competes | Choose the lead action; reduce or delay support |
| No sense of weight | Adjust travel time, acceleration, anticipation and settle |
| Text is unreadable mid-motion | Increase hold and contrast; shorten copy only if allowed |
| Looks generic | Strengthen type, composition and the subject-specific motif |
| Sequence feels monotonous | Vary scale and action/hold rhythm with purpose |
| Looks busy but says little | Remove decorative motion and show the causal action |
| User in a hurry hates it | It was decoration; demote to a 150ms state change |

Do not invent a numeric score to certify aesthetics. Report the artifact, its duration, and
what you could not verify (no local builds in this repo — verification is by code reading
against this checklist).
