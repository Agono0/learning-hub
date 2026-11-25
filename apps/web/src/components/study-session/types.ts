/** Shapes returned by GET /api/study-session/preview (mirrors db's StudySessionRun, JSON-safe), plus form-to-query logic. */
export interface SessionCardDto {
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

export interface FunnelStepDto {
  key: string
  label: string
  count: number
}

export interface StudySessionDto {
  ok: true
  asOf: string
  scanned: number
  excluded: { suspended: number; buried: number; unreadableDue: number }
  funnel: FunnelStepDto[]
  matched: number
  selected: number
  truncated: boolean
  noRecallEstimate: number
  fingerprint: string
  cards: SessionCardDto[]
  startHref: string
  assumptions: string[]
  note: string
}

export const STATE_NAMES = ['New', 'Learning', 'Review', 'Relearning'] as const
export const SORTS = [
  { value: 'most-overdue', label: 'Most overdue first' },
  { value: 'lowest-recall', label: 'Lowest estimated recall first' },
  { value: 'most-lapses', label: 'Most lapses first' },
  { value: 'newest', label: 'Newest cards first' },
] as const
export const DUE_WINDOWS = [
  { value: '', label: 'Any due date' },
  { value: '0', label: 'Due now or overdue' },
  { value: '7', label: 'Due within 7 days' },
  { value: '30', label: 'Due within 30 days' },
] as const

/** Mirrors the review queue's explicit-list cap, so Start never truncates. */
export const MAX_SESSION_CARDS = 100

export interface SessionForm {
  deckId: string
  tags: string
  states: number[]
  minLapses: string
  recallBelowPct: string
  dueBy: string
  sort: string
  limit: string
}

export const EMPTY_FORM: SessionForm = {
  deckId: '',
  tags: '',
  states: [],
  minLapses: '',
  recallBelowPct: '',
  dueBy: '',
  sort: 'most-overdue',
  limit: '20',
}

export type QueryResult = { ok: true; query: Record<string, string> } | { ok: false; error: string }

function wholeNumber(raw: string, min: number, max: number): number | null {
  const t = raw.trim()
  if (!/^\d{1,6}$/.test(t)) return null
  const n = Number(t)
  return n >= min && n <= max ? n : null
}

/**
 * Turn the form into query parameters. Bad input is an error shown to the
 * learner, never clamped: a session should hold what the filters say.
 */
export function buildSessionQuery(form: SessionForm): QueryResult {
  const q: Record<string, string> = { sort: form.sort }
  const limit = wholeNumber(form.limit, 1, MAX_SESSION_CARDS)
  if (limit === null)
    return { ok: false, error: `Cards per session must be 1 to ${MAX_SESSION_CARDS}.` }
  q.limit = String(limit)
  if (form.deckId) q.deckIds = form.deckId
  const tags = form.tags
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)
  if (tags.length > 10) return { ok: false, error: 'Use at most 10 tags.' }
  if (tags.length) q.tags = tags.join(',')
  if (form.states.length) q.states = [...form.states].sort().join(',')
  if (form.minLapses.trim()) {
    const n = wholeNumber(form.minLapses, 0, 1000)
    if (n === null) return { ok: false, error: 'Minimum lapses must be a whole number, 0 to 1000.' }
    q.minLapses = String(n)
  }
  if (form.recallBelowPct.trim()) {
    const n = wholeNumber(form.recallBelowPct, 1, 99)
    if (n === null) return { ok: false, error: 'Estimated recall below must be 1 to 99 percent.' }
    q.recallBelow = String(n / 100)
  }
  if (form.dueBy !== '') q.dueByDays = form.dueBy
  return { ok: true, query: q }
}

export const pct = (n: number | null): string =>
  n === null ? 'no estimate' : `${Math.round(n * 100)}%`

/** Which step of the funnel first left zero cards, or null when something matched. */
export function emptiedBy(funnel: FunnelStepDto[]): FunnelStepDto | null {
  return funnel.find((s) => s.count === 0) ?? null
}

export function dueLabel(days: number): string {
  if (days < -0.5) return `${Math.round(-days)} days overdue`
  if (days <= 0.5) return 'due now'
  return `due in ${Math.round(days)} days`
}
