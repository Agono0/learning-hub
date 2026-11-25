/**
 * /api/arena/card/[id] — one card's arena history.
 *
 * GET → the card's attempt timeline across settled runs (grade, confidence,
 * time per attempt), speed trend and streaks, built by the same core
 * analysis as the nemesis ranking. A card never seen in the arena is a 404.
 * The front is resolved best-effort (deleted cards render a placeholder).
 * Practice insight over self-reported grades; read-only.
 */
import { eq } from 'drizzle-orm'
import { cards, db, listSettledGradeLogs } from '@learning-hub/db'
import { buildCardTimeline } from '@learning-hub/core'
import { ApiError, withRoute } from '@/lib/api'

function frontOf(content: unknown): string {
  let text = ''
  if (typeof content === 'string') text = content
  else if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>
    const inner = Object.values(c).find((v) => v && typeof v === 'object') as
      Record<string, unknown> | undefined
    const src = inner ?? c
    text = String(src.front ?? src.text ?? src.prompt ?? src.question ?? '')
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 199)}…` : text
}

export const GET = withRoute(async (req: Request) => {
  const id = Number(new URL(req.url).pathname.split('/').pop())
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'invalid card id')

  const timeline = buildCardTimeline(listSettledGradeLogs({ limit: 200 }), id)
  if (timeline.attempts.length === 0) throw new ApiError(404, 'card has no arena history')

  const row = (await db.select().from(cards).where(eq(cards.id, id)).limit(1))[0]
  return Response.json({
    ...timeline,
    front: row ? frontOf(row.content) : '(card removed)',
    format: row?.type ?? null,
  })
})
