/**
 * Learning HUB headless server — PLANNING routes (readiness, exam prep, study session). Read-only
 * model estimates served by the same repo pipelines as the web handlers (readiness, exam-prep,
 * study-session/preview), the MCP tools and the CLI: runReadiness, runExamPrep, runStudySession.
 * Nothing is scheduled or reviewed. The query contracts and the `{ ok, error }` failure bodies match
 * the web handlers exactly; tests/e2e compares the two hosts on the same database.
 *
 * Every figure carries the report's own `assumptions`: these are estimates, not exam scores.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { listReadinessExams, runExamPrep, runReadiness, runStudySession } from '@learning-hub/db'
import { sendJson } from '../http'
import type { Route } from './shared'

/** Rows of "which cards a review budget helps most" returned by GET /readiness (as on the web). */
const MAX_GAIN_ROWS = 50

function fail(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { ok: false, error })
}

/** `1,2,3` → numbers; the element bounds are checked by the schema that follows. */
const csvInts = (min: number, max: number, items: number) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map(Number),
    )
    .pipe(z.array(z.number().int().min(min).max(max)).max(items))

const readinessQuery = z.object({
  examId: z.coerce.number().int().positive().optional(),
  date: z.string().max(40).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  plan: z.enum(['none', 'on-schedule', 'capacity']).default('on-schedule'),
  perDay: z.coerce.number().int().min(0).max(1000).default(20),
  target: z.coerce.number().min(0.5).max(0.99).default(0.85),
  deckIds: csvInts(1, Number.MAX_SAFE_INTEGER, 200).optional(),
  budget: z.coerce.number().int().min(0).max(5000).default(20),
})

const examPrepQuery = z.object({
  examId: z.coerce.number().int().positive().optional(),
  date: z.string().max(40).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  target: z.coerce.number().min(0.5).max(0.99).default(0.85),
  perDay: z.coerce.number().int().min(0).max(100).default(30),
  minGain: z.coerce.number().min(0).max(0.5).default(0.01),
  maxReviewsPerCard: z.coerce.number().int().min(1).max(10).default(3),
  rest: csvInts(0, 6, 7).optional(),
  deckIds: csvInts(1, Number.MAX_SAFE_INTEGER, 200).optional(),
})

const NUMERIC = ['minLapses', 'maxLapses', 'recallBelow', 'dueByDays', 'limit'] as const
const LISTS = ['deckIds', 'tags', 'states'] as const

/**
 * Query string → the raw filter runStudySession validates (same conversion as the web preview
 * route: unknown keys pass through so the repo rejects them, blanks and non-integers become NaN).
 */
function studySessionFilter(params: URLSearchParams): Record<string, unknown> {
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

/** GET /readiness — no examId/date: the saved exam anchors; else the readiness report. */
async function getReadiness(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const parsed = readinessQuery.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return fail(res, 400, 'invalid query')
  const q = parsed.data
  if (q.examId === undefined && q.date === undefined) {
    return sendJson(res, 200, { ok: true, exams: listReadinessExams() })
  }
  const run = await runReadiness(q, { maxGainRows: MAX_GAIN_ROWS })
  if (!run.ok) return fail(res, run.status, run.error)
  sendJson(res, 200, { ok: true, ...run.value })
}

/** GET /exam-prep?examId=|date=… — a day-by-day review schedule toward an exam date. */
async function getExamPrep(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const parsed = examPrepQuery.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return fail(res, 400, 'invalid query')
  const { rest, ...q } = parsed.data
  if (q.examId === undefined && q.date === undefined) {
    return fail(res, 400, 'examId or date is required')
  }
  const run = await runExamPrep({ ...q, restWeekdays: rest })
  if (!run.ok) return fail(res, run.status, run.error)
  sendJson(res, 200, { ok: true, ...run.value })
}

/** GET /study-session/preview?deckIds=&tags=&states=&… — at most 100 cards and the review link. */
async function getStudySessionPreview(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const run = await runStudySession(studySessionFilter(url.searchParams))
  if (!run.ok) return fail(res, run.status, run.error)
  sendJson(res, 200, { ok: true, ...run.value })
}

export const planningRoutes: Route[] = [
  {
    method: 'GET',
    path: '/readiness',
    summary: 'exam anchors, or a readiness report (?examId= | ?date=) (runReadiness)',
    handler: getReadiness,
  },
  {
    method: 'GET',
    path: '/exam-prep',
    summary: 'day-by-day review plan toward an exam date (runExamPrep)',
    handler: getExamPrep,
  },
  {
    method: 'GET',
    path: '/study-session/preview',
    summary: 'bounded card set for a study session, read-only (runStudySession)',
    handler: getStudySessionPreview,
  },
]
