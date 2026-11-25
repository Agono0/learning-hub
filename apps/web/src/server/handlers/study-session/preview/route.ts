/**
 * /api/study-session/preview — choose a bounded set of cards by deck, tag,
 * state, lapses, due window and estimated recall, and get the review queue
 * link for exactly that list.
 *
 * Read-only. It does not schedule, review or change any card. At most 100
 * cards come back (the review queue's explicit-list cap), so Start never
 * truncates. Every response carries `assumptions` and a per-filter funnel.
 *
 *   GET /api/study-session/preview?tags=bio&states=2&minLapses=3&sort=most-lapses
 *   optional: deckIds=1,2  recallBelow=0.8  dueByDays=7  limit=20
 */
import { runStudySession } from '@learning-hub/db'
import { db } from '@/lib/db'
import { withRoute } from '@/lib/api'

const NUMERIC = ['minLapses', 'maxLapses', 'recallBelow', 'dueByDays', 'limit'] as const
const LISTS = ['deckIds', 'tags', 'states'] as const

/** Turn query-string text into the typed object core validates. Bad text stays a bad value, never a default. */
export function filterFromParams(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of params.keys()) {
    if (![...NUMERIC, ...LISTS, 'sort'].includes(key)) out[key] = params.get(key)
  }
  for (const key of NUMERIC) {
    const raw = params.get(key)
    if (raw !== null) out[key] = raw.trim() === '' ? NaN : Number(raw)
  }
  for (const key of LISTS) {
    const raw = params.get(key)
    if (raw === null) continue
    const parts = raw.split(',').map((x) => x.trim())
    out[key] = key === 'tags' ? parts : parts.map((x) => (/^\d+$/.test(x) ? Number(x) : NaN))
  }
  const sort = params.get('sort')
  if (sort !== null) out.sort = sort
  return out
}

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const run = await runStudySession(filterFromParams(url.searchParams), { db })
  if (!run.ok) return Response.json({ ok: false, error: run.error }, { status: run.status })
  return Response.json({ ok: true, ...run.value })
})
