# Study blueprints

A study blueprint describes a study method as data: a few phases, optional
tunable settings and optional event counters. Install one and it runs in the
`/blueprints` page, and it also shows up as a regular plugin (palette action,
dashboard widget, MCP tool, CLI command).

Code: `packages/core/src/blueprint/` (pure, no I/O). UI:
`apps/web/src/components/blueprints/BlueprintStudio.tsx`. Installed blueprints
and sessions live in the browser (`localStorage`, key
`learning-hub.blueprints.v1`); there is no server state or migration.

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
