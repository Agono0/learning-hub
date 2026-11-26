/**
 * /api/elaborative-interrogation/bank: persistent fact bank, adaptive state and
 * attempt log (packages/db repos/elaborative-interrogation). The stateless
 * sibling route (../route.ts) stays available for clients that keep their own
 * state. Grading and scheduling are the same core functions on both routes.
 */
import { z } from 'zod'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'
import {
  addEiFact,
  archiveEiFact,
  getEiQueue,
  listEiAttempts,
  listEiCalibrationPoints,
  listEiFacts,
  listEiStates,
  parseEngineId,
  recordEiAttempt,
  withTransaction,
} from '@learning-hub/db'
import {
  calibrationReport,
  extractFacts,
  promptStyleSchema,
} from '@learning-hub/core/elaborative-interrogation'

const todaySchema = z.coerce.number().int().min(0)
const querySchema = z.object({
  today: todaySchema.default(() => Math.floor(Date.now() / 86_400_000)),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/** GET /api/elaborative-interrogation/bank?today&limit: facts, states, queue, calibration, recent attempts. */
export const GET = withRoute(async (req: Request) => {
  const { today, limit } = readQuery(req, querySchema)
  const { queue, summary } = getEiQueue(today, limit)
  return Response.json({
    facts: listEiFacts(),
    states: listEiStates(),
    queue,
    summary,
    calibration: calibrationReport(listEiCalibrationPoints()),
    recent: listEiAttempts({ limit: 20 }).map((a) => ({
      id: a.id,
      factId: `db${a.factId}`,
      style: a.style,
      score: a.score,
      band: a.band,
      createdAt: a.createdAt,
    })),
  })
})

const factIdSchema = z.string().regex(/^db\d+$/, 'Expected a stored fact id like db12')

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    statement: z.string().min(8).max(600),
    keyTerms: z.array(z.string().min(1).max(60)).max(12).default([]),
    priorKnowledge: z.number().min(0).max(1).default(0.5),
  }),
  z.object({
    action: z.literal('import'),
    text: z.string().min(1).max(60_000),
    max: z.number().int().min(1).max(100).default(30),
  }),
  z.object({
    action: z.literal('attempt'),
    factId: factIdSchema,
    answer: z.string().max(4000),
    predicted: z.number().min(0).max(100).optional(),
    style: promptStyleSchema.optional(),
    today: z
      .number()
      .int()
      .min(0)
      .default(() => Math.floor(Date.now() / 86_400_000)),
  }),
  z.object({ action: z.literal('archive'), factId: factIdSchema }),
])

function rowId(id: string): number {
  const n = parseEngineId(id)
  if (n === null) throw new ApiError(400, 'Invalid fact id')
  return n
}

/** POST /api/elaborative-interrogation/bank { action: add | import | attempt | archive }. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bodySchema)
  switch (body.action) {
    case 'add':
      return Response.json(
        {
          fact: addEiFact({
            statement: body.statement,
            keyTerms: body.keyTerms,
            priorKnowledge: body.priorKnowledge,
          }),
        },
        { status: 201 },
      )
    case 'import': {
      const candidates = extractFacts(body.text, body.max)
      const added = withTransaction((tx) =>
        candidates.map((c) =>
          addEiFact(
            { statement: c.statement, keyTerms: c.keyTerms, priorKnowledge: c.priorKnowledge },
            tx,
          ),
        ),
      )
      return Response.json({ added }, { status: 201 })
    }
    case 'attempt': {
      try {
        const r = recordEiAttempt({
          factId: rowId(body.factId),
          answer: body.answer,
          today: body.today,
          style: body.style,
          predicted: body.predicted,
        })
        return Response.json(r)
      } catch (e) {
        if (e instanceof Error && /not found/.test(e.message)) throw new ApiError(404, e.message)
        throw e
      }
    }
    case 'archive': {
      const ok = archiveEiFact(rowId(body.factId))
      if (!ok) throw new ApiError(404, 'Fact not found')
      return Response.json({ ok: true })
    }
  }
})
