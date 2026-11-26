# Learning HUB — REST API server (`apps/server`)

A standalone, headless REST server exposing the same brain as the web app and the
MCP server — packages/core (FSRS-6 engine, session builder, stats helpers) and
packages/db (drizzle/SQLite + the canonical review service) — over Node 24+
native `node:http`. **No web framework**: the router is ~40 lines on top of
`http.createServer`.

Run from the repo root:

```bash
npm run serve            # = tsx apps/server/src/index.ts
# or directly:
npx tsx apps/server/src/index.ts
```

## Configuration

| Source    | Env var                                     | Default                                                                                                           |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Port      | `LEARNING_HUB_PORT`                         | `3300`                                                                                                            |
| DB file   | `LEARNING_HUB_DB`                           | resolved by packages/db (`packages/db/src/paths.ts`): walks up from cwd to the repo root → `data/learning-hub.db` |
| Bind host | `--host` CLI flag, else `LEARNING_HUB_HOST` | `127.0.0.1` (localhost only)                                                                                      |
| Webhooks  | `LEARNING_HUB_WEBHOOKS`                     | none                                                                                                              |

Malformed values fall back to the default with a `[server]` warning (never crash
at boot). The `--host` flag wins over the env var:

```bash
npm run serve -- --host 0.0.0.0        # widen to all interfaces
LEARNING_HUB_PORT=4000 npm run serve
```

Plugins are loaded at boot exactly like the other hosts: core's
`loadPlugins(["plugins"])` scans the repo-root `plugins/` directory. Loading
failures are isolated by core and never prevent the server from starting.

## Auth and browser protection: read this before widening the host

There is no login. The server is meant for the local user's own machine. What it does check
(`apps/server/src/guard.ts`, run before every route):

- **Host.** Only loopback names (`localhost`, `127.0.0.1`, `[::1]`), IP literals and hostnames you list
  are served; anything else gets `421`. This stops DNS rebinding, where a web page re-points its own
  hostname at your machine to read your data. Serve a hostname with
  `LEARNING_HUB_ALLOWED_HOSTS=desk.lan,other.lan:4000` (comma list, `host:port` pins the port).
- **Origin on writes.** A cross-origin `POST`/`PUT`/`PATCH`/`DELETE` gets `403`. Trusted without
  configuration: same-origin, the native shell (`tauri://localhost` on desktop and iOS,
  `http(s)://tauri.localhost` on Windows and Android) and any `chrome-extension://` origin. Other
  exact origins can be exempted from this `403` with `LEARNING_HUB_ALLOWED_ORIGINS=https://x.lan`
  (comma separated); pin the extension with `LEARNING_HUB_EXTENSION_IDS=<id>,<id>`. This is only
  the write check. The server sends no CORS headers and does not answer `OPTIONS` preflights, so a
  web page on another origin (a phone web app, a LAN page) cannot call it from the browser, with
  or without a token. Put such a page behind a reverse proxy on the same origin, or use a
  non-browser client.
- **JSON on writes.** A write that carries a body must be `application/json` (or `+json`), else
  `415`. That is the form a cross-site page can send without a preflight (`text/plain`, form
  posts). `curl -d` defaults to a form type, so add `-H 'Content-Type: application/json'`, or set
  `LEARNING_HUB_ALLOW_ANY_CONTENT_TYPE=1` to turn the check off. Bodyless writes and all reads are
  not checked.
- **Bearer token.** Set `LEARNING_HUB_API_TOKEN` and every request must send
  `Authorization: Bearer <token>` (the scheme name is case-insensitive; `401` otherwise). When the
  server listens beyond loopback (`--host 0.0.0.0`, a LAN address) a token is required: with none
  set, every request is refused with `401`, whatever `Origin` it carries, because any client can
  send any `Origin`. `LEARNING_HUB_ALLOW_UNAUTHENTICATED=1` turns that off and the server then warns
  at boot. Loopback binds stay open without a token. `GET /health` is not exempt: it reports the
  database path, so it needs the token too. `GET /healthz` is the one exception: it needs no token,
  works on any bind, and answers exactly `{"ok":true}` (GET only; `HEAD` and other methods follow
  the normal rules). The Host check still applies to it.
- **Body size.** A JSON body over 1 MiB gets `413`. The web app's own API uses the same default
  with a few reviewed exceptions. `POST /api/review/attempt-image` now limits `imageData` to 8M
  characters: that is a new product limit set with this hardening, not a constraint that existed
  before, and the route accepts a body of up to that size plus 4 KiB.

Compatibility: no first-party client talks to this server today (the native shell, whose
`tauri.conf.json` serves `web/.next-tauri` and `localhost:3000` in dev, the browser extension, the
CLI and the MCP server all use the web host or the database directly), so these defaults cannot
break one. The native-shell origins are allowed up front so a future client needs no
configuration; anything else is opt-in by exact origin.

What this is not: on a loopback bind, a request with no `Origin` header (curl, a script, a local
program) passes the Host and Origin checks, so only the token protects against another program
that can reach the port. CORS headers are never sent, so other origins cannot read responses.

## Endpoints

All responses are JSON. Mutations return `{"ok":true,…}`; errors use the same
envelope as the web app (see below).

### `GET /health`

Liveness probe + resolved DB path.

```bash
curl http://127.0.0.1:3300/health
# {"ok":true,"name":"learning-hub-server","version":"0.1.0","uptimeSeconds":3,"db":"…\data\learning-hub.db"}
```

### `GET /decks`

Decks with card counts (same query as the web app's `/api/decks`).

```bash
curl http://127.0.0.1:3300/decks
# {"decks":[{"id":1,"name":"German","emoji":"📚","total":12,"due":4,"newCards":8,"createdAt":"2026-11-04T…","description":null}]}
```

### `GET /cards?deckId=&due=1&limit=`

Browse cards. `deckId` (optional) filters by deck; `due=1` keeps only
non-suspended cards whose `due` is now or past (sorted by due); `limit` caps the
result (default 200, max 500). Invalid values → `400`.

```bash
curl "http://127.0.0.1:3300/cards?deckId=1&due=1"
# {"cards":[{"id":42,"deckId":1,"type":"basic","content":{…},"due":"2026-11-04T09:00:00.000Z",…}]}
```

### `POST /review` — grade one card

Body: `{ cardId, grade, confidence?, timeMs?, today? }`

- `grade`: `1` Again · `2` Hard · `3` Good · `4` Easy (required)
- `confidence`: `0` unsure / `1` sure (optional, default 1)
- `timeMs`: milliseconds spent (optional, default 5000)
- `today`: ISO timestamp override for backdated logs (optional)

Runs the canonical `executeReview()` from packages/db: one atomic transaction
covering the FSRS-6 card update, append-only `revlog` row, XP event, streak and
Elo/BKT mastery — then emits `review.completed` on the core event bus.

```bash
curl -X POST http://127.0.0.1:3300/review \
  -H 'Content-Type: application/json' \
  -d '{"cardId":42,"grade":3,"confidence":1,"timeMs":4200}'
```

```json
{
  "ok": true,
  "card": { "id": 42, "due": "2026-11-06T…", "stability": 3.2, "reps": 5, … },
  "preReview": { "id": 42, … },
  "revlogId": 1730700000000,
  "due": "2026-11-06T…",
  "intervalDays": 2,
  "xp": 12,
  "streak": { "current": 4, "best": 9 },
  "elo": null,
  "retrievability": 0.7103,
  "day": "2026-11-04"
}
```

Unknown `cardId` → `404 {"error":"Card not found: 999"}`. Bad body → `400` with
zod issue details.

### `POST /review/batch` — grade many cards

Body: `{ "reviews": [ {cardId, grade, confidence?, timeMs?, today?}, … ] }`
(1+ items). All reviews run through `executeBatchReview()` inside **one atomic
transaction** — either every grade lands or none does; the first invalid card
fails the whole batch.

```bash
curl -X POST http://127.0.0.1:3300/review/batch \
  -H 'Content-Type: application/json' \
  -d '{"reviews":[{"cardId":42,"grade":3},{"cardId":43,"grade":4}]}'
# {"ok":true,"results":[{…same fields as POST /review per card…}]}
```

### `GET /today`

Everything the "what should I do now" screen needs: due/new card counts,
today's review tallies (UTC day, matching the revlog bucketing) and the streak.

```bash
curl http://127.0.0.1:3300/today
# {"ok":true,"day":"2026-11-04","due":7,"newCards":12,"reviews":{"count":3,"correct":3,"avgTimeMs":4123},"streak":{"current":4,"best":9,"lastActiveDate":"2026-11-04","freezes":2}}
```

### `GET /stats`

True retention (from the append-only revlog via the `v_true_retention` view),
today's tallies and the 30-day due forecast (core's `forecastNext30Days`).

```bash
curl http://127.0.0.1:3300/stats
# {"ok":true,"trueRetention":{"total":57,"retained":49,"retention_pct":86.0},"today":{"day":"2026-11-04","reviews":3,"correct":3,"avgTimeMs":4123},"forecast":[{"date":"2026-11-04","due":7},…]}
```

### `GET /plugins`

Plugins loaded at boot (names + versions, from core's plugin registry).

```bash
curl http://127.0.0.1:3300/plugins
# {"ok":true,"plugins":[{"name":"example-echo","version":"0.1.0","description":"…","source":"…/plugins/example-echo/index.ts"}]}
```

With no `plugins/` directory (or no valid plugins in it) this is
`{"ok":true,"plugins":[]}`.

## Errors

Errors use the web app's envelope — `{ "error": "<message>" }`, plus `"detail"`
when there is structured context:

| Status | When                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| `400`  | Malformed JSON body/query, zod validation failure (`detail` = per-field issues), review-engine `ValidationError` |
| `404`  | Unknown route (`{"error":"Not found: GET /nope"}`), unknown `cardId` in a review (`CardNotFoundError`)           |
| `500`  | Anything else — sanitized to `{"error":"Internal error"}`; the real error is only in the server log              |

```bash
curl -X POST http://127.0.0.1:3300/review -H 'Content-Type: application/json' -d '{"cardId":42,"grade":9}'
# {"error":"Invalid request body","detail":[{"path":"grade","message":"Invalid input"}]}
```

## Webhooks

`LEARNING_HUB_WEBHOOKS` maps event names from the core event bus
(`packages/core/src/events.ts` `HubEventMap` catalog) to HTTP endpoints. Every
time the platform emits a subscribed event, the server POSTs the event payload
as JSON to the paired URL.

```bash
LEARNING_HUB_WEBHOOKS="review.completed=http://127.0.0.1:8787/hook,streak.broken=http://127.0.0.1:8787/streak" npm run serve
```

- Subscribable events (unknown names in the env are warned about and skipped):
  `review.completed`, `review.batch.completed`, `streak.updated`,
  `streak.broken`, `card.created`, `focus.completed`, `quest.completed`,
  `goal.completed`, `habit.checked`, `achievement.unlocked`.
- Redirects are not followed (intentional compatibility change). A `3xx` answer, from a webhook or
  from the weekly digest, counts as NOT delivered and is logged with the status and the `Location`
  host only. Put the final URL in `LEARNING_HUB_WEBHOOKS` (for example the `https` address, with the
  exact path). Before this change a `307` or `308` was re-sent and a `301`, `302` or `303` was
  turned into a body-less `GET`.
- Logs name a webhook target by origin only (scheme, host, port), never the path, query or
  credentials, because a webhook URL often carries a token.
- Delivery: `POST` with `Content-Type: application/json`, body = the event
  payload as-is (e.g. `{"cardId":42,"grade":3,"xpEarned":12}` for
  `review.completed`).
- Timeout: **3 seconds** per POST (`AbortSignal.timeout(3000)`).
- Failures (timeout, connection refused, non-2xx) are logged to the server
  console with a `[webhooks]` prefix and are **never fatal** — the learning
  engine never waits on a webhook.

Minimal receiver for testing:

```bash
node -e "require('http').createServer((q,s)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{console.log(q.url,b);s.end()})}).listen(8787)"
```

## End-to-end example

```bash
npm run serve &
sleep 2
curl http://127.0.0.1:3300/health
curl http://127.0.0.1:3300/today
curl -X POST http://127.0.0.1:3300/review -H 'Content-Type: application/json' -d '{"cardId":1,"grade":3}'
```
