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

### Seasons

A league plays `seasonLengthRounds` rounds per season (default 10, set at
creation with `--season-rounds` / `seasonLengthRounds`). Closing the last
round ends the season automatically: the leader of the highest non-empty
division is crowned **champion**, the final table is archived
(`league_seasons`, readable via `GET /leagues/seasons`, `leagues seasons`,
or `league_seasons`), everyone restarts in **bronze** with zeroed points,
and the season counter bumps. Elo, roundsWon and duel records are career
stats and carry across seasons. The due-round sweep interacts correctly:
a long-inactive league catches up to its season boundary, archives the
season, and stops (the new season starts today, so nothing further is due).

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

## Scheduling

Round boundaries are deterministic UTC math: a round ends at `seasonStart`
(UTC midnight) plus `(currentRound + 1) × roundLengthDays`. Nothing closes
rounds automatically in the background — call the sweep
(`POST /leagues/close-due`, `leagues close-due`, or `league_close_due`)
from a cron job, OS scheduler, or app launch. The sweep closes every
elapsed round, recording empty catch-up rounds silently (no XP, no
notifications) and capping at 104 closes per league per call.

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
leagues close-due
leagues rounds <slug>
leagues seasons <slug>
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
`league_close_round`, `league_close_due`, `league_rounds`, `league_list`, `duel_create`,
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

## Export / import (transfer envelopes)

A league's full state travels as a single `lh-leagues-transfer/v1` JSON
envelope: config, players, closed rounds, duels, tournaments, season
archives and the complete Elo history. The envelope carries a checksum over
the payload, so a hand-edited or corrupted file is rejected on import.

- **Export** gathers everything into one checksummed document.
- **Import** always creates a NEW league: the league slug and every
  duel/tournament slug must be free (slugs are globally unique). Nothing is
  ever overwritten. Elo history references duels by slug, so the new numeric
  row ids are remapped automatically.

Use it to move a league between devices (local-first has no server
authority) or to keep a backup before a new season.

- REST: `GET /leagues/export?slug=…` and `POST /leagues/import` with
  `{ "transfer": <envelope> }`.
- Web API: `GET /api/leagues?view=export&slug=…` and action `import` with
  `{ action: 'import', transfer: <envelope> }`.
- CLI: `learning-hub leagues export <slug> [--out FILE]` and
  `learning-hub leagues import <file>`.
- MCP: `league_export` / `league_import`.
- Web UI: the Export / import panel on the Overview tab of `/leagues`.

## Rematch

Any completed duel offers a one-call rematch: a new open duel between the
same two players in the same league, with the SAME prompts (a rematch
retests the same material, so scores stay comparable) and swapped seating
for fairness.

- REST: `POST /leagues/duels/rematch` with `{ duelSlug, newSlug }`.
- Web API: action `duel-rematch`; a Rematch button on completed duels in
  the Duels tab picks the next free `<slug>-rN` id.
- CLI: `learning-hub leagues duel rematch <duelSlug> <newSlug>`.
- MCP: `duel_rematch`.

## Head-to-head and achievements

**Head-to-head** distills every completed duel between two players into a
rivalry record — wins/draws, win rates, accuracy, correct-answer speed,
streaks, last result — plus the current Elo gap and recent duels. Seating
is irrelevant: the record counts whichever side each player sat on.

- REST: `GET /leagues/head-to-head?slug=&a=&b=`. Web API: `view=h2h`.
- CLI: `learning-hub leagues h2h <slug> <a> <b>`. MCP: `league_head_to_head`.
- Web UI: Head-to-head panel on the Standings tab of `/leagues`.

**Achievements** are a closed catalog of badges (core
`leagues/achievements`): duel milestones (first blood → veteran →
champion), Elo milestones (1200/1500/2000), division climbs
(silver→diamond), round and season titles, tournament championships, and
season-point thresholds. Evaluation is pure; the db layer banks new badges
in `league_achievements` and logs one `league`-channel notification per
unlock (prefs-honoring). Sync happens automatically when a league duel
completes and when a round closes, and on demand. Point thresholds see the
live total (banked season points plus the current round's in-progress
points) so badges unlock in real time; the round-winner badge follows the
recorded `roundsWon` stat.

- REST: `GET /leagues/achievements?slug=&handle=`. Web API:
  `view=achievements`.
- CLI: `learning-hub leagues achievements <slug> <handle>`.
- MCP: `league_achievements`, `league_achievements_sync` (one player or the
  whole league).
- Web UI: achievement badges on the player profile panel.

## Implementation map

- Engine (pure, schema-validated): `packages/core/src/leagues/engine.ts`
  (`closeRound`, `decideDuel`, `createTournament`, `buildDuelPromptsFromCards`).
- Persistence (5 tables — `leagues`, `league_players`, `league_rounds`,
  `league_duels`, `league_tournaments`): `packages/db/src/repos/leagues.ts`.
- REST: `apps/server` leagues routes; web handler
  `apps/web/src/server/handlers/leagues/route.ts`.
- Transfer envelopes: `packages/core/src/leagues/transfer.ts`
  (schema + checksum) and the export/import repo functions in
  `packages/db/src/repos/leagues.ts`.
- MCP: `apps/mcp/src/tools/leagues.ts`. CLI: `apps/cli/src/commands/leagues.ts`.
- UI: `apps/web/app/leagues/page.tsx`.

## Weekly digest

`buildLeagueDigest(slug)` composes a point-in-time recap from stored rows —
cheap to regenerate, safe to poll:

- division standings (season points, rounds won, current Elo)
- the last closed round: winners per tier, promotions, relegations
- duel activity: open/completed counts and the five most recent results
- Elo movers over the last 7 days (net delta per handle, gainers first)
- achievement badges earned in the same 7-day window

Surfaces: `GET /api/leagues?view=digest&slug=…` (web) and
`GET /leagues/digest?slug=…` (server), the Weekly digest panel on the
/leagues Overview tab, `learning-hub leagues digest <slug>`, and the
`league_digest` MCP tool.

## Auto-seeded tournaments

`seedLeagueTournamentFromStandings({ slug, leagueSlug, title, size? })` builds
a bracket straight from league standings: highest division first, then season
points, so seed 1 is the strongest player and opening matches pair
best-vs-worst. `size` caps the field (default: the whole league). Needs at
least 2 players.

Surfaces: `POST /leagues/tournaments/seed` (server), web action
`tournament-seed` plus the Seed-from-standings button in the /leagues
Tournaments tab, `learning-hub leagues tournament seed <slug> "<title>"
--league <slug> [--size N]`, and the `tournament_seed` MCP tool.

## Round schedule preview

`leagueRoundPreview(slug, { upcoming? })` reads the league's round calendar:
when the current round starts and ends, whether it is due to close (same
basis as the engine's roundEndsAt), milliseconds until the deadline, rounds
remaining, the season end date, and a preview of the next rounds (capped at
the rounds left in the season). Pure calendar math — it never writes.

Surfaces: `GET /leagues/schedule?slug=` (server), `GET
/api/leagues?view=schedule&slug=` (web, rendered as the calendar strip in
the Weekly digest panel), `learning-hub leagues schedule <slug>`, and the
`league_schedule` MCP tool.

## Duel performance stats

`leagueDuelStats(slug)` aggregates every completed duel in a league into a
per-player table: record (W-L-D), win rate, mean accuracy, mean time per
correct answer, and win streaks (current and best). Accuracy and speed use
the same scoring that decides duels, so the table doubles as a
study-strength signal (low accuracy = weak material) and a fair-matchmaking
input. Open duels never count. Sorted by win rate, then wins, then accuracy.

Surfaces: `GET /leagues/duel-stats?slug=` (server), `GET
/api/leagues?view=duel-stats&slug=` (web, rendered as the stats table above
the duel list on the Duels tab), `learning-hub leagues duel-stats <slug>`,
and the `league_duel_stats` MCP tool.

## Remote leagues (inactive groundwork)

Remote leagues let a few friends share one league room over a Cloudflare
Worker. They are local and friendly practice only. Points are local activity
scoring, Elo is frozen, and nothing here verifies skill or ranks anyone. The
whole feature is off unless the server runs with `LH_REMOTE_LEAGUES=1`. With
the flag unset, `GET /api/leagues/remote` answers `enabled: false` with no
links, every write answers 503, and the web panel does not render.

Threat model and limits: `docs/leagues-remote-threat-model.md`.

### How a change travels

1. You queue a mutation (`join`, `rename`, `leave`, `invite-create`,
   `invite-revoke`, `invite-policy`, `remove-member`, `unblock-member`, plus
   duel and round mutations).
2. The app signs it with the device key (ECDSA P-256) with a sequence number,
   timestamp and nonce, and stores it in a local queue.
3. A sync sends queued envelopes in order. The room verifies the signature,
   the sequence, the nonce and the clock window, then applies the reducer.
4. Permanent refusals (bad signature, not a member, not the founder) are
   dropped from the queue and shown. Transient ones (network, 5xx) are kept
   and retried.

Because the queue is a local file, a mutation made offline is delivered on the
next sync. A rejected join blocks later membership items in the same lane, so
a rename or leave cannot run ahead of a join that failed.

### Membership and invites

| Action           | Who may do it                          | Effect                                                                                                                 |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `join`           | Anyone with a device key               | Adds a member. Needs a valid invite when the room is invite-only.                                                      |
| `rename`         | A member                               | Changes their alias.                                                                                                   |
| `leave`          | A member                               | Removes them, cancels their open duels, revokes their invites. If the founder leaves, the next member becomes founder. |
| `invite-create`  | A member                               | Stores a digest of a code you made in the browser, with a use count and an expiry.                                     |
| `invite-revoke`  | The member who made it, or the founder | Stops the invite working.                                                                                              |
| `invite-policy`  | The founder                            | Turns invite-only on or off.                                                                                           |
| `remove-member`  | The founder                            | Removes a member like `leave`, and blocks their handle.                                                                |
| `unblock-member` | The founder                            | Lets a blocked handle join again.                                                                                      |

Invite codes are made in your browser and shown once. The room stores only a
digest, so a database leak or a spectator view cannot reveal a usable code. A
code is spent only by a join that is otherwise valid, and a blocked handle is
refused before any code is spent. The block list holds at most 200 handles and
is cleared when the league empties. A block is room-local: a new device key is
a new handle.

### CLI

```
learning-hub leagues-remote list
learning-hub leagues-remote link <serverUrl> <leagueId>
learning-hub leagues-remote enqueue <serverUrl> <leagueId> <mutation...>
learning-hub leagues-remote queue <serverUrl> <leagueId>
learning-hub leagues-remote invite-new <serverUrl> <leagueId> [--uses N] [--hours H]
```

`enqueue` takes the same words as the local mutation parser, for example
`join Bo --invite <code>`, `rename Bo`, `leave`, `invite-policy on`,
`remove-member <handle>` and `unblock-member <handle>`. Remote league ids are
6 to 40 lowercase letters, digits or hyphens.

### MCP

Read tools: `remote_league_links`, `remote_league_queue`. Enqueue tools:
`remote_league_rename`, `remote_league_leave`, `remote_league_invite_revoke`,
`remote_league_invite_policy`, `remote_league_remove_member`,
`remote_league_unblock_member`, `remote_league_transfer_founder`. There is deliberately no MCP tool that makes an
invite code, so an agent never holds one.

### Spectating

The room serves a read-only `/spectate` view with the roster, aliases,
whether the room is invite-only and how many invites are live. It never
includes digests, codes or the block list.
