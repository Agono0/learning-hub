/**
 * Read model for a remote league's public state. The reply comes from another
 * server, so it is treated as untrusted: parsed with a strict schema, names are
 * cleaned and capped, and anything unexpected yields null instead of a throw.
 *
 * Members are listed alphabetically, never ranked. Points are local activity
 * scoring from signed mutations, not a skill measure.
 */
import { z } from 'zod'

export const MAX_ROSTER_ROWS = 200
const MAX_NAME = 40

const PlayerSchema = z.object({
  handle: z.string().min(1).max(64),
  seasonPoints: z.number().int().nonnegative().max(10_000_000).default(0),
  duelsWon: z.number().int().nonnegative().default(0),
  duelsLost: z.number().int().nonnegative().default(0),
})

const StateSchema = z.object({
  league: z.object({
    title: z.string().min(1).max(200),
    currentRound: z.number().int().nonnegative().default(0),
    players: z.array(PlayerSchema).max(1000),
  }),
  aliases: z.record(z.string(), z.string()).default({}),
  inviteOnly: z.boolean().default(false),
  liveInvites: z.number().int().nonnegative().max(10_000).default(0),
})

export interface RosterMember {
  name: string
  activityPoints: number
  duels: number
}

export interface RemoteRoster {
  title: string
  round: number
  inviteOnly: boolean
  liveInvites: number
  members: RosterMember[]
  /** Members beyond MAX_ROSTER_ROWS that are not listed. */
  hidden: number
}

/** Remove control and bidi-override characters, collapse spaces, cap length. */
export function cleanName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > MAX_NAME ? `${cleaned.slice(0, MAX_NAME - 1)}…` : cleaned
}

/**
 * Accepts the route's `{ ok, remote }` envelope or the bare authority view.
 * Returns null when the reply is not a usable league state.
 */
export function parseRemoteRoster(raw: unknown): RemoteRoster | null {
  let candidate: unknown = raw
  if (raw && typeof raw === 'object' && 'remote' in raw) {
    const env = raw as { ok?: unknown; remote?: unknown }
    if (env.ok !== true) return null
    candidate = env.remote
  }
  const parsed = StateSchema.safeParse(candidate)
  if (!parsed.success) return null
  const { league, aliases, inviteOnly, liveInvites } = parsed.data
  const all: RosterMember[] = league.players.map((p) => ({
    name: cleanName(aliases[p.handle] ?? '') || 'member',
    activityPoints: p.seasonPoints,
    duels: p.duelsWon + p.duelsLost,
  }))
  all.sort((a, b) => a.name.localeCompare(b.name) || a.activityPoints - b.activityPoints)
  return {
    title: cleanName(league.title) || 'League',
    round: league.currentRound,
    inviteOnly,
    liveInvites,
    members: all.slice(0, MAX_ROSTER_ROWS),
    hidden: Math.max(0, all.length - MAX_ROSTER_ROWS),
  }
}
