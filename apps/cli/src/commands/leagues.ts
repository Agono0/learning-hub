/**
 * `leagues` CLI command — competitive study leagues (lh-leagues/v1):
 * seasonal divisions with promotion/relegation, head-to-head duels and
 * seeded tournaments, over the shared leagues repository (repos/leagues).
 *
 *   leagues list
 *   leagues create <slug> "<title>" [--season-start DATE] [--round-days N]
 *                  [--promote N] [--relegate N]
 *   leagues join <slug> <handle>
 *   leagues standings <slug> [--tier bronze|silver|gold|platinum|diamond]
 *   leagues players <slug>
 *   leagues points <slug> <handle> [--reviews N | --focus-minutes N]
 *   leagues close-round <slug>
 *   leagues close-due
 *   leagues rounds <slug>
 *   leagues duel create <slug> <playerA> <playerB> [--league <slug>]
 *                      --prompt "id::question::ans1|ans2" [--prompt …]
 *   leagues duel answer <slug> <A|B> --answer "promptId::answer::ms" [--answer …]
 *   leagues duel list [--league <slug>] [--status open|complete]
 *   leagues tournament create <slug> "<title>" <seed1,seed2,…> [--league <slug>]
 *   leagues tournament open <slug>
 *   leagues tournament result <slug> <round> <position> <winner> [--duel <id>]
 *   leagues tournament list [--league <slug>] [--status open|complete]
 */
import {
  awardLeaguePoints,
  createDuelFromDeck,
  closeDueRounds,
  closeLeagueRound,
  createLeagueDuel,
  createLeagueRow,
  createLeagueTournament,
  getLeagueBySlug,
  joinLeagueRow,
  leagueChampion,
  leagueStandings,
  listLeagueDuels,
  listLeaguePlayers,
  listLeagueRounds,
  listLeagueRows,
  listLeagueTournaments,
  openTournamentMatches,
  recordTournamentMatchResult,
  submitDuelAnswers,
} from '@learning-hub/db'
import { DIVISION_ORDER, type DivisionTier } from '@learning-hub/core'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return undefined
}

function parseAll(args: string[], flag: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) out.push(args[i + 1]!)
  }
  return out
}

const TIERS = DIVISION_ORDER.join('|')
const USAGE =
  'Usage: learning-hub leagues [list | create <slug> "<title>" […] | join <slug> <handle> | standings <slug> [--tier t] | players <slug> | points <slug> <handle> [--reviews N|--focus-minutes N] | close-round <slug> | rounds <slug> | duel … | tournament …]'

function fail(msg: string): void {
  console.error(msg)
  process.exitCode = 1
}

function listLeaguesCommand(): void {
  const rows = listLeagueRows()
  if (rows.length === 0) {
    console.log('No leagues yet — try `learning-hub leagues create spring "Spring Season"`.')
    return
  }
  console.log(
    panel(
      'LEAGUES',
      rows.map(
        (l) =>
          `${l.slug}  ${l.title}\n     round ${l.currentRound} · ${l.roundLengthDays}-day rounds · promotes ${l.promotionSlots} / relegates ${l.relegationSlots}`,
      ),
    ),
  )
}

function createLeagueCommand(args: string[]): void {
  const [slug, title] = args
  if (!slug || !title?.trim()) {
    return fail(
      'Usage: learning-hub leagues create <slug> "<title>" [--season-start DATE] [--round-days N] [--promote N] [--relegate N]',
    )
  }
  if (getLeagueBySlug(slug)) return fail(`league already exists: ${slug}`)
  try {
    const league = createLeagueRow({
      slug,
      title,
      seasonStart: parseFlag(args, '--season-start'),
      roundLengthDays: num(parseFlag(args, '--round-days')),
      promotionSlots: num(parseFlag(args, '--promote')),
      relegationSlots: num(parseFlag(args, '--relegate')),
    })
    console.log(
      `Created league ${league.slug} — "${league.title}" (season starts ${league.seasonStart}).`,
    )
  } catch (err) {
    fail(err instanceof Error ? err.message : 'league creation failed')
  }
}

function num(v: string | undefined): number | undefined {
  return v === undefined ? undefined : Number(v)
}

function joinCommand(args: string[]): void {
  const [slug, handle] = args
  if (!slug || !handle) return fail('Usage: learning-hub leagues join <slug> <handle>')
  try {
    const p = joinLeagueRow(slug, handle)
    console.log(`${p.handle} joined ${slug} in ${p.tier} (elo ${p.elo}).`)
  } catch (err) {
    fail(err instanceof Error ? err.message : 'join failed')
  }
}

function standingsCommand(args: string[]): void {
  const [slug] = args
  if (!slug) return fail('Usage: learning-hub leagues standings <slug> [--tier tier]')
  const tier = parseFlag(args, '--tier') as DivisionTier | undefined
  if (tier && !DIVISION_ORDER.includes(tier)) return fail(`tier must be one of: ${TIERS}`)
  if (tier) {
    const rows = leagueStandings(slug, tier)
    console.log(
      panel(
        `STANDINGS · ${slug} · ${tier}`,
        rows.length > 0
          ? rows.map((r, i) => `${i + 1}. ${r.handle} — ${r.points} pts (${r.seasonPoints} season)`)
          : ['no players in this division'],
      ),
    )
    return
  }
  console.log(
    panel(
      `STANDINGS · ${slug}`,
      DIVISION_ORDER.map((t) => {
        const rows = leagueStandings(slug, t)
        const body =
          rows.length > 0
            ? rows
                .slice(0, 5)
                .map(
                  (r, i) => `  ${i + 1}. ${r.handle} — ${r.points} pts (${r.seasonPoints} season)`,
                )
                .join('\n')
            : '  (empty)'
        return `${t.toUpperCase()}\n${body}`
      }).concat(`Champion: ${leagueChampion(slug) ?? '—'}`),
    ),
  )
}

function playersCommand(args: string[]): void {
  const [slug] = args
  if (!slug) return fail('Usage: learning-hub leagues players <slug>')
  const rows = listLeaguePlayers(slug)
  console.log(
    panel(
      `PLAYERS · ${slug}`,
      rows.length > 0
        ? rows.map(
            (p) =>
              `${p.handle} [${p.tier}] — ${p.points} pts, ${p.seasonPoints} season · ${p.roundsWon} rounds won · duels ${p.duelsWon}W/${p.duelsLost}L · elo ${p.elo}`,
          )
        : ['no players yet'],
    ),
  )
}

function pointsCommand(args: string[]): void {
  const [slug, handle] = args
  const reviews = num(parseFlag(args, '--reviews'))
  const focus = num(parseFlag(args, '--focus-minutes'))
  if (!slug || !handle || (reviews === undefined && focus === undefined)) {
    return fail(
      'Usage: learning-hub leagues points <slug> <handle> [--reviews N | --focus-minutes N]',
    )
  }
  try {
    const event =
      reviews !== undefined
        ? ({ kind: 'reviews', handle, count: reviews } as const)
        : ({ kind: 'focus', handle, minutes: focus! } as const)
    const p = awardLeaguePoints(slug, event)
    if (!p) return fail(`${handle} is not in ${slug}`)
    console.log(`${p.handle} now has ${p.points} points this round in ${slug}.`)
  } catch (err) {
    fail(err instanceof Error ? err.message : 'points failed')
  }
}

function closeDueCommand(): void {
  const closed = closeDueRounds()
  if (closed.length === 0) {
    console.log('No league rounds are due.')
    return
  }
  for (const c of closed) console.log(`${c.slug}: closed round ${c.roundClosed}`)
  console.log(`Closed ${closed.length} round(s).`)
}

function closeRoundCommand(args: string[]): void {
  const [slug] = args
  if (!slug) return fail('Usage: learning-hub leagues close-round <slug>')
  try {
    const r = closeLeagueRound(slug)
    const lines = [
      ...r.promoted.map((p) => `↑ ${p.handle} ${p.from} → ${p.to}`),
      ...r.relegated.map((p) => `↓ ${p.handle} ${p.from} → ${p.to}`),
    ]
    console.log(
      panel(`ROUND ${r.round.round} CLOSED · ${slug}`, lines.length > 0 ? lines : ['no movement']),
    )
  } catch (err) {
    fail(err instanceof Error ? err.message : 'close-round failed')
  }
}

function roundsCommand(args: string[]): void {
  const [slug] = args
  if (!slug) return fail('Usage: learning-hub leagues rounds <slug>')
  const rows = listLeagueRounds(slug)
  console.log(
    panel(
      `ROUNDS · ${slug}`,
      rows.length > 0
        ? rows.map(
            (r) =>
              `round ${r.round} (closed ${r.closedAt.slice(0, 10)}) — ${r.promotionsJson.length} promoted, ${r.relegationsJson.length} relegated`,
          )
        : ['no closed rounds yet'],
    ),
  )
}

function duelCommand(args: string[]): void {
  const sub = args[0]
  if (sub === 'create') {
    const [, slug, playerA, playerB] = args
    const prompts = parseAll(args, '--prompt').map((raw) => {
      const [id, question, answers] = raw.split('::')
      if (!id || !question || !answers)
        throw new Error('--prompt must be "id::question::ans1|ans2"')
      return { id, question, answers: answers.split('|') }
    })
    if (!slug || !playerA || !playerB || prompts.length === 0) {
      return fail(
        'Usage: learning-hub leagues duel create <slug> <playerA> <playerB> --prompt "id::question::ans1|ans2" [--league s]',
      )
    }
    try {
      const d = createLeagueDuel({
        slug,
        playerA,
        playerB,
        prompts,
        leagueSlug: parseFlag(args, '--league'),
      })
      console.log(
        `Duel ${d.slug} created: ${d.playerA} vs ${d.playerB} (${prompts.length} prompts).`,
      )
    } catch (err) {
      fail(err instanceof Error ? err.message : 'duel creation failed')
    }
    return
  }
  if (sub === 'from-deck') {
    const [, slug, deckId, playerA, playerB] = args
    if (!slug || !deckId || !playerA || !playerB) {
      return fail(
        'Usage: learning-hub leagues duel from-deck <slug> <deckId> <playerA> <playerB> [--league s] [--limit N] [--seed N]',
      )
    }
    try {
      const d = createDuelFromDeck({
        slug,
        deckId: Number(deckId),
        playerA,
        playerB,
        leagueSlug: parseFlag(args, '--league'),
        limit: num(parseFlag(args, '--limit')),
        seed: num(parseFlag(args, '--seed')),
      })
      console.log(`Duel ${d.slug} created from deck ${deckId} (${d.promptsJson.length} prompts).`)
    } catch (err) {
      fail(err instanceof Error ? err.message : 'duel creation failed')
    }
    return
  }
  if (sub === 'answer') {
    const [, slug, side] = args
    const answers = parseAll(args, '--answer').map((raw) => {
      const [promptId, answer, ms] = raw.split('::')
      if (!promptId || answer === undefined || !ms)
        throw new Error('--answer must be "promptId::answer::ms"')
      return { promptId, answer, elapsedMs: Number(ms) }
    })
    if (!slug || (side !== 'A' && side !== 'B') || answers.length === 0) {
      return fail(
        'Usage: learning-hub leagues duel answer <slug> <A|B> --answer "promptId::answer::ms"',
      )
    }
    try {
      const r = submitDuelAnswers(slug, side, answers)
      console.log(
        r.decided
          ? `Duel ${slug} decided — winner: ${r.winner ?? 'draw'}.`
          : `Answers recorded for side ${side}; waiting on the other player.`,
      )
    } catch (err) {
      fail(err instanceof Error ? err.message : 'answer submission failed')
    }
    return
  }
  if (sub === 'list') {
    const rows = listLeagueDuels({
      leagueSlug: parseFlag(args, '--league'),
      status: parseFlag(args, '--status') as 'open' | 'complete' | undefined,
    })
    console.log(
      panel(
        'DUELS',
        rows.length > 0
          ? rows.map(
              (d) =>
                `${d.slug} [${d.status}] ${d.playerA} vs ${d.playerB}${d.winner ? ` — winner ${d.winner}` : d.status === 'complete' ? ' — draw' : ''}`,
            )
          : ['no duels yet'],
      ),
    )
    return
  }
  fail('Usage: learning-hub leagues duel [create|from-deck|answer|list] …')
}

function tournamentCommand(args: string[]): void {
  const sub = args[0]
  if (sub === 'create') {
    const [, slug, title, seedsRaw] = args
    const seeds = (seedsRaw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!slug || !title?.trim() || seeds.length < 2) {
      return fail(
        'Usage: learning-hub leagues tournament create <slug> "<title>" <seed1,seed2,…> [--league s]',
      )
    }
    try {
      const t = createLeagueTournament({
        slug,
        title,
        seeds,
        leagueSlug: parseFlag(args, '--league'),
      })
      console.log(
        `Tournament ${t.slug} created with ${seeds.length} seeds (${t.matchesJson.length} matches).`,
      )
    } catch (err) {
      fail(err instanceof Error ? err.message : 'tournament creation failed')
    }
    return
  }
  if (sub === 'open') {
    const [, slug] = args
    if (!slug) return fail('Usage: learning-hub leagues tournament open <slug>')
    const matches = openTournamentMatches(slug)
    console.log(
      panel(
        `OPEN MATCHES · ${slug}`,
        matches.length > 0
          ? matches.map((m) => `round ${m.round} #${m.position}: ${m.playerA} vs ${m.playerB}`)
          : ['no playable matches right now'],
      ),
    )
    return
  }
  if (sub === 'result') {
    const [, slug, round, position, winner] = args
    if (!slug || !round || position === undefined || !winner) {
      return fail(
        'Usage: learning-hub leagues tournament result <slug> <round> <position> <winner> [--duel id]',
      )
    }
    try {
      const t = recordTournamentMatchResult(
        slug,
        Number(round),
        Number(position),
        winner,
        parseFlag(args, '--duel'),
      )
      console.log(
        t.status === 'complete'
          ? `Tournament ${slug} complete — champion: ${t.champion}.`
          : `Recorded: ${winner} advances in ${slug}.`,
      )
    } catch (err) {
      fail(err instanceof Error ? err.message : 'result rejected')
    }
    return
  }
  if (sub === 'list') {
    const rows = listLeagueTournaments({
      leagueSlug: parseFlag(args, '--league'),
      status: parseFlag(args, '--status') as 'open' | 'complete' | undefined,
    })
    console.log(
      panel(
        'TOURNAMENTS',
        rows.length > 0
          ? rows.map(
              (t) =>
                `${t.slug} [${t.status}] ${t.title} — ${t.seedsJson.length} seeds${t.champion ? ` · champion ${t.champion}` : ''}`,
            )
          : ['no tournaments yet'],
      ),
    )
    return
  }
  fail('Usage: learning-hub leagues tournament [create|open|result|list] …')
}

function leaguesCommand(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') return listLeaguesCommand()
  if (sub === 'create') return createLeagueCommand(args.slice(1))
  if (sub === 'join') return joinCommand(args.slice(1))
  if (sub === 'standings') return standingsCommand(args.slice(1))
  if (sub === 'players') return playersCommand(args.slice(1))
  if (sub === 'points') return pointsCommand(args.slice(1))
  if (sub === 'close-round') return closeRoundCommand(args.slice(1))
  if (sub === 'close-due') return closeDueCommand()
  if (sub === 'rounds') return roundsCommand(args.slice(1))
  if (sub === 'duel') return duelCommand(args.slice(1))
  if (sub === 'tournament') return tournamentCommand(args.slice(1))
  fail(USAGE)
}

export const leaguesCommands: RegisteredCommand[] = [
  {
    name: 'leagues',
    description: 'Competitive leagues, duels, and tournaments',
    usage: '[list|create|join|standings|players|points|close-round|rounds|duel|tournament]',
    run: (runArgs) => leaguesCommand(runArgs),
  },
]
