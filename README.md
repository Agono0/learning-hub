# Learning HUB

**The research-backed self-learning system** — every high-effect learning method from the literature (spaced repetition, retrieval practice, interleaving, elaboration, teach-back, memory palaces…), plus addiction defense, motivation science, quotes, an AI-agent-accessible idea system, and a Coursera-style curriculum engine. Local-first. TypeScript. Any AI agent can drive it via MCP.

> Built from ~120 web-searched studies up to 2026 — see `ENGINE-REFERENCE.md` for the verified stack and `PLAN-RESEARCH.md` for the science.

## Quick start

```bash
npm install        # already done if node_modules exists
npm run db:push    # create/refresh SQLite schema (data/learning-hub.db)
npm run db:seed    # quotes library + achievements + defaults
npm run dev        # → http://localhost:3000
```

Tests: `npm test` · CLI: `npm run cli -- stats` · MCP server: `npm run mcp`

## Systems (26)

**Learning core** — FSRS-6 engine (ts-fsrs 6, desired retention 0.9) · cards: basic / cloze / stepwise MCQ / type-in / image occlusion / proof-step / grammar · 20-Rules card linter + Deck Doctor · interleaved sessions · pretest mode · worked-example fading · hypercorrection queue · confidence ratings · Puzzle-Elo ladder · energy system · matching games · memory palaces + Major/PAO trainer · sentence mining (1T) + grammar cards · Feynman teach-back · Socratic tutor (guardrail ladder: never answers before a retrieval attempt) · incremental reading + highlight triage + daily resurfacing · canvas whiteboard · knowledge graph

**Curriculum** — Track→Course→Unit→Lesson (backward design, Bloom verbs) · prerequisite DAG gating · BKT mastery (P(known) ≥ 0.95) + Khan-style levels · mastery challenges · skill tree · AI course generator (topic or PDF import) · exam countdown + mock exams + expressive-writing prompt + honest cram mode

**Human systems** — XP/levels (skill milestones) · streaks + 2 freezes + weekend amulet + emergency 1-card saver · daily quests · WOOP goals + if-then plans · white-hat achievements · habit loops + stacking chains + dopamine menu · focus mode with friction gate (10 s countdown + breathing + reflection — the 57 %-reduction mechanic) · tab-switch leak logging · 10-step detox wizard · commitment contracts · task player with finish-time visibility · small-wins journal + weekly review + AI coach · quotes system · physiology tracker (sleep/exercise/caffeine vs. retention correlations)

**Agent access** — MCP server (stdio), REST API, CLI: one brain, many doors.

## Connect any AI agent (MCP)

Add to `%APPDATA%\Claude\claude_desktop_config.json` (or `.mcp.json` for Claude Code / Cursor):

```json
{
  "mcpServers": {
    "learning-hub": {
      "command": "node",
      "args": ["--import", "tsx", "C:\\Users\\pc\\Desktop\\learning-HUB\\apps\\mcp\\src\\index.ts"]
    }
  }
}
```

(On Windows never spawn bare `npx` — use `node --import tsx <abs path>`.)

Tools: `idea_create`, `idea_search`, `idea_connect`, `idea_evolve`, `idea_list_inbox`, `note_create`, `note_search`, `review_log`, `review_stats`, `goal_woop`, `goal_list`, `focus_summary`, `quote_random`, `card_generate` · Resources: `idea://{id}`, `note://{id}`, `graph://overview`.

Inspect: `npx @modelcontextprotocol/inspector node --import tsx apps/mcp/src/index.ts`

## AI configuration

Settings → AI provider: **Anthropic** / **OpenAI** / any **OpenAI-compatible endpoint** (GLM, DeepSeek…) / **Ollama** (local, free). Everything degrades gracefully without AI.

## E2E walkthrough

1. `npm run dev` → Dashboard shows due count, streak, quests, daily quote
2. **Decks** → new deck → new cloze card (`{{c1::Paris}} is the capital of France`) → save (linter runs)
3. **Review** → answer with keyboard 1-4 → XP/streak/quest update live
4. **Focus** → start 25 min → click “end early” → friction gate enforces 10 s countdown + breathing + reflection
5. **Reading** → paste article → highlight → triage → make flashcard
6. **Curriculum** → generate course from topic or PDF → skill tree unlocks by mastery
7. **Feynman** → explain a concept → AI student asks follow-ups → graded, gap-cards created
8. **Ideas** → capture 2 ideas → evolve → hybrid offspring linked
9. **MCP** → inspector lists all tools; `npm run cli -- stats` works
10. **Analytics** → true retention, forecast, calibration, heat map

## Architecture

```
packages/core   pure domain logic (FSRS wrapper, BKT/Elo, XP, streaks, linter, prompts…)
packages/db     Drizzle + better-sqlite3 → data/learning-hub.db (45 tables, append-only event logs + SQL views)
apps/web        Next.js 16 App Router (dark, keyboard-first)
apps/mcp        MCP stdio server (@modelcontextprotocol/sdk)
apps/cli        terminal adapter
```

Dates ISO-8601 strings · JSON columns typed · `revlog`/`xp_events`/`friction_events`/`elo_events` append-only · true retention via SQL view.

## Roadmap (deferred)

Multi-device sync (CRDTs/Turso) · Anki `.apkg` import · per-card TTS · AI video-call roleplay · party boss battles · FSRS optimizer UI (`@open-spaced-repetition/binding`) · browser-extension friction · web-push reminders · native mobile.
