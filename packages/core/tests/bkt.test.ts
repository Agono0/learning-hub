import { describe, it, expect } from 'vitest'
import { bktUpdate, isMastered, unlockProbability, DEFAULT_BKT } from '../src/bkt'
import { MASTERY_THRESHOLD } from '../src/types'

describe('Bayesian Knowledge Tracing (BKT 4-parameter HMM)', () => {
  describe('DEFAULT_BKT parameters sanity', () => {
    it('provides valid probabilistic defaults in [0, 1]', () => {
      expect(DEFAULT_BKT.pInit).toBeGreaterThan(0)
      expect(DEFAULT_BKT.pInit).toBeLessThan(1)
      expect(DEFAULT_BKT.pTransit).toBeGreaterThan(0)
      expect(DEFAULT_BKT.pTransit).toBeLessThan(1)
      expect(DEFAULT_BKT.pGuess).toBeGreaterThan(0)
      expect(DEFAULT_BKT.pGuess).toBeLessThan(0.5) // Guessing should not exceed coin flip
      expect(DEFAULT_BKT.pSlip).toBeGreaterThan(0)
      expect(DEFAULT_BKT.pSlip).toBeLessThan(0.3) // Slip should be a minority anomaly
    })
  })

  describe('bktUpdate posterior transitions', () => {
    it('increases pKnown on correct evidence', () => {
      const prior = 0.3
      const posterior = bktUpdate(prior, true, DEFAULT_BKT)
      expect(posterior).toBeGreaterThan(prior)
    })

    it('decreases pKnown on incorrect evidence', () => {
      const prior = 0.7
      const posterior = bktUpdate(prior, false, DEFAULT_BKT)
      expect(posterior).toBeLessThan(prior)
    })

    it('converges toward 1.0 under consecutive correct responses', () => {
      let p = DEFAULT_BKT.pInit
      for (let i = 0; i < 15; i++) {
        p = bktUpdate(p, true, DEFAULT_BKT)
      }
      expect(p).toBeGreaterThan(0.98)
    })

    it('remains bounded above zero even under consecutive failures due to pTransit', () => {
      let p = 0.8
      for (let i = 0; i < 20; i++) {
        p = bktUpdate(p, false, DEFAULT_BKT)
      }
      expect(p).toBeGreaterThanOrEqual(DEFAULT_BKT.pTransit * 0.1)
      expect(p).toBeLessThan(0.2)
    })

    it('respects custom parameters when provided', () => {
      const strictBkt = { pInit: 0.05, pTransit: 0.05, pGuess: 0.1, pSlip: 0.05 }
      const p1 = bktUpdate(0.2, true, strictBkt)
      expect(p1).toBeGreaterThan(0.2)
    })
  })

  describe('isMastered threshold gate', () => {
    it('requires both pKnown >= MASTERY_THRESHOLD and enough attempts', () => {
      expect(MASTERY_THRESHOLD).toBe(0.95)

      // High pKnown but not enough attempts
      expect(isMastered(0.96, 3, 5)).toBe(false)

      // Enough attempts but low pKnown
      expect(isMastered(0.85, 10, 5)).toBe(false)

      // Both satisfied
      expect(isMastered(0.95, 5, 5)).toBe(true)
      expect(isMastered(0.99, 8, 5)).toBe(true)
    })
  })

  describe('unlockProbability DAG gating', () => {
    it('maps pKnown <= 0.5 to 0 probability', () => {
      expect(unlockProbability(0.2)).toBe(0)
      expect(unlockProbability(0.5)).toBe(0)
    })

    it('maps pKnown >= 0.95 to 1.0 full unlock', () => {
      expect(unlockProbability(0.95)).toBe(1)
      expect(unlockProbability(0.99)).toBe(1)
    })

    it('scales linearly between 0.5 and 0.95', () => {
      const mid = unlockProbability(0.725) // exactly halfway between 0.5 and 0.95
      expect(mid).toBeCloseTo(0.5)
    })
  })
})
