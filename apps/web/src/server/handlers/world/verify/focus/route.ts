/**
 * /api/world/verify/focus — Anti-cheat validation and study coin minting for completed focus blocks.
 */
import { z } from 'zod'
import { verifyFocusSessionForCoins } from '@learning-hub/core/world'
import { getCoinBalance, recordCoinTransaction } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const verifyFocusSchema = z.object({
  plannedMinutes: z.number().int().positive(),
  actualSeconds: z.number().int().positive(),
  heartbeatsCount: z.number().int().nonnegative(),
  completedWithoutExit: z.boolean(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, verifyFocusSchema)

  const check = verifyFocusSessionForCoins({
    plannedMinutes: body.plannedMinutes,
    actualSeconds: body.actualSeconds,
    heartbeatsCount: body.heartbeatsCount,
    completedWithoutExit: body.completedWithoutExit,
  })

  let newBalance = getCoinBalance('default')

  if (check.valid && check.coinsAwarded > 0) {
    const tx = recordCoinTransaction({
      userId: 'default',
      amount: check.coinsAwarded,
      reason: 'verified_focus_block',
      referenceId: `focus_${Date.now()}`,
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
