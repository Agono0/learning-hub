# Context Variability Studio

Where and when you study leaves cues in memory. Recall is usually better when the test context matches the study context (Godden & Baddeley 1975; Tulving & Thomson 1973) and studying in more than one context reduces that dependence (Smith, Glenberg & Bjork 1978). Meta-analysis puts the effect at modest size (Smith & Vela 2001), so this feature reports patterns and never changes schedules.

## What it does

- **Sessions.** Start and end a session at a named place (with optional noise level and tags), or log a past one. Sessions are capped at 12 hours, an open session older than that is ignored, and at most 5000 are kept. Starting the same place twice returns the open session. A past session with the same place and start time is stored once.
- **Attribution.** Each review in the window is placed inside the session that contains it, else marked `unlogged`. Undone reviews are removed. At most 20000 reviews are read, and the audit says when it truncated.
- **Audit.** Success rate (Good or Easy) by place, time of day, weekday or weekend and noise, each with a 95% Wilson interval. Groups under the minimum size show no rate.
- **Home versus away.** For cards reviewed both at the most-used place and elsewhere, compares success rates and gives the gap with an interval. Verdicts: `context-bound`, `transfers`, `insufficient`.
- **Bound cards.** Cards with four or more reviews and most of them in one place and time bucket, each with a suggested different context.
- **Goals.** Add a place and local hours (an exam room, a desk). The audit shows the share of reviews that match, a status (`familiar`, `partial`, `unfamiliar`), how many more matching reviews would make it familiar, and a mental-reinstatement script for when the real place is out of reach. At most 20 goals.

## Honest limits

The audit is observational. Easy cards may be reviewed in easy places, and a person who studies at home when tired will look worse at home. Treat a large gap as a prompt to test, not a verdict. The thresholds in `CTX_DEFAULTS` are heuristics, not validated cut-offs. Place names are lowercase and trimmed, so "Library" and "library" match but "main library" does not. Time of day uses the browser or CLI timezone offset.

## Surfaces

| Surface | Entry                                                             |
| ------- | ----------------------------------------------------------------- |
| Web     | `/context-variability`, `GET` and `POST /api/context-variability` |
| CLI     | `ctxv status\|start\|end\|log\|audit\|goal`                       |
| MCP     | `ctxv_audit`, `ctxv_session`, `ctxv_goal`                         |

`POST` actions: `start`, `end`, `log`, `goal-add`, `goal-archive`. Validation errors return 400, limits return 409, a missing open session or goal returns 404.

## Sync

`context_sessions` (natural key: start time and place) and `context_goals` (label and place) are synced, mutable tables resolved by last write wins on `updated_at`. Ending a session and archiving a goal are updates, so nothing is hard-deleted.
