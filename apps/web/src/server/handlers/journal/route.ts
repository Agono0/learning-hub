import { calendarDay } from '@/lib/query-params'
import { z } from 'zod'
import { listJournalEntries, upsertJournalEntry } from '@learning-hub/db'
import { dayKey, validateJournalEntry } from '@learning-hub/core'
import { readJson, tzOffsetFromQuery, tzOffsetSchema, withRoute } from '@/lib/api'

/** GET /api/journal?from=YYYY-MM-DD&to=YYYY-MM-DD&tzOffset=N — entries in range (default: today). */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tz = tzOffsetFromQuery(req)
  const from = url.searchParams.get('from') ?? dayKey(new Date(), tz)
  const to = url.searchParams.get('to') ?? from
  const rows = listJournalEntries({ from, to })
  return Response.json({ entries: rows, from, to })
}

const postJournalSchema = z.object({
  date: calendarDay.optional(),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  smallWins: z.string().nullable().optional(),
  gratitude: z.string().nullable().optional(),
  worryDump: z.string().nullable().optional(),
  tzOffset: tzOffsetSchema,
})

/**
 * POST /api/journal { date?, mood?, smallWins?, gratitude?, worryDump?, tzOffset? }
 * — upsert the day's entry. XP (source 'journal') is paid once, on first write of the day.
 */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postJournalSchema)
  const date = body.date ?? dayKey(new Date(), body.tzOffset)
  const trimOrNull = (v?: string | null): string | null =>
    v !== undefined && v !== null && v.trim() !== '' ? v.trim() : null
  const mood = body.mood ?? null
  const smallWins = trimOrNull(body.smallWins)
  const gratitude = trimOrNull(body.gratitude)
  const worryDump = trimOrNull(body.worryDump)

  const validation = validateJournalEntry({ mood, smallWins, gratitude, worryDump })
  if (!validation.ok)
    return Response.json(
      { error: validation.errors.join(' '), errors: validation.errors },
      { status: 400 },
    )

  const res = upsertJournalEntry({
    date,
    mood,
    smallWins,
    gratitude,
    worryDump,
  })

  return Response.json(
    { entry: res.entry, created: res.created, xpAwarded: res.xpAwarded },
    { status: res.created ? 201 : 200 },
  )
})
