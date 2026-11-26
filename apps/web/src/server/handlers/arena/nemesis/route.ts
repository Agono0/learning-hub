/**
 * /api/arena/nemesis — the cards the arena keeps catching you on.
 *
 * GET → per-card performance derived from the accepted grade logs of settled
 * runs (see core analyzeCardPerformance): top nemeses, redeemed cards (hurt
 * before, live streak now) and a mastery-tier breakdown. Card fronts are
 * resolved best-effort; deleted cards render as a placeholder.
 *
 * Practice insight only. Grades are client-controlled and honor-system, so
 * this never feeds the SRS scheduler and never moves the economy.
 */
import { inArray } from 'drizzle-orm'
import { cards, db, listSettledGradeLogs } from '@learning-hub/db'
import {
  analyzeCardPerformance,
  rankNemeses,
  redeemedCards,
  tierBreakdown,
  type CardArenaStats,
} from '@learning-hub/core'
import { withRoute } from '@/lib/api'

const FRONT_MAX = 140

function frontOf(content: unknown): string {
  let text = ''
  if (typeof content === 'string') text = content
  else if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>
    // Card content is keyed by format: { basic: { front } }, { cloze: { text } }, …
    const inner = Object.values(c).find((v) => v && typeof v === 'object') as
      Record<string, unknown> | undefined
    const src = inner ?? c
    text = String(src.front ?? src.text ?? src.prompt ?? src.question ?? '')
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > FRONT_MAX ? `${text.slice(0, FRONT_MAX - 1)}…` : text
}

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 5) || 5, 1), 20)

  const logs = listSettledGradeLogs({ limit: 100 })
  const all = analyzeCardPerformance(logs)
  const nemeses = rankNemeses(all, limit)
  const redeemed = redeemedCards(all, limit)

  const ids = [...new Set([...nemeses, ...redeemed].map((s) => s.cardId))]
  const rows = ids.length
    ? await db
        .select({ id: cards.id, content: cards.content, type: cards.type })
        .from(cards)
        .where(inArray(cards.id, ids))
    : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  const decorate = (s: CardArenaStats) => ({
    ...s,
    front: byId.has(s.cardId) ? frontOf(byId.get(s.cardId)!.content) : '(card removed)',
    format: byId.get(s.cardId)?.type ?? null,
  })

  return Response.json({
    sampledRuns: logs.length,
    cardsSeen: all.length,
    tiers: tierBreakdown(all),
    nemeses: nemeses.map(decorate),
    redeemed: redeemed.map(decorate),
  })
})
