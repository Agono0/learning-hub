# Study blueprints

A study blueprint describes a study method as data: a few phases, optional
tunable settings and optional event counters. Install one and it runs in the
`/blueprints` page, and it also shows up as a regular plugin (palette action,
dashboard widget, MCP tool, CLI command).

Code: `packages/core/src/blueprint/` (pure, no I/O). UI:
`apps/web/src/components/blueprints/BlueprintStudio.tsx`. Boot loader:
`plugins/study-blueprints/`.

## Two separate stores

Blueprints live in two places that are **not synced**:

| Store     | Who uses it                                    | Where                                                                                                                   | When it changes                                       |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Browser   | the `/blueprints` page                         | `localStorage` key `learning-hub.blueprints.v2` (library + session history), per browser and device                     | immediately, on each install, run or finished session |
| Directory | web server, MCP, CLI and headless server hosts | `*.json` files in `LEARNING_HUB_BLUEPRINTS_DIR` (default `./blueprints` under the working directory the host starts in) | **only at host boot**                                 |

The directory loader runs once when a host starts. There is no hot reload: add or
edit a file, then restart the host. A blueprint installed on the page does not
appear in the MCP tool list, and a file on disk does not appear on the page's
installed list; the page still offers the starter methods and a paste box.

### Directory loader rules

The `study-blueprints` plugin registers the three starter methods, then every
valid `*.json` file in the directory, as `blueprint-<id>` plugins (palette action,
dashboard widget, MCP tool, CLI command). Files are untrusted input:

- plain files named `*.json` directly inside the directory only; symlinks,
  subdirectories and other file types are skipped, and a file whose real path is
  outside the directory is refused;
- at most 50 files, 64 KB per file, 1 MB in total, read with a byte bound
  (an oversized file is refused, never truncated);
- parsed as JSON and validated against the schema, never evaluated; unknown keys
  are rejected;
- a file cannot replace a starter method, another directory blueprint (first file
  by name wins) or any plugin already registered as `blueprint-<id>`;
- every failure is logged as `[blueprints] skipped <file>: <reason>` and skipped.
  Loading never throws, so a bad file cannot stop the host.

The loader's file access is in `plugins/study-blueprints/node-source.ts` (Node
only). Core and the web page import no Node built-ins and nothing from `plugins/`;
a test enforces it.

## Session history and scores

Finished or stopped sessions are archived (newest first, up to 200) with the
blueprint id and version, the settings used, and each step with its round. **Every
score is entered by the learner**, so each stored score carries
`source: "self-reported"`. Nothing computes or grades a score today; the field
lets a future graded source be told apart instead of averaged together.

Storage migrates from the first format (`learning-hub.blueprints.v1`, library
only) on first load; the old key is left in place. Unreadable data (damaged
JSON, a newer version, over 2 MB) is never overwritten: the page says so, works
from memory, and "Reset saved data" first keeps a copy under
`learning-hub.blueprints.v2.backup`. A full or blocked browser store shows a
"Could not save" notice and the page keeps working in memory.

## Format

```json
{
  "schemaVersion": 1,
  "id": "retrieval-sprint",
  "name": "Retrieval Sprint",
  "version": "1.0.0",
  "summary": "Study briefly, then test yourself from memory.",
  "params": {
    "pass-score": {
      "type": "number",
      "label": "Pass score (%)",
      "default": 70,
      "min": 30,
      "max": 100
    }
  },
  "phases": [
    {
      "id": "study",
      "title": "Study",
      "kind": "learn",
      "minutes": 10,
      "instructions": "Read once."
    },
    {
      "id": "recall",
      "title": "Recall",
      "kind": "recall",
      "minutes": 5,
      "instructions": "Write what you remember.",
      "scored": true,
      "branches": [
        {
          "when": { "metric": "score", "op": "<", "value": { "param": "pass-score" } },
          "goto": "study"
        }
      ]
    }
  ],
  "triggers": [{ "event": "review.completed", "counter": "reviews", "label": "Cards reviewed" }]
}
```

- `id`, phase ids, param keys and counters: lowercase letters, digits, single dashes.
- Phase `kind`: `learn`, `practice`, `recall`, `reflect`, `rest`.
- `minutes` and `repeat` are a number or `{ "param": "key" }`. A param used there must be a number param with `min` and `max` inside the allowed range (minutes 0-240, repeat 1-50).
- `scored: true` asks for a 0-100 score when the phase finishes.
- After a phase: repeat rounds first, then `branches` in order (first match wins), then `next`, then the following phase. Falling off the end finishes the session. Conditions are data (`metric` is `score` or `confidence`, `op` is `< <= > >= ==`), never code.
- Skipping a phase takes no branch. A session stops at 500 completed steps, so a bad loop cannot hang a host.
- `triggers` count platform events (`HubEventMap`) so the plan can show them.

Unknown keys are rejected. Validation returns every problem at once with a path;
unreachable phases and loops with no exit are warnings.

## Reading the results

A phase with `repeat` runs once per round and each round is its own step in the
session log, so "Explain it simply" can appear twice in the finished list
(labelled "round 1 of 2", "round 2 of 2"). The average score is the mean of the
scores the learner entered, one per scored step; skipped steps are not counted.
Branches on a repeated phase are checked after its last round. The `/blueprints`
overview shows "N rounds" next to such phases, using the current settings.

`explainIssue(issue)` rewrites a validation issue as a plain sentence for the UI
(for example "Add a name." or "Phase 2, kind: pick one of learn, practice, ...").

## API

```ts
import {
  validateBlueprint,
  startSession,
  completePhase,
  installBlueprint,
  SAMPLE_BLUEPRINTS,
} from '@learning-hub/core/blueprint'

const res = validateBlueprint(json) // { ok, blueprint, warnings } | { ok: false, issues }
const s = startSession(res.blueprint, { 'pass-score': 80 })
const next = completePhase(res.blueprint, s.session, { score: 65 }) // pure: returns a new session
await installBlueprint(json) // registers a `blueprint-<id>` plugin via registerPlugin
```

`installBlueprint` goes through the normal plugin loader (see
[plugins.md](plugins.md)), so duplicates are skipped by name and a bad
blueprint never breaks other plugins. Hosts that want blueprints at boot can
call it for each stored blueprint.

## Samples

`SAMPLE_BLUEPRINTS`: Retrieval Sprint (test, restudy gaps), Feynman Loop
(explain in rounds, teach back), Interleaved Problem Set (rotate topics, break on
a weak score).
