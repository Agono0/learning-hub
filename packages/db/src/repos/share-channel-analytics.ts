/**
 * Channel analytics: manifest-derived stats from core, composed with this
 * instance's tables — proposal activity for hosted channels and sync outcomes
 * for subscriptions.
 */
import { and, eq, sql } from 'drizzle-orm'
import { manifestAnalytics, type ChannelManifestAnalytics } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { channelProposals, shareChannelSyncRecords } from '../schema'
import { getHostedChannel } from './share-channel-host'

export interface ChannelAnalytics extends ChannelManifestAnalytics {
  proposals: {
    total: number
    open: number
    accepted: number
    declined: number
    /** Authors with at least one accepted proposal, most accepted first. */
    topContributors: { authorHandle: string; accepted: number }[]
  }
}

export function hostedChannelAnalytics(
  channelId: string,
  db: LearningHubDB = getDb(),
): { ok: boolean; error?: string; analytics?: ChannelAnalytics } {
  const manifest = getHostedChannel(channelId, db)
  if (!manifest) return { ok: false, error: `channel '${channelId}' is not hosted here` }
  const base = manifestAnalytics(manifest)
  const counts = db
    .select({
      status: channelProposals.status,
      n: sql<number>`count(*)`,
    })
    .from(channelProposals)
    .where(eq(channelProposals.channelId, channelId))
    .groupBy(channelProposals.status)
    .all()
  const byStatus = new Map(counts.map((c) => [c.status, c.n]))
  const topContributors = db
    .select({
      authorHandle: channelProposals.authorHandle,
      accepted: sql<number>`count(*)`,
    })
    .from(channelProposals)
    .where(and(eq(channelProposals.channelId, channelId), eq(channelProposals.status, 'accepted')))
    .groupBy(channelProposals.authorHandle)
    .all()
    .sort((a, b) => b.accepted - a.accepted)
    .slice(0, 10)
  return {
    ok: true,
    analytics: {
      ...base,
      proposals: {
        total: counts.reduce((acc, c) => acc + c.n, 0),
        open: byStatus.get('open') ?? 0,
        accepted: byStatus.get('accepted') ?? 0,
        declined: byStatus.get('declined') ?? 0,
        topContributors,
      },
    },
  }
}

/** Subscriber-side sync health for one channel. */
export function subscriptionSyncStats(
  channelId: string,
  db: LearningHubDB = getDb(),
): {
  totalSyncs: number
  updated: number
  alreadyCurrent: number
  failed: number
  lastSyncAt: string | null
  lastError: string | null
} {
  const rows = db
    .select()
    .from(shareChannelSyncRecords)
    .where(eq(shareChannelSyncRecords.channelId, channelId))
    .all()
    .sort((a, b) => (a.at < b.at ? 1 : -1))
  const byOutcome = new Map<string, number>()
  for (const r of rows) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1)
  const lastFailure = rows.find((r) => r.outcome === 'failed')
  return {
    totalSyncs: rows.length,
    updated: byOutcome.get('updated') ?? 0,
    alreadyCurrent: byOutcome.get('already-current') ?? 0,
    failed: byOutcome.get('failed') ?? 0,
    lastSyncAt: rows[0]?.at ?? null,
    lastError: lastFailure?.errorMessage ?? null,
  }
}
