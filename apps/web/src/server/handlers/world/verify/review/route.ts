/**
 * /api/world/verify/review — Anti-cheat validation and study coin minting for card reviews.
 */
import { z } from 'zod'
import { verifyReviewForCoins } from '@learning-hub/core/world'
import { getCoinBalance, getRecentCoinEarnings5m, recordCoinTransaction } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const verifyReviewSchema = z.object({
  cardId: z.number().int().positive(),
  elapsedMs: z.number().int().nonnegative(),
  rating: z.number().int().min(1).max(4),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, verifyReviewSchema)

  const recent5m = getRecentCoinEarnings5m('default')
  const check = verifyReviewForCoins({
    cardId: body.cardId,
    elapsedMs: body.elapsedMs,
    rating: body.rating,
    recentReviewCoins5m: recent5m,
  })

  let newBalance = getCoinBalance('default')

  if (check.valid && check.coinsAwarded > 0) {
    const tx = recordCoinTransaction({
      userId: 'default',
      amount: check.coinsAwarded,
      reason: 'verified_review',
      referenceId: String(body.cardId),
    })
    newBalance = tx.balanceAfter
  }

  return Response.json({
    ok: true,
    valid: check.valid,
    coinsAwarded: check.coinsAwarded,
    balance: newBalance,
    reason: check.reason,
  })
})
