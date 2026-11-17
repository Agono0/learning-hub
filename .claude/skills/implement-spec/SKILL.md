---
name: implement-spec
description: Implement a spec and its tickets as a task graph on a single integration branch — frontier-driven, one fresh subagent per ticket, code-review at the end. Use when executing a written spec that has been broken into tickets with blocking relationships.
---

> Source: https://github.com/mattpocock/skills (skills/engineering/implement-spec) — vendored & adapted 2026-11-18. MIT license (Matt Pocock).
>
> Adaptation notes: upstream assumes a configured issue tracker and a `/tdd` skill from the
> same repo. Neither exists here — the tracker is replaced by "the ticket list in the spec
> document itself" and the TDD step by this repo's own testing law (AGENTS.md §5-6: tests for
> every new function/route; never weaken tests, rule 13). Subagent references apply wherever
> you actually have subagents; when working solo, the same steps run inline in order.

You have been provided a spec. This spec should have tickets associated with it, describing
how to implement the spec.

The goal is the entire spec implemented on a single **integration branch**, with every ticket
resolved and closed.

The tickets are not a list of steps. They are a **task graph** with blocking relationships
between them. This means there is always a **frontier** of tickets which are ready to be
grabbed.

Start every subagent with a fresh context window.

Communication to and from subagents should be sparse. Communicate primarily through **context
pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate
information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum
concurrency.

## Steps

1. Read the spec and tickets to understand the task graph.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the
   tickets — relevant codebase files or external documentation. Ensure the exploration
   subagent can save files — it should save its markdown notes in a directory outside the
   repo, accessible by all future subagents. This lets **implementer subagents** focus on
   implementation rather than exploration.

3. Create the integration branch. If the repo closes work through PRs, open a draft PR after
   the first merge (a branch with no commits ahead of main can't open one), marked as closing
   the spec and tickets.

4. Use a fresh **implementer subagent** for each ticket, each in its own worktree on its own
   branch. Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting, and resets
     onto it if not;
   - implements the ticket with tests written first where practical, and the touched
     surface's tests kept green — never weakened (AGENTS.md rule 13; for UI work, the
     hub-registry and manual-mode-surface tests must keep passing);
   - verifies locally with `npm run typecheck && npm run lint && npm test` (rule 17: never
     build locally) before reporting done;
   - merges the integration branch tip into its own branch before reporting done.

5. Once an **implementer subagent** completes, merge its work to the integration branch with
   a **merger subagent** (or inline, solo).

6. If this changes the **frontier** of available tickets, kick off more implementer subagents
   to work on the new tickets. This allows maximum concurrency.

7. Once all tickets are complete, run the `code-review` skill on the integration branch. Fix
   all issues raised by the code review in a single fresh implementer subagent.

8. If a draft PR exists, mark it ready for review. Otherwise resolve each ticket and report
   the integration branch.

9. Clean up all implementer subagent worktrees.

## Repo notes

- Conventional Commits are enforced by commitlint: `feat(ui/decks): adopt Button kit` — one
  logical change per ticket, one commit where practical.
- Push autonomously after `npm run check` is green (rule 14), pull-before-push (rule 18), and
  wait for CI before merge (rule 15) — pipelining the next spec's exploration while CI runs
  (rule 16).
