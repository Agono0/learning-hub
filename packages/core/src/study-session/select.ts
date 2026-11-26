import { calculateRetrievability, FSRS6_DEFAULT_DECAY } from '../fsrs'
import type {
  FunnelStep,
  SessionCardRow,
  SessionPick,
  SessionSelection,
  StudySessionFilter,
} from './model'

const DAY_MS = 86_400_000

/** FNV-1a over the ordered ids. Detects a changed set between preview and Start. Not a security hash. */
export function sessionFingerprint(ids: readonly number[]): string {
  let h = 0x811c9dc5
  const s = ids.join(',')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Estimated recall now from the default FSRS-6 forgetting curve, or null with no usable state. */
export function estimateRecall(card: SessionCardRow, nowMs: number): number | null {
  if (card.state === 0 || !(card.stability > 0) || !card.lastReview) return null
  const last = Date.parse(card.lastReview)
  if (Number.isNaN(last)) return null
  const r = calculateRetrievability(
    card.stability,
    Math.max(0, (nowMs - last) / DAY_MS),
    card.decay ?? FSRS6_DEFAULT_DECAY,
  )
  return Number.isFinite(r) ? r : null
}

interface Work {
  row: SessionCardRow
  dueMs: number
  recall: number | null
}

const cmpId = (a: Work, b: Work) => a.row.id - b.row.id

/**
 * Pick the session. Pure and deterministic: same rows, filter and clock give
 * the same ids in the same order, with ties broken by card id.
 *
 * Suspended and buried cards are never picked, because the review queue
 * refuses them. Each filter narrows the one before it, and the funnel reports
 * the count after every step so an empty result says which filter emptied it.
 */
export function selectStudySession(
  rows: readonly SessionCardRow[],
  filter: StudySessionFilter,
  now: Date,
): SessionSelection {
  const nowMs = now.getTime()
  const nowIso = now.toISOString()
  const excluded = { suspended: 0, buried: 0, unreadableDue: 0 }
  let work: Work[] = []
  for (const row of rows) {
    if (row.suspended) {
      excluded.suspended++
      continue
    }
    if (row.buryUntil != null && row.buryUntil > nowIso) {
      excluded.buried++
      continue
    }
    const dueMs = Date.parse(row.due)
    if (Number.isNaN(dueMs)) {
      excluded.unreadableDue++
      continue
    }
    work.push({ row, dueMs, recall: null })
  }

  const funnel: FunnelStep[] = [{ key: 'eligible', label: 'Studyable cards', count: work.length }]
  const step = (key: FunnelStep['key'], label: string) =>
    funnel.push({ key, label, count: work.length })

  if (filter.deckIds) {
    const decks = new Set(filter.deckIds)
    work = work.filter((w) => decks.has(w.row.deckId))
    step('deck', 'In the chosen decks')
  }
  if (filter.tags) {
    const want = filter.tags
    work = work.filter((w) => want.every((t) => w.row.tags.includes(t)))
    step('tags', 'With every chosen tag')
  }
  if (filter.states) {
    const states = new Set<number>(filter.states)
    work = work.filter((w) => states.has(w.row.state))
    step('states', 'In the chosen states')
  }
  if (filter.minLapses !== undefined || filter.maxLapses !== undefined) {
    const lo = filter.minLapses ?? 0
    const hi = filter.maxLapses ?? Number.MAX_SAFE_INTEGER
    work = work.filter((w) => w.row.lapses >= lo && w.row.lapses <= hi)
    step('lapses', 'Within the lapse range')
  }
  if (filter.dueByDays !== undefined) {
    const limit = nowMs + filter.dueByDays * DAY_MS
    work = work.filter((w) => w.dueMs <= limit)
    step('due', 'Due in the window')
  }
  let noRecallEstimate = 0
  if (filter.recallBelow !== undefined) {
    const below = filter.recallBelow
    const kept: Work[] = []
    for (const w of work) {
      w.recall = estimateRecall(w.row, nowMs)
      if (w.recall === null) noRecallEstimate++
      else if (w.recall < below) kept.push(w)
    }
    work = kept
    step('recall', 'Estimated recall below the limit')
  }

  const matched = work.length
  const decaySource = { custom: 0, default: 0 }
  for (const w of work) {
    if (w.recall === null) w.recall = estimateRecall(w.row, nowMs)
    if (w.recall !== null) {
      if (w.row.decay != null) decaySource.custom++
      else decaySource.default++
    }
  }

  const order: Record<StudySessionFilter['sort'], (a: Work, b: Work) => number> = {
    'most-overdue': (a, b) => a.dueMs - b.dueMs || cmpId(a, b),
    'lowest-recall': (a, b) =>
      (a.recall ?? Infinity) - (b.recall ?? Infinity) || a.dueMs - b.dueMs || cmpId(a, b),
    'most-lapses': (a, b) => b.row.lapses - a.row.lapses || a.dueMs - b.dueMs || cmpId(a, b),
    newest: (a, b) =>
      (a.row.createdAt < b.row.createdAt ? 1 : a.row.createdAt > b.row.createdAt ? -1 : 0) ||
      cmpId(a, b),
  }
  work.sort(order[filter.sort])
  const chosen = work.slice(0, filter.limit)
  const selected: SessionPick[] = chosen.map((w) => ({
    id: w.row.id,
    deckId: w.row.deckId,
    state: w.row.state,
    lapses: w.row.lapses,
    due: w.row.due,
    dueInDays: Math.round(((w.dueMs - nowMs) / DAY_MS) * 10) / 10,
    recall: w.recall === null ? null : Math.round(w.recall * 1000) / 1000,
    tags: [...w.row.tags],
  }))

  return {
    asOf: nowIso,
    scanned: rows.length,
    excluded,
    funnel,
    matched,
    selected,
    truncated: matched > filter.limit,
    fingerprint: sessionFingerprint(selected.map((s) => s.id)),
    noRecallEstimate,
    decaySource,
    assumptions: [
      decaySource.custom > 0
        ? `Estimated recall is the model's estimate as of ${nowIso.slice(0, 10)} from each card's stored stability and last review. ${decaySource.custom} of ${decaySource.custom + decaySource.default} matching cards use the forgetting-curve decay from your stored FSRS weights (deck weights, else global). The rest use the default FSRS-6 decay. The weights are not refit here, and it is not a validated prediction.`
        : `Estimated recall is the model's estimate as of ${nowIso.slice(0, 10)} from the default FSRS-6 forgetting curve and each card's stored stability and last review. No custom weights were found for these cards, and it is not a validated prediction.`,
      'New cards and cards with no stored stability or last review have no recall estimate.',
      'Suspended and buried cards are left out because the review queue refuses them.',
      'The list is a snapshot. Start opens exactly these cards. If one changed since this preview, the review queue refuses the list and you can preview again.',
      'Picking cards does not schedule or review anything. You answer each card yourself in the normal queue, and it counts as a real review.',
    ],
  }
}
