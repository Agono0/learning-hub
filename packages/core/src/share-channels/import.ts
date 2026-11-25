/**
 * @file import.ts
 * @description Shared Material Channels (lh-share/v2) — import integration.
 *
 * A subscription's local items are study-ready content; this module maps them
 * into the shapes the library understands: deck cards (front/back payloads)
 * and LHCF course specs (lesson payloads). The mapping is pure so every host
 * imports identically; persistence lives in packages/db (deck upserts keyed
 * by sourceKey so re-imports after a channel update refresh card content in
 * place and keep the learner's FSRS state, mirroring the channel merge
 * philosophy — and importCurriculum, which already re-imports idempotently).
 *
 * The learner's LOCAL content is imported, not the publisher's original:
 * that is the copy they see, including any edits they made.
 */

import { slugify } from '../curriculum/lhcf/slug'
import { lhcfCourseSchema, type LhcfCourse } from '../curriculum/lhcf/schema'

import {
  CourseLessonPayloadSchema,
  DeckCardPayloadSchema,
  type ChannelManifest,
  type LocalItem,
  type PayloadIssue,
} from './engine'

/** Stable deck name for a channel: re-imports land in the same deck. */
export function channelDeckName(manifest: Pick<ChannelManifest, 'title' | 'channelId'>): string {
  return manifest.title || `Channel ${manifest.channelId}`
}

/** Stable course slug for a channel. */
export function channelCourseSlug(channelId: string): string {
  return slugify(`channel-${channelId}`, 60)
}

/** Card sourceKey convention: one card per channel item, updated in place. */
export function channelCardSourceKey(channelId: string, itemKey: string): string {
  return `channel:${channelId}/${itemKey}`
}

export interface DeckCardDraft {
  itemKey: string
  front: string
  back: string
  hint?: string
  tags: string[]
}

/**
 * Map local items to deck card drafts. Learner-created items (no channel
 * item id) are included — they are part of the learner's copy. Items whose
 * content does not parse as a card payload are reported as issues, not
 * silently dropped.
 */
export function channelItemsToDeckCards(items: LocalItem[]): {
  cards: DeckCardDraft[]
  issues: PayloadIssue[]
} {
  const cards: DeckCardDraft[] = []
  const issues: PayloadIssue[] = []
  items.forEach((item, index) => {
    const itemKey = item.channelItemId ?? `local:${index}`
    const parsed = DeckCardPayloadSchema.safeParse(item.localContent)
    if (!parsed.success) {
      issues.push({
        itemId: itemKey,
        message: parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; '),
      })
      return
    }
    cards.push({
      itemKey,
      front: parsed.data.front,
      back: parsed.data.back,
      ...(parsed.data.hint !== undefined ? { hint: parsed.data.hint } : {}),
      tags: parsed.data.tags,
    })
  })
  return { cards, issues }
}

/**
 * Map a channel's local items to a complete LHCF course spec: one module
 * holding one lesson per item, in roster order. The result is validated
 * against the LHCF schema before it leaves core, so hosts can pass it
 * straight to importCurriculum.
 */
export function channelItemsToCourseSpec(
  manifest: ChannelManifest,
  items: LocalItem[],
): { spec: LhcfCourse | null; issues: PayloadIssue[] } {
  const issues: PayloadIssue[] = []
  const lessons: {
    slug: string
    title: string
    objective: string
    estMinutes?: number
    summary: string
    theory: { heading: string; body: string }[]
  }[] = []

  const usedSlugs = new Set<string>()
  items.forEach((item, index) => {
    const itemKey = item.channelItemId ?? `local:${index}`
    const parsed = CourseLessonPayloadSchema.safeParse(item.localContent)
    if (!parsed.success) {
      issues.push({
        itemId: itemKey,
        message: parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; '),
      })
      return
    }
    let slug = slugify(itemKey, 50) || `lesson-${index + 1}`
    let n = 2
    while (usedSlugs.has(slug)) {
      slug = `${slugify(itemKey, 50)}-${n}`
      n += 1
    }
    usedSlugs.add(slug)
    lessons.push({
      slug,
      title: parsed.data.title,
      objective: parsed.data.objectives[0] ?? `Understand ${parsed.data.title}`,
      ...(parsed.data.estimatedMinutes !== undefined
        ? { estMinutes: parsed.data.estimatedMinutes }
        : {}),
      summary: parsed.data.objectives.length
        ? `Objectives: ${parsed.data.objectives.join('; ')}`
        : parsed.data.title,
      theory: [{ heading: parsed.data.title, body: parsed.data.body }],
    })
  })

  if (lessons.length === 0) {
    return { spec: null, issues }
  }

  const candidate = {
    lhcf: 1 as const,
    slug: channelCourseSlug(manifest.channelId),
    title: manifest.title,
    description:
      manifest.description ||
      `Imported from shared channel ${manifest.channelId} by ${manifest.authorHandle}.`,
    author: manifest.authorHandle,
    generatedBy: 'learning-hub share-channels',
    version: String(manifest.currentVersion),
    track: 'Shared channels',
    modules: [
      {
        slug: 'channel-content',
        title: manifest.title,
        lessons,
      },
    ],
  }
  const parsed = lhcfCourseSchema.safeParse(candidate)
  if (!parsed.success) {
    issues.push({
      itemId: '(course)',
      message: parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    })
    return { spec: null, issues }
  }
  return { spec: parsed.data, issues }
}
