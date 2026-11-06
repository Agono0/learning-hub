import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKET_CATALOG,
  GENESIS_LEDGER_HASH,
  calculateHourglassProgress,
  calculateTreeGrowth,
  computeLedgerSignature,
  marketItemSchema,
  sha256Hex,
  verifyFocusSessionForCoins,
  verifyLedgerChain,
  verifyReviewForCoins,
} from '../src/world/index'

describe('Core World & Economy Engine', () => {
  describe('Study Review Verification (Anti-Cheat)', () => {
    it('rejects reviews that are completed unnaturally fast (< 1.5s)', () => {
      const result = verifyReviewForCoins({
        cardId: 101,
        elapsedMs: 800,
        rating: 3,
      })
      expect(result.valid).toBe(false)
      expect(result.coinsAwarded).toBe(0)
      expect(result.reason).toContain('too fast')
    })

    it('awards 2 coins for verified Good reviews and 3 for Easy reviews', () => {
      const good = verifyReviewForCoins({
        cardId: 101,
        elapsedMs: 2500,
        rating: 3,
      })
      expect(good.valid).toBe(true)
      expect(good.coinsAwarded).toBe(2)

      const easy = verifyReviewForCoins({
        cardId: 102,
        elapsedMs: 1800,
        rating: 4,
      })
      expect(easy.valid).toBe(true)
      expect(easy.coinsAwarded).toBe(3)
    })

    it('enforces 5-minute rolling rate limits against automated farming', () => {
      const capped = verifyReviewForCoins({
        cardId: 103,
        elapsedMs: 2000,
        rating: 3,
        recentReviewCoins5m: 35,
      })
      expect(capped.valid).toBe(false)
      expect(capped.coinsAwarded).toBe(0)
      expect(capped.reason).toContain('Rate limit')
    })
  })

  describe('Focus Session Verification', () => {
    it('rejects sessions that were prematurely aborted or exited', () => {
      const aborted = verifyFocusSessionForCoins({
        plannedMinutes: 25,
        actualSeconds: 600,
        heartbeatsCount: 8,
        completedWithoutExit: false,
      })
      expect(aborted.valid).toBe(false)
      expect(aborted.coinsAwarded).toBe(0)
    })

    it('awards 30 coins for verified 25-minute Pomodoro completion with heartbeats', () => {
      const pomodoro = verifyFocusSessionForCoins({
        plannedMinutes: 25,
        actualSeconds: 1500,
        heartbeatsCount: 20,
        completedWithoutExit: true,
      })
      expect(pomodoro.valid).toBe(true)
      expect(pomodoro.coinsAwarded).toBe(30) // 25 + 5 bonus
    })

    it('rejects sessions lacking required client heartbeats (anti-background spoofing)', () => {
      const noHeartbeats = verifyFocusSessionForCoins({
        plannedMinutes: 25,
        actualSeconds: 1500,
        heartbeatsCount: 2, // expected >= 20
        completedWithoutExit: true,
      })
      expect(noHeartbeats.valid).toBe(false)
      expect(noHeartbeats.coinsAwarded).toBe(0)
      expect(noHeartbeats.reason).toContain('heartbeats')
    })
  })

  describe('Cryptographic Ledger Hash Chaining', () => {
    it('generates deterministic SHA-256 signatures', () => {
      const hash1 = sha256Hex('learning-hub-test')
      const hash2 = sha256Hex('learning-hub-test')
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })

    it('validates an untampered coin ledger chain', () => {
      const tx1 = {
        userId: 'u1',
        amount: 50,
        balanceAfter: 50,
        reason: 'welcome_bonus',
        referenceId: null,
        createdAt: '2026-11-06T10:00:00Z',
      }
      const sig1 = computeLedgerSignature(GENESIS_LEDGER_HASH, tx1)

      const tx2 = {
        userId: 'u1',
        amount: 25,
        balanceAfter: 75,
        reason: 'verified_focus_block',
        referenceId: 'session_1',
        createdAt: '2026-11-06T10:30:00Z',
      }
      const sig2 = computeLedgerSignature(sig1, tx2)

      const chain = [
        { ...tx1, signature: sig1 },
        { ...tx2, signature: sig2 },
      ]

      const check = verifyLedgerChain(chain)
      expect(check.valid).toBe(true)
    })

    it('detects tampering if amount or reason was altered in the ledger', () => {
      const tx1 = {
        userId: 'u1',
        amount: 50,
        balanceAfter: 50,
        reason: 'welcome_bonus',
        referenceId: null,
        createdAt: '2026-11-06T10:00:00Z',
      }
      const sig1 = computeLedgerSignature(GENESIS_LEDGER_HASH, tx1)

      const tx2 = {
        userId: 'u1',
        amount: 25,
        balanceAfter: 75,
        reason: 'verified_focus_block',
        referenceId: 'session_1',
        createdAt: '2026-11-06T10:30:00Z',
      }
      const sig2 = computeLedgerSignature(sig1, tx2)

      // Tampered chain: changed amount from 25 to 5000
      const tampered = [
        { ...tx1, signature: sig1 },
        { ...tx2, amount: 5000, signature: sig2 },
      ]

      const check = verifyLedgerChain(tampered)
      expect(check.valid).toBe(false)
      expect(check.brokenAtId).toBe(1)
    })
  })

  describe('Marketplace Catalog & Procedural Mechanics', () => {
    it('contains all valid market items according to marketItemSchema', () => {
      expect(DEFAULT_MARKET_CATALOG.length).toBeGreaterThan(15)
      for (const item of DEFAULT_MARKET_CATALOG) {
        expect(() => marketItemSchema.parse(item)).not.toThrow()
      }
    })

    it('interpolates tree growth and hourglass parameters smoothly across 0..1', () => {
      const start = calculateTreeGrowth(0.0)
      const mid = calculateTreeGrowth(0.5)
      const end = calculateTreeGrowth(1.0)

      expect(start.scale).toBeLessThan(mid.scale)
      expect(mid.scale).toBeLessThan(end.scale)

      const hgStart = calculateHourglassProgress(0.0)
      const hgEnd = calculateHourglassProgress(1.0)
      expect(hgStart.topSandRatio).toBe(1)
      expect(hgStart.bottomSandRatio).toBe(0)
      expect(hgEnd.topSandRatio).toBe(0)
      expect(hgEnd.bottomSandRatio).toBe(1)
    })
  })
})
