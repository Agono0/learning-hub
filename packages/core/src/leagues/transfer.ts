/**
 * League transfer envelopes (`lh-leagues-transfer/v1`) — portable full-state
 * export/import of a competitive league: config, players, closed rounds,
 * duels, tournaments, season archives and Elo history. Used to move a league
 * between devices (local-first has no server authority) or to back one up.
 * Pure domain logic; persistence mapping lives in packages/db repos/leagues.
 */
import { z } from 'zod'

import { hashString } from '../math'
import { LeagueSchema } from './engine'
import { DuelSchema } from './duels'
import { TournamentSchema } from './tournaments'

export const LEAGUE_TRANSFER_SCHEMA = 'lh-leagues-transfer/v1'

const roundRowSchema = z.object({
  round: z.number().int().nonnegative(),
  closedAt: z.string(),
  promotionsJson: z.array(z.object({ handle: z.string(), from: z.string(), to: z.string() })),
  relegationsJson: z.array(z.object({ handle: z.string(), from: z.string(), to: z.string() })),
  winnersJson: z.array(z.object({ tier: z.string(), handle: z.string() })),
})

const playerRowSchema = z.object({
  handle: z.string().min(1),
  tier: z.string(),
  points: z.number().int(),
  seasonPoints: z.number().int(),
  roundsWon: z.number().int().nonnegative(),
  duelsWon: z.number().int().nonnegative(),
  duelsLost: z.number().int().nonnegative(),
  elo: z.number().int(),
  joinedAt: z.string(),
})

const seasonRowSchema = z.object({
  season: z.number().int().positive(),
  champion: z.string().nullable(),
  finalStandingsJson: z.array(
    z.object({
      handle: z.string(),
      tier: z.string(),
      seasonPoints: z.number().int(),
      roundsWon: z.number().int().nonnegative(),
      elo: z.number().int(),
    }),
  ),
  closedAt: z.string(),
})

const eloEventRowSchema = z.object({
  /** Slug of the duel this event belongs to (ids are remapped on import). */
  duelSlug: z.string(),
  handle: z.string(),
  opponent: z.string(),
  result: z.enum(['win', 'loss', 'draw']),
  eloBefore: z.number().int(),
  eloAfter: z.number().int(),
  createdAt: z.string(),
})

/**
 * The transferable payload. Duels and tournaments travel as their core
 * schema payloads (id = public slug) plus the db-side status fields, so an
 * import can rebuild rows without trusting foreign autoincrement ids.
 */
export const leagueTransferPayloadSchema = z.object({
  league: LeagueSchema,
  players: z.array(playerRowSchema),
  rounds: z.array(roundRowSchema),
  duels: z.array(
    z.object({
      duel: DuelSchema,
      status: z.enum(['open', 'complete']),
      winner: z.string().nullable(),
      completedAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  tournaments: z.array(
    z.object({
      tournament: TournamentSchema,
      status: z.enum(['open', 'complete']),
      createdAt: z.string(),
    }),
  ),
  seasons: z.array(seasonRowSchema),
  eloEvents: z.array(eloEventRowSchema),
})
export type LeagueTransferPayload = z.infer<typeof leagueTransferPayloadSchema>

export const leagueTransferSchema = z.object({
  v: z.literal(1),
  schema: z.literal(LEAGUE_TRANSFER_SCHEMA),
  exportedAt: z.string(),
  payload: leagueTransferPayloadSchema,
  checksum: z.string().min(4),
})
export type LeagueTransfer = z.infer<typeof leagueTransferSchema>

/** Stable JSON for checksumming (key order is fixed by construction). */
export function checksumTransferPayload(payload: LeagueTransferPayload): string {
  return hashString(JSON.stringify(payload)).toString(16).padStart(8, '0')
}

/** Wrap a gathered payload into a checksummed transfer envelope. */
export function createLeagueTransfer(input: LeagueTransferPayload): LeagueTransfer {
  // Normalize through the schema first so the checksum is computed over the
  // same canonical key order that parseLeagueTransfer re-serializes.
  const payload = leagueTransferPayloadSchema.parse(input)
  return {
    v: 1,
    schema: LEAGUE_TRANSFER_SCHEMA,
    exportedAt: new Date().toISOString(),
    payload,
    checksum: checksumTransferPayload(payload),
  }
}

/**
 * Parse and verify a transfer envelope (JSON string or already-parsed
 * object). Throws on schema violations and on checksum mismatch — a
 * hand-edited export is rejected, not silently half-imported.
 */
export function parseLeagueTransfer(raw: string | unknown): LeagueTransfer {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  const transfer = leagueTransferSchema.parse(value)
  if (transfer.checksum !== checksumTransferPayload(transfer.payload)) {
    throw new Error('league transfer checksum mismatch — the file was edited or corrupted')
  }
  return transfer
}
