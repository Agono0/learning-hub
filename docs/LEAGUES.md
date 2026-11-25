# Competitive Leagues (lh-leagues/v1)

Seasonal competition layered on top of study activity: players climb five
divisions across weekly rounds, settle rivalries in recall duels, and fight
through seeded tournament brackets. Everything runs on the shared local
database — the same surface serves the web UI (`/leagues`), the REST API
(`apps/server` and the web handler at `/api/leagues`), the CLI
(`leagues …`), and 16 MCP tools (`league_*`, `duel_*`, `tournament_*`).

## Concepts

### Divisions and rounds

Every league has five divisions: **bronze, silver, gold, platinum, diamond**
(`DIVISION_ORDER` in `packages/core/src/leagues/engine.ts`). Every player
joins in bronze. A league runs in **rounds** (default 7 days, configurable
1–28 at creation). When a round closes:

- The top `promotionSlots` (default 3) scorers in each division move up one
  tier — **but only if they scored**: a zero-point player never promotes,
  even alone at the top of a division.
- The bottom `relegationSlots` (default 3) drop one tier. A player promoted
  in the same round is exempt from same-round relegation.
- Round points reset to zero and roll into season totals; the division
  winner's `roundsWon` increments.
- The round row (promotions, relegations, winners per division) is recorded
  in `league_rounds` and shown under Round history.

### Points

Study activity converts to league points via `awardLeaguePoints`:

| Event         | Points       |
| ------------- | ------------ |
| Reviews done  | 1 per review |
| Focus minutes | 1 per minute |
| Duel win      | 25           |
| Duel draw     | 10           |

(Defaults from the league `scoring` config — overridable per league.)

Points land only for league members; events for non-members are ignored
(the API returns `awarded: false`).

### Duels

A duel is a head-to-head recall contest over the same prompt set. Prompts
are inline (`id::question::answer1|answer2`, answers case-insensitive) or
generated from a deck's answerable cards (basic, type-in, and MCQ cards)
via `duel_create_from_deck` / `leagues duel from-deck` — generation is
seeded, so the same seed and the same deck produce the same duel on every
device. Each side submits answers with per-prompt elapsed milliseconds.
When both sides are in, the duel decides:

1. **Accuracy first** — more correct answers wins.
2. **Speed breaks ties** — on equal accuracy, the faster total time on
   correct answers wins.
3. Otherwise an honest **draw** (no coin flips).

League duels additionally move both players' **Elo** (K=32, clamped to
100–3000) and award duel points (win 25, draw 10).

### Tournaments

Seeded single-elimination brackets. Seeds are handles in seed order; the
bracket pads to the next power of two with byes, and byes propagate, so a
later-round match becomes playable as soon as both its slots are filled.
Match results can reference a deciding duel (`--duel <id>`).

### XP integration

Closing a round awards canonical XP (`leagueRoundWin`, 75 XP) through the
single `awardXp` path to every division winner who actually scored that
round. An uncontested zero-point division top earns nothing, matching the
must-score-to-advance rule.

## API

`POST /api/leagues` dispatches on `action`:

| Action                  | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `create`                | Create a league (409 on duplicate slug)                 |
| `join`                  | Join in bronze                                          |
| `points`                | Award review/focus points (`reviews` or `focusMinutes`) |
| `close-round`           | Close the round; returns promotions/relegations         |
| `duel-create`           | Duel from inline prompts                                |
| `duel-create-from-deck` | Duel from a deck's cards (`deckId`, `limit`)            |
| `duel-answer`           | Submit one side; decides when both are in               |
| `tournament-create`     | Seed a bracket                                          |
| `tournament-result`     | Record a match result                                   |

`GET /api/leagues?view=list|detail|standings` reads leagues, one league's
full detail (players, divisions, rounds, duels, tournaments, champion), or
a single division table.

## CLI

```
leagues list
leagues create <slug> "<title>" [--season-start DATE] [--round-days N]
               [--promote N] [--relegate N]
leagues join <slug> <handle>
leagues standings <slug> [--tier bronze|silver|gold|platinum|diamond]
leagues players <slug>
leagues points <slug> <handle> [--reviews N | --focus-minutes N]
leagues close-round <slug>
leagues rounds <slug>
leagues duel create <slug> <playerA> <playerB> [--league <slug>]
                   --prompt "id::question::ans1|ans2" [--prompt …]
leagues duel from-deck <slug> <deckId> <playerA> <playerB> [--league s]
                        [--limit N] [--seed N]
leagues duel answer <slug> <A|B> --answer "promptId::answer::ms" [--answer …]
leagues duel list [--league <slug>] [--status open|complete]
leagues tournament create <slug> "<title>" <seed1,seed2,…> [--league <slug>]
leagues tournament open <slug>
leagues tournament result <slug> <round> <position> <winner> [--duel <id>]
leagues tournament list [--league <slug>] [--status open|complete]
```

## MCP

Sixteen tools mirror the repository surface: `league_create`,
`league_join`, `league_standings`, `league_players`, `league_award_points`,
`league_close_round`, `league_rounds`, `league_list`, `duel_create`,
`duel_create_from_deck`, `duel_answer`, `duel_list`, `tournament_create`,
`tournament_open_matches`, `tournament_record_result`, `tournament_list`.

## Web UI

`/leagues` has four tabs. **Overview**: create a league, join one, and pick
the active league. **Standings**: the five-division table with the current
leader badge, the point-logging form, and round control (close round, round
history). **Duels**: league duels with live status badges, plus create
(inline prompts or from a deck) and answer forms. **Tournaments**: brackets
with per-match result recording. The end-to-end season lifecycle is covered
by `apps/web/tests/ui/leagues.spec.ts`.

## Implementation map

- Engine (pure, schema-validated): `packages/core/src/leagues/engine.ts`
  (`closeRound`, `decideDuel`, `createTournament`, `buildDuelPromptsFromCards`).
- Persistence (5 tables — `leagues`, `league_players`, `league_rounds`,
  `league_duels`, `league_tournaments`): `packages/db/src/repos/leagues.ts`.
- REST: `apps/server` leagues routes; web handler
  `apps/web/src/server/handlers/leagues/route.ts`.
- MCP: `apps/mcp/src/tools/leagues.ts`. CLI: `apps/cli/src/commands/leagues.ts`.
- UI: `apps/web/app/leagues/page.tsx`.
