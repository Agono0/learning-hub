/**
 * Shared Material Channels — import execution: turn a subscription's local
 * items into library artifacts (a reviewable deck, or a curriculum course).
 * Re-imports are idempotent: deck cards upsert by sourceKey so content
 * refreshes in place while FSRS state survives; courses go through
 * importCurriculum, which already re-imports by slug.
 */
import {
  channelCardSourceKey,
  channelDeckName,
  channelItemsToCourseSpec,
  channelItemsToDeckCards,
  type ChannelManifest,
  type PayloadIssue,
} from '@learning-hub/core'
import { eq } from 'drizzle-orm'

import { getDb, type LearningHubDB } from '../index'
import { cards } from '../schema'
import { findOrCreateDeck } from './cards'
import { importCurriculum, type CurriculumImportReport } from './curriculum'
import { DbChannelSyncStore, listChannelSubscriptions } from './share-channels'

export interface ChannelDeckImportResult {
  ok: boolean
  deckId?: number
  deckName?: string
  created?: number
  updated?: number
  itemCount?: number
  issues?: PayloadIssue[]
  error?: string
}

export interface ChannelCourseImportResult {
  ok: boolean
  report?: CurriculumImportReport
  courseSlug?: string
  issues?: PayloadIssue[]
  error?: string
}

function subscriptionRow(channelId: string, database?: LearningHubDB) {
  void database
  return listChannelSubscriptions().find((r) => r.channelId === channelId) ?? null
}

/** Minimal manifest view reconstructed from the stored subscription row. */
function manifestViewOf(
  channelId: string,
  row: ReturnType<typeof subscriptionRow>,
): Pick<
  ChannelManifest,
  'channelId' | 'title' | 'description' | 'authorHandle' | 'currentVersion'
> & {
  description: string
} {
  return {
    channelId,
    title: row?.title || `Channel ${channelId}`,
    description: '',
    authorHandle: row?.authorHandle || 'unknown',
    currentVersion: row?.seenVersion ?? row?.localVersion ?? 1,
  }
}

/**
 * Import the local items of a deck channel into a reviewable deck. Existing
 * channel cards update in place by sourceKey; their FSRS scheduling state is
 * never touched. New items become new cards due immediately.
 */
export function importChannelDeck(
  channelId: string,
  opts: { database?: LearningHubDB; now?: Date } = {},
): ChannelDeckImportResult {
  const database = opts.database ?? getDb()
  const store = new DbChannelSyncStore()
  const subscription = store.getSubscription(channelId)
  if (!subscription) return { ok: false, error: 'no local subscription for this channel' }
  const row = subscriptionRow(channelId, database)
  if (row && row.contentType !== 'deck') {
    return { ok: false, error: `channel is a ${row.contentType}, not a deck` }
  }

  const items = store.getLocalItems(channelId)
  const { cards: drafts, issues } = channelItemsToDeckCards(items)
  if (drafts.length === 0) {
    return { ok: false, error: 'no importable card items', issues }
  }

  const manifest = manifestViewOf(channelId, row)
  const deck = findOrCreateDeck(channelDeckName(manifest), { emoji: '📡', db: database })
  const due = (opts.now ?? new Date()).toISOString()

  let created = 0
  let updated = 0
  for (const draft of drafts) {
    const sourceKey = channelCardSourceKey(channelId, draft.itemKey)
    const existing = database
      .select()
      .from(cards)
      .where(eq(cards.sourceKey, sourceKey))
      .limit(1)
      .all()[0]
    const content = { basic: { front: draft.front, back: draft.back } }
    if (existing) {
      const current = existing.content as { basic?: { front: string; back: string } }
      const changed = current.basic?.front !== draft.front || current.basic?.back !== draft.back
      if (changed) {
        // Content-only update: FSRS state (due, stability, reps…) untouched.
        database
          .update(cards)
          .set({ content, tags: draft.tags })
          .where(eq(cards.id, existing.id))
          .run()
        updated += 1
      }
    } else {
      database
        .insert(cards)
        .values({
          deckId: deck.id,
          type: 'basic',
          content,
          tags: draft.tags,
          source: 'channel',
          sourceKey,
          due,
        })
        .run()
      created += 1
    }
  }

  return {
    ok: true,
    deckId: deck.id,
    deckName: deck.name,
    created,
    updated,
    itemCount: drafts.length,
    issues,
  }
}

/**
 * Import the local items of a course channel as a curriculum course. Goes
 * through importCurriculum, so re-imports after a channel update refresh the
 * course in place (same slug) and keep lesson-completion state.
 */
export function importChannelCourse(
  channelId: string,
  opts: { database?: LearningHubDB } = {},
): ChannelCourseImportResult {
  const database = opts.database ?? getDb()
  const store = new DbChannelSyncStore()
  const subscription = store.getSubscription(channelId)
  if (!subscription) return { ok: false, error: 'no local subscription for this channel' }
  const row = subscriptionRow(channelId, database)
  if (row && row.contentType !== 'course') {
    return { ok: false, error: `channel is a ${row.contentType}, not a course` }
  }

  const items = store.getLocalItems(channelId)
  const manifest = manifestViewOf(channelId, row) as ChannelManifest
  const { spec, issues } = channelItemsToCourseSpec(manifest, items)
  if (!spec) {
    return { ok: false, error: 'no importable lesson items', issues }
  }
  const report = importCurriculum(spec, database)
  return { ok: true, report, courseSlug: spec.slug, issues }
}
