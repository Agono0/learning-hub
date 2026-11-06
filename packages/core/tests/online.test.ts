import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_ALPHABET,
  canonicalSignaturePayload,
  communityItemSchema,
  filterContentSafety,
  makeRoomCode,
  partyRaidStateSchema,
  signedEnvelopeSchema,
  studyRoomStateSchema,
} from '../src/online/index'

describe('Online engagement core', () => {
  it('generates valid 6-char room codes using the clean alphabet', () => {
    const code = makeRoomCode()
    expect(code).toHaveLength(6)
    for (const char of code) {
      expect(ROOM_CODE_ALPHABET).toContain(char)
    }

    // Excluded characters check: no 0, O, 1, I, L
    expect(code).not.toMatch(/[0O1IL]/)
  })

  it('validates study room state and participant schemas', () => {
    const validRoom = {
      code: 'ABC89K',
      title: 'Deep Focus Morning Session',
      topic: 'Algorithms & Data Structures',
      timerMode: 'pomodoro',
      pomodoroWorkMinutes: 25,
      pomodoroBreakMinutes: 5,
      isBreak: false,
      participants: [
        {
          id: 'p1',
          alias: 'Ada Lovelace',
          status: 'studying',
          streak: 12,
          cardsReviewed: 45,
          joinedAt: new Date().toISOString(),
        },
      ],
    }
    const parsed = studyRoomStateSchema.parse(validRoom)
    expect(parsed.code).toBe('ABC89K')
    expect(parsed.participants).toHaveLength(1)
    expect(parsed.participants[0]!.alias).toBe('Ada Lovelace')
  })

  it('validates party raid state and member schemas', () => {
    const validRaid = {
      id: 'raid-123',
      bossKey: 'chronos',
      bossName: 'Chronos',
      bossHp: 180,
      bossMaxHp: 200,
      partyHp: 80,
      partyMaxHp: 100,
      status: 'fighting',
      members: [{ id: 'm1', alias: 'Euler', damageDealt: 20, isAlive: true }],
      combatLog: ['Euler dealt 20 damage to Chronos!'],
    }
    const parsed = partyRaidStateSchema.parse(validRaid)
    expect(parsed.status).toBe('fighting')
    expect(parsed.members[0]!.damageDealt).toBe(20)
  })

  it('validates community library items', () => {
    const item = {
      id: 'item-1',
      type: 'deck',
      title: 'Top 1000 Spanish Vocabulary',
      description: 'Frequency list with native audio cues and IPA',
      author: 'Maria',
      downloads: 42,
      rating: 4.8,
      tags: ['spanish', 'vocab'],
      shareString: 'LH1_test_base64_data',
      publishedAt: new Date().toISOString(),
    }
    const parsed = communityItemSchema.parse(item)
    expect(parsed.downloads).toBe(42)
  })

  it('creates canonical signature payloads and validates envelopes', () => {
    const payload = { action: 'review_sync', count: 10 }
    const ts = 1710000000000
    const nonce = 'abcd1234efgh'
    const canonical = canonicalSignaturePayload(payload, ts, nonce)
    expect(canonical).toBe('1710000000000:abcd1234efgh:{"action":"review_sync","count":10}')

    const envelope = {
      payload: canonical,
      timestamp: ts,
      nonce,
      pubKey: 'pubkey_hex_or_base64_sample',
      signature: 'signature_hex_or_base64_sample',
    }
    const parsed = signedEnvelopeSchema.parse(envelope)
    expect(parsed.nonce).toBe('abcd1234efgh')
  })

  it('filters basic spam and malicious keywords safely', () => {
    const check1 = filterContentSafety('Great room for studying Rust!')
    expect(check1.isClean).toBe(true)
    expect(check1.clean).toBe('Great room for studying Rust!')

    const check2 = filterContentSafety('Join this phishing link for free stuff')
    expect(check2.isClean).toBe(false)
    expect(check2.clean).toContain('***')
  })
})
