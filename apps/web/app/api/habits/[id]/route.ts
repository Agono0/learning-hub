import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { habits } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

const patchHabitSchema = z.object({
  name: z.string().optional(),
  cue: z.string().optional(),
  cueType: z.string().optional(),
  craving: z.string().optional(),
  response: z.string().optional(),
  reward: z.string().optional(),
  anchor: z.string().optional(),
  order: z.number().int().optional(),
  archived: z.boolean().optional(),
})

/** PATCH /api/habits/[id] — edit fields or archive. */
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const { id } = await params
  const habitId = Number.parseInt(id, 10)
  if (!Number.isInteger(habitId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const [existing] = db.select().from(habits).where(eq(habits.id, habitId)).all()
  if (!existing) return NextResponse.json({ error: 'Habit not found' }, { status: 404 })

  const body = await readJson(req, patchHabitSchema)
  // present-and-empty clears the field (→ null); absent keeps the stored value
  const pick = (v: string | undefined, current: string | null): string | null => {
    if (v === undefined) return current
    const t = v.trim()
    return t === '' ? null : t
  }

  const [row] = db
    .update(habits)
    .set({
      name: body.name?.trim() || existing.name,
      cue: pick(body.cue, existing.cue),
      cueType: pick(body.cueType, existing.cueType),
      craving: pick(body.craving, existing.craving),
      response: pick(body.response, existing.response),
      reward: pick(body.reward, existing.reward),
      anchor: pick(body.anchor, existing.anchor),
      order: body.order ?? existing.order,
      archived: body.archived ?? existing.archived,
    })
    .where(eq(habits.id, habitId))
    .returning()
    .all()
  return NextResponse.json({ habit: row })
})

/** DELETE /api/habits/[id] — deletes when no logs reference it, otherwise archives. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const habitId = Number.parseInt(id, 10)
  if (!Number.isInteger(habitId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    db.delete(habits).where(eq(habits.id, habitId)).run()
    return NextResponse.json({ ok: true, archived: false })
  } catch {
    // habit_logs references this habit — archive instead of breaking history
    db.update(habits).set({ archived: true }).where(eq(habits.id, habitId)).run()
    return NextResponse.json({ ok: true, archived: true })
  }
}
