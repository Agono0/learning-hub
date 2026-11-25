/**
 * Single-elimination tournaments over league players. Brackets are generated
 * deterministically from seed order; each match is a duel.
 */
import { z } from 'zod'

export const TournamentMatchSchema = z.object({
  round: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  playerA: z.string().min(1).optional(),
  playerB: z.string().min(1).optional(),
  winner: z.string().min(1).optional(),
  duelId: z.string().min(1).optional(),
})
export type TournamentMatch = z.infer<typeof TournamentMatchSchema>

export const TournamentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  seeds: z.array(z.string().min(1)).min(2),
  matches: z.array(TournamentMatchSchema),
  champion: z.string().min(1).optional(),
  createdAt: z.string().min(1),
})
export type Tournament = z.infer<typeof TournamentSchema>

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/**
 * Build a seeded single-elimination bracket. Seeds are paired 1-vs-last,
 * 2-vs-second-to-last, and byes (when the field is not a power of two) go to
 * the top seeds: a seed with no opponent in round 1 auto-advances.
 */
export function createTournament(
  id: string,
  title: string,
  seeds: string[],
  now?: string,
): Tournament {
  if (seeds.length < 2) throw new Error('a tournament needs at least 2 seeds')
  const size = nextPowerOfTwo(seeds.length)
  const matches: TournamentMatch[] = []
  // round 1 pairings: seed i vs seed (size-1-i); missing opponent = bye
  const round1Count = size / 2
  for (let pos = 0; pos < round1Count; pos++) {
    const a = seeds[pos]
    const b = seeds[size - 1 - pos]
    const match: TournamentMatch = { round: 1, position: pos }
    if (a !== undefined) match.playerA = a
    if (b !== undefined) match.playerB = b
    if (a !== undefined && b === undefined) match.winner = a // bye
    matches.push(match)
  }
  // later rounds: empty slots waiting on winners
  for (let round = 2, count = round1Count / 2; count >= 1; round++, count /= 2) {
    for (let pos = 0; pos < count; pos++) matches.push({ round, position: pos })
  }
  const t = TournamentSchema.parse({
    id,
    title,
    seeds,
    matches,
    createdAt: now ?? new Date().toISOString(),
  })
  return propagateByes(t)
}

/** Advance any match whose winner is decided into the next round's slot. */
export function propagateByes(tournament: Tournament): Tournament {
  const matches = tournament.matches.map((m) => ({ ...m }))
  let changed = true
  while (changed) {
    changed = false
    const rounds = Math.max(...matches.map((m) => m.round))
    for (let round = 1; round < rounds; round++) {
      const current = matches
        .filter((m) => m.round === round)
        .sort((a, b) => a.position - b.position)
      for (let i = 0; i < current.length; i += 2) {
        const m1 = current[i]
        const m2 = current[i + 1]
        const next = matches.find((m) => m.round === round + 1 && m.position === i / 2)
        if (!next) continue
        if (m1?.winner && !next.playerA) {
          next.playerA = m1.winner
          changed = true
        }
        if (m2?.winner && !next.playerB) {
          next.playerB = m2.winner
          changed = true
        }
      }
    }
  }
  // a final with both players decided by bye is impossible; champion needs a played final
  return TournamentSchema.parse({ ...tournament, matches })
}

/** Record a duel result for one open match and advance the winner. */
export function recordMatchResult(
  tournament: Tournament,
  round: number,
  position: number,
  winner: string,
  duelId: string,
): Tournament {
  const matches = tournament.matches.map((m) => ({ ...m }))
  const match = matches.find((m) => m.round === round && m.position === position)
  if (!match) throw new Error(`no match at round ${round} position ${position}`)
  if (match.winner) throw new Error('match already decided')
  if (winner !== match.playerA && winner !== match.playerB) {
    throw new Error('winner must be one of the match players')
  }
  match.winner = winner
  match.duelId = duelId
  const advanced = propagateByes(TournamentSchema.parse({ ...tournament, matches }))
  const finalRound = Math.max(...advanced.matches.map((m) => m.round))
  const final = advanced.matches.find((m) => m.round === finalRound)
  const champion = final?.winner
  return TournamentSchema.parse({ ...advanced, ...(champion ? { champion } : {}) })
}

/** Matches ready to play: both players set, no winner yet. */
export function openMatches(tournament: Tournament): TournamentMatch[] {
  return tournament.matches.filter((m) => m.playerA && m.playerB && !m.winner)
}
