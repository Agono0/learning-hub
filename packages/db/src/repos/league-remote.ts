/**
 * @fileoverview Local bookkeeping for remote league authority links.
 *
 * INACTIVE GROUNDWORK (see apps/worker LeagueRoom). A link records which
 * remote league this device talks to and the next signing sequence number.
 * Holds no keys and no scores: the authority owns standings, the local
 * database only remembers where it stopped signing.
 */
import { and, eq } from 'drizzle-orm'
import { leagueRemoteLinks } from '../schema'
import { getDb, type LearningHubDB } from '../index'
import { withTransaction } from '../transaction'

export type LeagueRemoteLink = typeof leagueRemoteLinks.$inferSelect

const REMOTE_ID_RE = /^[a-z0-9][a-z0-9-]{5,39}$/

export class LeagueRemoteInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LeagueRemoteInputError'
  }
}

/** Normalize and validate a worker base URL: https only, no path or query. */
export function normalizeRemoteServerUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new LeagueRemoteInputError('server URL is not a valid URL')
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new LeagueRemoteInputError('server URL must use https')
  }
  if (url.username || url.password) {
    throw new LeagueRemoteInputError('server URL must not carry credentials')
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new LeagueRemoteInputError('server URL must be a bare origin')
  }
  return url.origin
}

export function isValidRemoteLeagueId(id: string): boolean {
  return REMOTE_ID_RE.test(id)
}

/** Idempotently link this device to one remote league. */
export function linkRemoteLeague(
  input: { serverUrl: string; remoteLeagueId: string },
  database?: LearningHubDB,
): LeagueRemoteLink {
  const serverUrl = normalizeRemoteServerUrl(input.serverUrl)
  if (!isValidRemoteLeagueId(input.remoteLeagueId)) {
    throw new LeagueRemoteInputError('remote league id must be 6-40 lowercase letters, digits or -')
  }
  return withTransaction((tx) => {
    const existing = tx
      .select()
      .from(leagueRemoteLinks)
      .where(
        and(
          eq(leagueRemoteLinks.serverUrl, serverUrl),
          eq(leagueRemoteLinks.remoteLeagueId, input.remoteLeagueId),
        ),
      )
      .get()
    if (existing) return existing
    return tx
      .insert(leagueRemoteLinks)
      .values({ serverUrl, remoteLeagueId: input.remoteLeagueId })
      .returning()
      .get()
  }, database)
}

export function getRemoteLink(
  serverUrl: string,
  remoteLeagueId: string,
  database?: LearningHubDB,
): LeagueRemoteLink | undefined {
  const conn = database ?? getDb()
  return conn
    .select()
    .from(leagueRemoteLinks)
    .where(
      and(
        eq(leagueRemoteLinks.serverUrl, normalizeRemoteServerUrl(serverUrl)),
        eq(leagueRemoteLinks.remoteLeagueId, remoteLeagueId),
      ),
    )
    .get()
}

export function listRemoteLinks(database?: LearningHubDB): LeagueRemoteLink[] {
  const conn = database ?? getDb()
  return conn.select().from(leagueRemoteLinks).all()
}

/**
 * Atomically take the next signing sequence number. The counter advances in
 * the same transaction that hands the number out, so two callers can never
 * receive the same one. Returns undefined for an unknown link.
 */
export function reserveNextSeq(linkId: number, database?: LearningHubDB): number | undefined {
  return withTransaction((tx) => {
    const row = tx.select().from(leagueRemoteLinks).where(eq(leagueRemoteLinks.id, linkId)).get()
    if (!row) return undefined
    tx.update(leagueRemoteLinks)
      .set({ nextSeq: row.nextSeq + 1 })
      .where(eq(leagueRemoteLinks.id, linkId))
      .run()
    return row.nextSeq
  }, database)
}

/**
 * After the authority rejects with bad_seq the local counter is behind (for
 * example after a restore from backup). Jump past the highest value we have
 * evidence of; never move backwards.
 */
export function bumpSeqAtLeast(linkId: number, atLeast: number, database?: LearningHubDB): void {
  withTransaction((tx) => {
    const row = tx.select().from(leagueRemoteLinks).where(eq(leagueRemoteLinks.id, linkId)).get()
    if (!row || row.nextSeq >= atLeast) return
    tx.update(leagueRemoteLinks)
      .set({ nextSeq: atLeast })
      .where(eq(leagueRemoteLinks.id, linkId))
      .run()
  }, database)
}

export function recordRemoteOutcome(
  linkId: number,
  status: string,
  now: Date = new Date(),
  database?: LearningHubDB,
): void {
  const conn = database ?? getDb()
  conn
    .update(leagueRemoteLinks)
    .set({ lastStatus: status.slice(0, 60), lastSyncedAt: now.toISOString() })
    .where(eq(leagueRemoteLinks.id, linkId))
    .run()
}
