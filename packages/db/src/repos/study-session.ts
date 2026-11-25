/**
 * Study session repository: one read-only pipeline for the API, CLI and MCP.
 * It reads card columns (never content) for every card in scope, runs core's
 * pure selector, then fetches labels for the picked cards only. It never
 * writes a card, a schedule or a review.
 *
 * Reads are bounded. If more than STUDY_SESSION_LIMITS.maxScan cards are in
 * scope the request is refused, because sampling would make "no card matched"
 * and "these are the weakest cards" untrue. Narrow by deck instead.
 */
import { count, inArray } from 'drizzle-orm'
import {
  parseStudySessionFilter,
  selectStudySession,
  STUDY_SESSION_LIMITS,
  type SessionSelection,
  type StudySessionFilter,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, decks } from '../schema'
import { cardLabel } from './exam-prep'

export interface StudySessionCard {
  id: number
  deckId: number
  deck: string
  label: string
  state: number
  lapses: number
  due: string
  dueInDays: number
  recall: number | null
  tags: string[]
}

export interface StudySessionRun {
  asOf: string
  scanned: number
  excluded: SessionSelection['excluded']
  funnel: SessionSelection['funnel']
  matched: number
  selected: number
  truncated: boolean
  noRecallEstimate: number
  fingerprint: string
  cards: StudySessionCard[]
  /** The review queue link for exactly these cards, in this order. Empty when nothing matched. */
  startHref: string
  assumptions: string[]
  note: string
}

export type StudySessionResult =
  { ok: true; value: StudySessionRun } | { ok: false; status: 400 | 422; error: string }

export const STUDY_SESSION_NOTE =
  'Nothing here is scheduled or reviewed for you. Start opens the review queue on exactly these cards. You answer each one yourself and it counts as a real review.'

/** The review queue URL for an ordered list of card ids. */
export function reviewHrefForIds(ids: readonly number[]): string {
  return ids.length ? `/review?cardIds=${ids.join(',')}` : ''
}

const CHUNK = 500

export async function runStudySession(
  input: unknown,
  opts: { db?: LearningHubDB; now?: Date } = {},
): Promise<StudySessionResult> {
  const parsed = parseStudySessionFilter(input)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  const filter: StudySessionFilter = parsed.filter
  const db = opts.db ?? getDb()
  const now = opts.now ?? new Date()

  const scope = filter.deckIds ? inArray(cards.deckId, filter.deckIds) : undefined
  const total = db.select({ n: count() }).from(cards).where(scope).get()?.n ?? 0
  if (total > STUDY_SESSION_LIMITS.maxScan)
    return {
      ok: false,
      status: 422,
      error: `${total} cards are in scope, which is more than the ${STUDY_SESSION_LIMITS.maxScan} a session can scan. Choose one or a few decks.`,
    }

  const rows = db
    .select({
      id: cards.id,
      deckId: cards.deckId,
      tags: cards.tags,
      state: cards.state,
      due: cards.due,
      stability: cards.stability,
      lapses: cards.lapses,
      lastReview: cards.lastReview,
      suspended: cards.suspended,
      buryUntil: cards.buryUntil,
      createdAt: cards.createdAt,
    })
    .from(cards)
    .where(scope)
    .all()

  const sel = selectStudySession(rows, filter, now)

  const ids = sel.selected.map((p) => p.id)
  const labels = new Map<number, string>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (const r of db
      .select({ id: cards.id, content: cards.content })
      .from(cards)
      .where(inArray(cards.id, ids.slice(i, i + CHUNK)))
      .all())
      labels.set(r.id, cardLabel(r.content))
  }
  const deckIds = [...new Set(sel.selected.map((p) => p.deckId))]
  const deckNames = new Map<number, string>()
  if (deckIds.length)
    for (const d of db
      .select({ id: decks.id, name: decks.name })
      .from(decks)
      .where(inArray(decks.id, deckIds))
      .all())
      deckNames.set(d.id, d.name)

  return {
    ok: true,
    value: {
      asOf: sel.asOf,
      scanned: sel.scanned,
      excluded: sel.excluded,
      funnel: sel.funnel,
      matched: sel.matched,
      selected: sel.selected.length,
      truncated: sel.truncated,
      noRecallEstimate: sel.noRecallEstimate,
      fingerprint: sel.fingerprint,
      cards: sel.selected.map((p) => ({
        id: p.id,
        deckId: p.deckId,
        deck: deckNames.get(p.deckId) ?? `Deck ${p.deckId}`,
        label: labels.get(p.id) ?? 'Card',
        state: p.state,
        lapses: p.lapses,
        due: p.due,
        dueInDays: p.dueInDays,
        recall: p.recall,
        tags: p.tags,
      })),
      startHref: reviewHrefForIds(ids),
      assumptions: sel.assumptions,
      note: STUDY_SESSION_NOTE,
    },
  }
}
