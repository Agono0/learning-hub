import { NextResponse } from 'next/server'
import { eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { journalEntries, withTransaction } from '@learning-hub/db'
import { dayKey } from '@learning-hub/core'
import { getAISettingsFromDb, getActiveAIClientFromDb, type AIClient } from '@/lib/ai'
import { aiErrorResponse, readJson, tzOffsetFromQuery, tzOffsetSchema, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

/**
 * GET /api/journal/ai?date=YYYY-MM-DD&tzOffset=N — returns the stored AI insight
 * for a day (never calls the provider; instant, offline-friendly).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tz = tzOffsetFromQuery(req)
  const date = url.searchParams.get('date') ?? dayKey(new Date(), tz)
  const [entry] = db.select().from(journalEntries).where(eq(journalEntries.date, date)).all()
  return NextResponse.json({ date, aiInsight: entry?.aiInsight ?? null, configuredHint: null })
}

const postInsightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  tzOffset: tzOffsetSchema,
})

/**
 * Deterministic weekly reflection built from the stored entries — the manual
 * (provider 'none') replacement for the AI insight. Reflection prompts, not
 * generic advice: the user fills them in, which IS the intervention.
 */
function manualReflection(date: string, week: { date: string; mood: number | null; smallWins: string | null; gratitude: string | null; worryDump: string | null }[]): string {
  const moods = week.map((e) => e.mood).filter((m): m is number => m != null)
  const moodAvg = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null
  const wins = week.map((e) => e.smallWins?.trim()).filter((w): w is string => Boolean(w))
  const lines = [
    `Reflection prompts for ${date} (manual mode — no AI involved, the prompts are stored as this entry's insight):`,
    `- Entries this week: ${week.length}${moodAvg != null ? `, average mood ${moodAvg}/5` : ''}.`,
    wins.length ? `- One concrete small win to name: "${wins[0]}" — what made it possible?` : '- Name one concrete small win from the week — even a tiny one. What made it possible?',
    '- Which pattern do you see across the week (time of day, energy, what you avoided)?',
    '- Suggest ONE tiny next action for tomorrow, small enough that it survives a bad day.',
  ]
  return lines.join('\n')
}

/**
 * POST /api/journal/ai { date?, tzOffset? } — generate a gentle, evidence-based
 * reflection from the last week of journal entries and UPSERT it onto the
 * journal_entries row for `date` (a previously unjournaled date gets a row, so
 * a paid-for insight is never generated and discarded).
 * NEVER dead-ends: provider 'none' (the default) stores deterministic
 * reflection prompts as the entry's insight instead ({ ok: true, mode:
 * 'manual' }); configured providers get the AI-coach text ({ mode: 'ai' }).
 */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postInsightSchema)
  const date = body.date ?? dayKey(new Date(), body.tzOffset)

  const settings = await getAISettingsFromDb()
  let client: AIClient | null = null
  if (settings.provider !== 'none') {
    client = await getActiveAIClientFromDb()
  }

  const since = dayKey(new Date(Date.now() - 7 * 86_400_000), body.tzOffset)
  const week = db
    .select()
    .from(journalEntries)
    .where(gte(journalEntries.date, since))
    .all()
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  if (week.length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to reflect on yet — write a few entries first.' })
  }

  if (!client) {
    // manual mode: reflection prompts replace the AI insight (never dead-ends)
    const insight = manualReflection(date, week)
    withTransaction((tx) => {
      const entry = tx.select().from(journalEntries).where(eq(journalEntries.date, date)).get()
      if (entry) {
        tx.update(journalEntries).set({ aiInsight: insight }).where(eq(journalEntries.id, entry.id)).run()
      } else {
        tx.insert(journalEntries).values({ date, aiInsight: insight }).run()
      }
    })
    return NextResponse.json({ ok: true, mode: 'manual', insight, date })
  }

  const summary = week
    .map((e) => `- ${e.date}: mood=${e.mood ?? 'n/a'}/5, small wins: ${e.smallWins ?? '—'}, gratitude: ${e.gratitude ?? '—'}, worries: ${e.worryDump ?? '—'}`)
    .join('\n')

  let insight: string
  try {
    insight = await client.generateText({
      system:
        'You are a warm, evidence-based learning coach. Reflect the learner\'s week back to them in 3-5 sentences: name one concrete small win, one pattern, and suggest ONE tiny next action. No platitudes, no diagnoses, no emoji. Base every claim only on what the entries say.',
      prompt: `Journal entries from the last 7 days (today is ${date}):\n${summary}`,
    })
  } catch (e) {
    // provider errors leak base URLs / model ids / upstream statuses — keep them server-side
    return aiErrorResponse(e)
  }

  // upsert: persist the insight even for a day without an entry yet
  withTransaction((tx) => {
    const entry = tx.select().from(journalEntries).where(eq(journalEntries.date, date)).get()
    if (entry) {
      tx.update(journalEntries).set({ aiInsight: insight }).where(eq(journalEntries.id, entry.id)).run()
    } else {
      tx.insert(journalEntries).values({ date, aiInsight: insight }).run()
    }
  })

  return NextResponse.json({ ok: true, mode: 'ai', insight, date })
})
