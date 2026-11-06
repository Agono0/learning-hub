import { describe, expect, it } from 'vitest'
import { BOSS_ROSTER, calculateCombatTurn, type ReviewCombatInput } from '../src/boss/index.js'
import {
  createShareEnvelope,
  decodeShareString,
  encodeShareString,
  friendStatsSchema,
} from '../src/share/index.js'

describe('serverless social domain logic', () => {
  describe('boss combat engine', () => {
    const boss = BOSS_ROSTER.chronos!

    it('calculates damage and crits from review grades and latency', () => {
      const reviews: ReviewCombatInput[] = [
        { id: 1, grade: 4, timeMs: 2500 }, // 35 + 5 speed = 40
        { id: 2, grade: 3, timeMs: 5000 }, // 20
        { id: 3, grade: 2, timeMs: 8000 }, // 10
        { id: 4, grade: 1, timeMs: 12000 }, // 0 dealt, boss attacks
      ]

      const result = calculateCombatTurn(reviews, boss)
      expect(result.playerDamageDealt).toBe(40 + 20 + 10)
      expect(result.bossDamageDealt).toBe(boss.attackPower)
      expect(result.critCount).toBe(1)
      expect(result.hitsCount).toBe(3)
      expect(result.missesCount).toBe(1)
    })
  })

  describe('share envelopes & codecs', () => {
    it('creates, encodes and round-trips a deck share envelope', () => {
      const envelope = createShareEnvelope({
        type: 'deck',
        title: 'Quantum Physics Fundamentals',
        itemCount: 15,
        author: 'Physicist',
        data: {
          cards: [{ front: 'Wave-particle duality', back: 'De Broglie wavelength' }],
        },
      })

      expect(envelope.schema).toBe('lh-share/v1')
      expect(envelope.checksum).toBeTruthy()

      const encoded = encodeShareString(envelope)
      expect(encoded.startsWith('LH1_')).toBe(true)

      const decoded = decodeShareString(encoded)
      expect(decoded.metadata.title).toBe('Quantum Physics Fundamentals')
      expect(decoded.type).toBe('deck')
      expect(decoded.data).toEqual(envelope.data)
    })

    it('validates friend stats payload', () => {
      const stats = {
        v: 1,
        schema: 'lh-stats/v1',
        username: 'AdaLovelace',
        streak: 42,
        weeklyXp: 850,
        totalReviews: 1200,
        level: 14,
        updatedAt: new Date().toISOString(),
      }

      const parsed = friendStatsSchema.parse(stats)
      expect(parsed.username).toBe('AdaLovelace')
      expect(parsed.streak).toBe(42)
    })
  })
})
