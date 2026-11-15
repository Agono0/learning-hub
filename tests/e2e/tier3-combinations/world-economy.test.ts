import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import { db, getCoinBalance, recordCoinTransaction, studyCoinLedger } from '@learning-hub/db'
import { eq } from 'drizzle-orm'
import * as worldStateRoute from '../../../apps/web/app/api/world/state/route'
import * as worldMarketRoute from '../../../apps/web/app/api/world/market/route'
import * as worldVerifyReviewRoute from '../../../apps/web/app/api/world/verify/review/route'
import * as worldAvatarRoute from '../../../apps/web/app/api/world/avatar/route'

describe('Tier 3 E2E: 3D World Economy, Market Purchases & Ledger Invariants', () => {
  it('mints coins via verified review and updates balance', async () => {
    const initialBalance = getCoinBalance('default')

    // Simulate verified review
    const verifyRes = await callRoute<{
      ok: boolean
      valid: boolean
      coinsAwarded: number
      balance: number
    }>(worldVerifyReviewRoute.POST, {
      method: 'POST',
      body: {
        cardId: 101,
        elapsedMs: 2500, // Valid human latency > 800ms
        rating: 3,
      },
    })

    expect(verifyRes.status).toBe(200)
    expect(verifyRes.data.ok).toBe(true)
    expect(verifyRes.data.valid).toBe(true)
    expect(verifyRes.data.coinsAwarded).toBeGreaterThan(0)
    expect(verifyRes.data.balance).toBe(initialBalance + verifyRes.data.coinsAwarded)
  })

  it('completes market purchase and records debit in append-only coin ledger', async () => {
    // 1. Give learner sufficient coins for market testing
    recordCoinTransaction({
      userId: 'default',
      amount: 500,
      reason: 'study_quest_reward',
    })
    const balanceBefore = getCoinBalance('default')

    // 2. Browse marketplace
    const catalogRes = await callRoute<{
      ok: boolean
      catalog: Array<{ id: string; name: string; cost: number }>
      balance: number
    }>(worldMarketRoute.GET)
    expect(catalogRes.status).toBe(200)
    expect(catalogRes.data.catalog.length).toBeGreaterThan(5)

    // 3. Purchase straw hat item
    const buyRes = await callRoute<{
      ok: boolean
      avatar: { unlockedItems: string[] }
      transaction: { amount: number }
      balance: number
    }>(worldMarketRoute.POST, {
      method: 'POST',
      body: { itemId: 'head_straw_hat' },
    })

    expect(buyRes.status).toBe(200)
    expect(buyRes.data.ok).toBe(true)
    expect(buyRes.data.avatar.unlockedItems).toContain('head_straw_hat')
    expect(buyRes.data.transaction.amount).toBe(-100)
    expect(buyRes.data.balance).toBe(balanceBefore - 100)

    // 4. Verify user avatar reflects unlocked item
    const avatarRes = await callRoute<{
      ok: boolean
      avatar: { unlockedItems: string[] }
    }>(worldAvatarRoute.GET)
    expect(avatarRes.status).toBe(200)
    expect(avatarRes.data.avatar.unlockedItems).toContain('head_straw_hat')

    // 5. Verify Rule 8 append-only ledger invariant on study_coin_ledger
    const txRows = await db
      .select()
      .from(studyCoinLedger)
      .where(eq(studyCoinLedger.userId, 'default'))
    expect(txRows.length).toBeGreaterThanOrEqual(2)
    expect(txRows.some((t) => t.reason === 'study_quest_reward')).toBe(true)
    expect(txRows.some((t) => t.amount === -100)).toBe(true)

    // 6. Verify world state includes updated balance and avatar
    const stateRes = await callRoute<{
      ok: boolean
      balance: number
      avatar: { unlockedItems: string[] }
    }>(worldStateRoute.GET)
    expect(stateRes.status).toBe(200)
    expect(stateRes.data.balance).toBe(buyRes.data.balance)
    expect(stateRes.data.avatar.unlockedItems).toContain('head_straw_hat')
  })
})
