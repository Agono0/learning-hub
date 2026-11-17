---
name: code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along three axes — Standards (repo's documented coding standards), Spec (what the issue/spec asked for), and UI (the design review, merged from design-review). Runs the axes as separate passes and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

> Source: https://github.com/mattpocock/skills (skills/engineering/code-review) — vendored & adapted 2026-11-18. MIT license (Matt Pocock).
>
> Adaptation notes: the upstream issue-tracker setup step is removed (specs are found in the
> repo: PR description, `docs/`, commit messages). The upstream **design-review** skill from
> open-design (a catalogue stub for Garry Tan's "designer who codes" review: visual audit,
> then fixes as atomic commits) is merged here as the third axis, §UI review. Subagent
> references apply where subagents exist; solo, run the axes as separate passes.

Three-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?
- **UI**: does the changed interface pass the design gate? (visual audit → atomic fixes)

The axes run as **separate passes** (subagents where available) so they don't pollute each
other's context, then this skill aggregates their findings.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`,
`HEAD~5`). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison
is against the merge-base). Also note the commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and
the diff is non-empty. A bad ref or empty diff should fail here, not inside the passes.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`).
2. A path the user passed as an argument.
3. A spec or plan file under `docs/` (e.g. `docs/ui-ux-next-plan.md`, `docs/ui-ux-map.md`)
   matching the branch name or feature.
4. If nothing is found, ask. If there isn't one, the Spec axis skips and reports "no spec
   available".

### 3. Identify the standards sources

Search the repo for every file that documents how code should be written. Here, at minimum:

- `AGENTS.md` (hard rules + recipes) — the primary standards source
- `DESIGN.md` and `docs/ui-design-signature.md` (design standards)
- `CONTRIBUTING.md`, `ARCHITECTURE.md` where relevant

On top of whatever the repo documents, the Standards axis always carries the **smell
baseline** below (Fowler, _Refactoring_ ch.3). Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses
  something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"),
  never a hard violation. Skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a name that doesn't reveal what it does or holds. → rename; if no
  honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape in more than one hunk or file. → extract the
  shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. →
  move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together. → bundle into one
  type, pass that.
- **Primitive Obsession**: a primitive standing in for a domain concept. → give the concept
  its own small type.
- **Repeated Switches**: the same switch/if-cascade on the same type recurs. → polymorphism,
  or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files. → gather
  what changes together into one module.
- **Divergent Change**: one module edited for several unrelated reasons. → split so each
  module changes for one reason.
- **Speculative Generality**: abstraction added for needs the spec doesn't have. → delete it.
- **Message Chains**: long `a.b().c().d()` navigation. → hide the walk behind one method.
- **Middle Man**: a class that mostly delegates onward. → cut it.
- **Refused Bequest**: a subclass that ignores most of what it inherits. → drop inheritance,
  use composition.

### 4. Run the axes as separate passes

Issue the passes together where parallel subagents are available; solo, run them strictly
one after another so each gets a clean reading of the diff.

**Standards pass brief:** "Report, per file/hunk where relevant, (a) every place the diff
violates a documented standard: cite the standard (file + the rule); and (b) any baseline
smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls:
documented-standard breaches can be hard, but baseline smells are always judgement calls, and
a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400
words."

**Spec pass brief:** "Report: (a) requirements the spec asked for that are missing or
partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that
look implemented but where the implementation looks wrong. Quote the spec line for each
finding. Under 400 words."

**UI pass (§ below).**

If the spec is missing, skip the Spec pass and note this in the final report.

### 5. Aggregate

Present the reports under `## Standards`, `## Spec`, and `## UI` headings, verbatim or
lightly cleaned. Do **not** merge or rerank findings — the axes are deliberately separate.

End with a one-line summary per axis: total findings, and the worst issue *within each axis*
(if any). Don't pick a single winner across axes: that's the reranking the separation exists
to prevent.

## §UI review (merged from design-review)

The design-review discipline: **audit first, then fix with atomic commits**. One visual/
correctness pass over the changed UI, fixing in small reviewable steps.

1. **Audit the changed surfaces** against the `ui-signature` 12-point review gate (contrast
   both modes, one primary action, 44px targets, `focus-visible`, state coverage, no ghost
   classes, no raw hex, reduced-motion safety, kit-first, honest empty states, mobile 360px,
   copy quality). For rule-level findings beyond the gate, load `web-design-guidelines`.
   Output findings in terse `file:line` format.
2. **Fix as atomic commits** — one finding (or one coherent cluster) per commit, each passing
   `npm run typecheck && npm run lint && npm test` (rule 17: no builds). Order by the
   redesign fix priority: tokens → states → layout → components → polish (see
   `redesign-skill`).
3. **Before/after evidence.** No screenshots are possible here (no local builds), so capture
   the "before" as the quoted audit finding and the "after" as the code change + which gate
   point it now passes. State honestly what was not verified.
4. Tests must never be weakened to make a UI change pass (rule 13). `hub-registry` and
   manual-mode surface tests are structural — if a change breaks them, the change is wrong.
