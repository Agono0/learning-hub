# ENGINE-REFERENCE — verified APIs and conventions

All APIs below were verified empirically against the installed package versions on 2026-11-04. Do not rely on memory of older APIs.

## Installed versions
ts-fsrs 6.0.0 · zod 4.6.7 · drizzle-orm 0.45.4 · drizzle-kit 0.31.11 · better-sqlite3 13.0.3 · next 16.4.5 · react 19.3.1 · ai 7.0.162 · @ai-sdk/openai 4.x · @ai-sdk/openai-compatible 3.x · @ai-sdk/anthropic 4.x · @modelcontextprotocol/sdk 1.32.2 · unpdf 2.1.0 · katex 0.19.1 · react-markdown 10.1.0 · vitest 5.1.0 · fast-check 4.10.2 · typescript 6.0.3 (via `@typescript/typescript6`, the TS 6 JS API — see the toolchain note in [ARCHITECTURE.md](../ARCHITECTURE.md)) · tailwindcss 4.3.4

## ts-fsrs v6 — VERIFIED API (legacy `fsrs().reviewCard` is REMOVED)

```ts
import { DefaultScheduler, Rating, State, Grades } from 'ts-fsrs'
// Rating = { Manual:0, Again:1, Hard:2, Good:3, Easy:4 }, State = { New:0, Learning:1, Review:2, Relearning:3 }

const sched = await DefaultScheduler({ version: 'FSRS-6', desiredRetention: 0.9, enableShortTerm: true })

const card = sched.newCard({ now: new Date() })
// Card: { cardId, stability, difficulty, dueAt(Date), lastReviewAt, state, scheduleStatus, reps, lapses, scheduledDays, learningStep }

const { card: nextCard, revlog } = sched.review({ card, grade: Rating.Good, now: new Date() })
// revlog: { rating, state, cardId, stability, difficulty, dueAt, lastReviewAt, reviewTime, scheduledDays, learningStep, scheduleStatus }

const previews = sched.preview({ card, now: new Date() }) // iterable of { grade, card, revlog } for grades 1..4
```

- Input card is NOT mutated. `dueAt`/`lastReviewAt` are Date objects → serialize to ISO strings for SQLite, restore with `new Date(iso)`.
- DEFAULT_LEECH_THRESHOLD is 0 by default (leech middleware exists: `schedulerLeechMiddleware` — use lapses tracking manually instead).
- There is no TS optimizer in v6 — personalization: collect revlog rows; optimizer integration is deferred.

## AI SDK v7 — VERIFIED exports

```ts
import { generateObject, generateText, streamText, tool, stepCountIs, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'                    // .chat(model) for OpenAI-compatible endpoints
import { createOpenAICompatible } from '@ai-sdk/openai-compatible' // for Ollama: createOpenAICompatible({ name:'ollama', baseURL:'http://localhost:11434/v1' })
import { createAnthropic } from '@ai-sdk/anthropic'
```

`generateObject({ model, schema: <zod schema>, prompt, system? })` → `{ object }`. `streamText(...)` → `.toTextStreamResponse()` / `.toUIMessageStreamResponse()`.

Only `@learning-hub/ai-adapters` may import `ai` / `@ai-sdk/*` — see [ai-providers.md](ai-providers.md) for the port and registry.

## MCP SDK 1.32.2

`McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`, `StdioServerTransport` from `.../stdio.js`. Use `server.registerTool(name, { description, inputSchema: z.object({...}) }, handler)` — must be `z.object(...)` (raw shape → empty schema). Verify at runtime with `npx @modelcontextprotocol/inspector` after implementing.

## Database conventions

- `import { db } from '@learning-hub/db'` — server contexts ONLY (API routes / server components). Never in client components.
- Schema: `packages/db/src/schema.ts` (45 tables, pushed). Views `v_true_retention`, `v_daily_reviews`, `v_xp_daily` are created automatically on first client connection (raw SQL in `createDb`).
- Dates: ISO-8601 strings. Day keys: `YYYY-MM-DD` (use `dayKey(date)` from core/streaks).
- JSON columns: `text('x', { mode: 'json' }).$type<T>()`.
- Append-only tables: `revlog`, `xp_events`, `friction_events`, `elo_events`, `cognitive_telemetry_events`, `circadian_audio_sessions`, `dialectic_arena_debates`, `exposure_events` — INSERT only, never UPDATE/DELETE.
- DB path resolves via `$LEARNING_HUB_DB` or walks up from cwd to the repo root → `data/learning-hub.db`. Images dir: `data/images/`.

## Project conventions

- Monorepo npm workspaces: `packages/core` (pure logic, no I/O except zod), `packages/db` (drizzle), `packages/ai-adapters` (the only AI-SDK importer), `apps/web` (Next 16 App Router), `apps/mcp`, `apps/server`, `apps/cli` (run via tsx).
- Next 16 App Router: server components fetch via `db` directly; client islands for interactivity (`'use client'`). Mutations via route handlers `app/api/**/route.ts` (add `export const runtime = 'nodejs'` where native modules are used). TanStack Query on the client (`useQuery`/`useMutation` calling fetch('/api/...')).
- Styling: Tailwind v4 utilities + helpers in `globals.css`: `.panel`, `.btn`, `.btn-ghost`, `.input`, `.label`, `.celebrate`, `.breathe`. Themes: Dark (default `html.dark`), Light, System, and E-Ink Zen Mode (`html.theme-e-ink` — 1-bit high-contrast, zero animations for ambient e-readers/daylight; Weiser 1991). Tactile haptics via `@/platform/haptics` with Web Vibration API fallbacks. Icons: lucide-react. Charts/graphs: react-force-graph-2d must be dynamically imported (`dynamic(() => import(...), { ssr: false })` inside a 'use client' file).
- Tests: `packages/core/tests/*.test.ts` (vitest 5). Property tests with fast-check where mathematical; E2E harness in `tests/e2e/` — see [TEST_INFRA.md](TEST_INFRA.md).
- Multi-step writes go through the transaction helpers in `@learning-hub/db` (`withTransaction` / the review service) — never several bare `db.update`s.
- Windows spawning: no bare `npx` in spawned JSON configs (use `node --import tsx <abs path>`, as `tests/e2e/helpers/*` already do).
- AI features must degrade gracefully: if the provider is `none` (the default), show a "Configure AI in Settings" hint and offer the manual alternative — the invariant is test-enforced, see [ai-providers.md](ai-providers.md).

## Math modules in `@learning-hub/core` (do not reimplement — import)

- `elo.ts`: `eloUpdate(learnerRating, itemDifficulty, outcome, learnerAttempts, itemAttempts)` → { ratingAfter, itemDifficultyAfter, expected }; `outcomeFrom(grade, confidence)`; `streakBonus(currentStreak)`.
- `bkt.ts`: `bktUpdate(pKnown, correct, params?)`; `isMastered(pKnown, attempts)`; `unlockProbability(pKnown)`; `DEFAULT_BKT`.
- `xp.ts`: `XP_REWARDS`, `levelFromXp`, `xpForLevel`, `levelProgress`.
- `streaks.ts`: `recordActivity(state, today)`, `dayKey`, `emergencyReview`, `isWeekend`.
- `workload.ts`: `forecastWorkload(cards, days, asOf)`, `balanceWorkload(cards, opts)`, `catchUpBacklog(overdue, dailyCap, asOf)`. Preserves Rule 7 (only modifies `due` dates).
- `exposure.ts`: `tokenizeText(text)`, `computeLexicalCoverage(tokens, known)`, `isEligibleForSrsPromotion(encounters)`.
- `analytics.ts`: `computeBrierScore(reviews)`, `computeCalibrationMetrics(reviews)`.
- `types.ts`: CardContent per-format shapes, Grade, Confidence, QuestItem, FrictionTrigger, AISettings, helpers.
