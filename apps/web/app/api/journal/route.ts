import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { journalEntries, xpEvents } from '@learning-hub/db'
import { XP_REWARDS, dayKey, validateJournalEntry } from '@learning-hub/core'
import { readJson, tzOffsetFromQuery, tzOffsetSchema, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

/** GET /api/journal?from=YYYY-MM-DD&to=YYYY-MM-DD&tzOffset=N — entries in range (default: today). */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tz = tzOffsetFromQuery(req)
  const from = url.searchParams.get('from') ?? dayKey(new Date(), tz)
  const to = url.searchParams.get('to') ?? from
  const rows = db
    .select()
    .from(journalEntries)
    .where(and(gte(journalEntries.date, from), lte(journalEntries.date, to)))
    .orderBy(desc(journalEntries.date))
    .all()
  return NextResponse.json({ entries: rows, from, to })
}

const postJournalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
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
  const trimOrNull = (v?: string | null): string | null => (v !== undefined && v !== null && v.trim() !== '' ? v.trim() : null)
  const mood = body.mood ?? null
  const smallWins = trimOrNull(body.smallWins)
  const gratitude = trimOrNull(body.gratitude)
  const worryDump = trimOrNull(body.worryDump)

  const validation = validateJournalEntry({ mood, smallWins, gratitude, worryDump })
  if (!validation.ok) return NextResponse.json({ error: validation.errors.join(' '), errors: validation.errors }, { status: 400 })

  const [existing] = db.select().from(journalEntries).where(eq(journalEntries.date, date)).all()

  if (existing) {
    const [row] = db
      .update(journalEntries)
      .set({
        mood: mood ?? existing.mood,
        smallWins: smallWins ?? existing.smallWins,
        gratitude: gratitude ?? existing.gratitude,
        worryDump: worryDump ?? existing.worryDump,
      })
      .where(eq(journalEntries.id, existing.id))
      .returning()
      .all()
    return NextResponse.json({ entry: row, created: false, xpAwarded: 0 })
  }

  const [row] = db.insert(journalEntries).values({ date, mood, smallWins, gratitude, worryDump }).returning().all()
  db.insert(xpEvents).values({ source: 'journal', amount: XP_REWARDS.journal, meta: { date } }).run()
  return NextResponse.json({ entry: row, created: true, xpAwarded: XP_REWARDS.journal }, { status: 201 })
})
