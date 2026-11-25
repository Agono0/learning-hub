/**
 * Shared Material Channels — publish from library: turn an existing deck or
 * course into a channel (or a channel update) without hand-writing item
 * JSON. Pure mapping lives in core (`share-channels/publish.ts`); this repo
 * does the reads and composes `createChannel` / `publishUpdate`.
 */
import {
  courseLessonsToChannelItems,
  createChannel,
  deckCardsToChannelItems,
  diffPublishableItems,
  publishUpdate,
  type ChannelManifest,
  type ChannelVisibility,
  type PublishableCard,
  type PublishableLesson,
} from '@learning-hub/core'
import { eq } from 'drizzle-orm'

import { getDb, type LearningHubDB } from '../index'
import { cards } from '../schema'
import { exportCurriculum } from './curriculum'

export interface PublishFromLibraryResult {
  ok: boolean
  manifest?: ChannelManifest
  /** Cards skipped because their format is not channel-transportable. */
  skipped?: { cardId: number; reason: string }[]
  /** What changed relative to the previous channel version (updates only). */
  changeSummary?: { added: string[]; removed: string[]; changed: string[] }
  error?: string
}

/** Create a deck channel from every transportable card in a deck. */
export function publishDeckAsChannel(input: {
  deckId: number
  channelId: string
  title: string
  authorHandle: string
  visibility: ChannelVisibility
  description?: string
  changelog?: string
  now?: string
  database?: LearningHubDB
}): PublishFromLibraryResult {
  const database = input.database ?? getDb()
  const rows = database.select().from(cards).where(eq(cards.deckId, input.deckId)).all()
  const publishable: PublishableCard[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    tags: r.tags,
  }))
  const { items, skipped } = deckCardsToChannelItems(publishable)
  if (items.length === 0) {
    return { ok: false, error: 'deck has no transportable cards (basic or cloze)', skipped }
  }
  const manifest = createChannel({
    channelId: input.channelId,
    type: 'deck',
    title: input.title,
    authorHandle: input.authorHandle,
    visibility: input.visibility,
    items,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.changelog !== undefined ? { changelog: input.changelog } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  })
  return { ok: true, manifest, skipped }
}

/** Create a course channel from every lesson in a course. */
export function publishCourseAsChannel(input: {
  courseId: number
  channelId: string
  authorHandle: string
  visibility: ChannelVisibility
  changelog?: string
  now?: string
  database?: LearningHubDB
}): PublishFromLibraryResult {
  const database = input.database ?? getDb()
  const spec = exportCurriculum(input.courseId, database)
  if (!spec) return { ok: false, error: `course ${input.courseId} not found` }
  const lessons: PublishableLesson[] = spec.modules.flatMap((m) =>
    m.lessons.map((l) => ({
      slug: l.slug,
      title: l.title,
      objective: l.objective,
      estMinutes: l.estMinutes,
      summary: l.summary,
      theory: l.theory,
    })),
  )
  const items = courseLessonsToChannelItems(lessons)
  if (items.length === 0) return { ok: false, error: 'course has no lessons' }
  const manifest = createChannel({
    channelId: input.channelId,
    type: 'course',
    title: spec.title,
    authorHandle: input.authorHandle,
    visibility: input.visibility,
    items,
    ...(spec.description !== undefined && spec.description !== null
      ? { description: spec.description }
      : {}),
    ...(input.changelog !== undefined ? { changelog: input.changelog } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  })
  return { ok: true, manifest }
}

/**
 * Re-derive a deck channel's items from the library and publish the next
 * version. The change summary tells the creator exactly what subscribers
 * will see: which items were added, removed or changed.
 */
export function publishDeckUpdateFromLibrary(input: {
  deckId: number
  manifest: ChannelManifest
  changelog: string
  now?: string
  database?: LearningHubDB
}): PublishFromLibraryResult {
  const database = input.database ?? getDb()
  const rows = database.select().from(cards).where(eq(cards.deckId, input.deckId)).all()
  const publishable: PublishableCard[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    tags: r.tags,
  }))
  const { items, skipped } = deckCardsToChannelItems(publishable)
  if (items.length === 0) {
    return { ok: false, error: 'deck has no transportable cards (basic or cloze)', skipped }
  }
  const latest = input.manifest.versions[input.manifest.versions.length - 1]
  const changeSummary = diffPublishableItems(latest.items, items)
  const manifest = publishUpdate(input.manifest, items, input.changelog, input.now)
  return { ok: true, manifest, skipped, changeSummary }
}
