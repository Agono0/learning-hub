/**
 * @file publish.ts
 * @description Shared Material Channels (lh-share/v2) — publish from library.
 *
 * Creators should not hand-write item JSON to start a channel: these pure
 * mappings turn library artifacts (a deck's cards, a course's lessons) into
 * channel item lists ready for `createChannel`. Item ids are derived from
 * stable library identifiers (card ids, lesson slugs) so later publishes of
 * the same library content keep item identity — and subscribers' merge
 * state — intact.
 *
 * Persistence reads live in packages/db; these functions stay pure so every
 * host maps identically.
 */

import type { CardContent } from '../types'

import type { ChannelItem } from './engine'

/** Minimal card shape needed for channel publishing. */
export interface PublishableCard {
  id: number
  type: string
  content: CardContent
  tags?: string[]
}

/**
 * Map deck cards to channel items. Basic cards publish as front/back
 * payloads (the deck channel contract); cloze cards publish with their
 * rendered text and the cloze answer list flattened into `back`. Cards of
 * other formats are skipped and reported — a channel must stay
 * transport-simple.
 */
export function deckCardsToChannelItems(cards: PublishableCard[]): {
  items: { id: string; content: Record<string, unknown> }[]
  skipped: { cardId: number; reason: string }[]
} {
  const items: { id: string; content: Record<string, unknown> }[] = []
  const skipped: { cardId: number; reason: string }[] = []
  for (const card of cards) {
    const basic = (card.content as { basic?: { front: string; back: string } }).basic
    if (basic && typeof basic.front === 'string' && typeof basic.back === 'string') {
      items.push({
        id: `card-${card.id}`,
        content: {
          front: basic.front,
          back: basic.back,
          ...(card.tags?.length ? { tags: card.tags } : {}),
        },
      })
      continue
    }
    const cloze = (card.content as { cloze?: { text: string } }).cloze
    if (cloze && typeof cloze.text === 'string') {
      const answers = [...cloze.text.matchAll(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/g)].map(
        (m) => m[1],
      )
      if (answers.length > 0) {
        items.push({
          id: `card-${card.id}`,
          content: {
            front: cloze.text.replace(/\{\{c\d+::([^}:]+)(?:::([^}]*))?\}\}/g, '[…]'),
            back: answers.join('; '),
            ...(card.tags?.length ? { tags: card.tags } : {}),
          },
        })
        continue
      }
    }
    skipped.push({ cardId: card.id, reason: `unsupported card format: ${card.type}` })
  }
  return { items, skipped }
}

/** Minimal lesson shape needed for channel publishing (from an LHCF course). */
export interface PublishableLesson {
  slug: string
  title: string
  objective: string
  estMinutes?: number | undefined
  summary?: string | undefined
  theory: { heading?: string | undefined; body: string }[]
}

/**
 * Map course lessons to channel items. The lesson body flattens its theory
 * sections into one markdown document so subscribers get readable lesson
 * content through the deck/course channel contract.
 */
export function courseLessonsToChannelItems(
  lessons: PublishableLesson[],
): { id: string; content: Record<string, unknown> }[] {
  return lessons.map((lesson) => ({
    id: `lesson-${lesson.slug}`,
    content: {
      title: lesson.title,
      body:
        lesson.theory
          .map((t) => (t.heading ? `## ${t.heading}\n\n${t.body}` : t.body))
          .join('\n\n') ||
        lesson.summary ||
        lesson.title,
      objectives: [lesson.objective],
      ...(lesson.estMinutes !== undefined ? { estimatedMinutes: lesson.estMinutes } : {}),
    },
  }))
}

/**
 * Re-derive the item list for a channel update from fresh library content.
 * Items whose source card/lesson disappeared are omitted, which the merge
 * reports as publisher removals (kept locally with learner state).
 */
export function diffPublishableItems(
  previous: ChannelItem[],
  next: { id: string; content: Record<string, unknown> }[],
): { added: string[]; removed: string[]; changed: string[] } {
  const prevMap = new Map(previous.map((i) => [i.id, i]))
  const nextMap = new Map(next.map((i) => [i.id, i]))
  const added = next.filter((i) => !prevMap.has(i.id)).map((i) => i.id)
  const removed = previous.filter((i) => !nextMap.has(i.id)).map((i) => i.id)
  const changed = next
    .filter((i) => {
      const prev = prevMap.get(i.id)
      return prev !== undefined && JSON.stringify(prev.content) !== JSON.stringify(i.content)
    })
    .map((i) => i.id)
  return { added, removed, changed }
}
