import { describe, it, expect } from 'vitest'
import {
  createLeagueTransfer,
  parseLeagueTransfer,
  LEAGUE_TRANSFER_SCHEMA,
} from '../src/leagues/index.js'

const payload = {
  league: {
    schema: 'lh-leagues/v1' as const,
    id: 'daily-sprint',
    title: 'Daily Sprint',
    seasonStart: '2026-11-01T00:00:00.000Z',
    roundLengthDays: 7,
    seasonLengthRounds: 10,
    currentRound: 3,
    season: 1,
    players: [],
    promotionSlots: 2,
    relegationSlots: 2,
    scoring: { review: 1, focusMinute: 1, duelWin: 10, duelDraw: 5 },
  },
  players: [
    {
      handle: 'mia',
      tier: 'gold',
      points: 40,
      seasonPoints: 20,
      roundsWon: 2,
      duelsWon: 3,
      duelsLost: 1,
      elo: 1050,
      joinedAt: '2026-11-02T00:00:00.000Z',
    },
  ],
  rounds: [
    {
      round: 1,
      closedAt: '2026-11-08T00:00:00.000Z',
      promotionsJson: [],
      relegationsJson: [],
      winnersJson: [{ tier: 'gold', handle: 'mia' }],
    },
  ],
  duels: [
    {
      duel: {
        id: 'mia-vs-leo-abc123',
        playerA: 'mia',
        playerB: 'leo',
        prompts: [{ id: 'p1', question: '2+2?', answers: ['4'] }],
        answersA: [{ promptId: 'p1', answer: '4', elapsedMs: 900 }],
        answersB: [{ promptId: 'p1', answer: '5', elapsedMs: 1200 }],
        createdAt: '2026-11-04T00:00:00.000Z',
      },
      status: 'complete' as const,
      winner: 'mia',
      completedAt: '2026-11-05T00:00:00.000Z',
      createdAt: '2026-11-04T00:00:00.000Z',
    },
  ],
  tournaments: [],
  seasons: [],
  eloEvents: [
    {
      duelSlug: 'mia-vs-leo-abc123',
      handle: 'mia',
      opponent: 'leo',
      result: 'win' as const,
      eloBefore: 1000,
      eloAfter: 1050,
      createdAt: '2026-11-05T00:00:00.000Z',
    },
  ],
}

describe('league transfer envelopes', () => {
  it('round-trips a payload through create + parse', () => {
    const transfer = createLeagueTransfer(payload)
    expect(transfer.schema).toBe(LEAGUE_TRANSFER_SCHEMA)
    expect(transfer.payload).toEqual(payload)
    expect(parseLeagueTransfer(transfer).payload).toEqual(payload)
  })

  it('accepts a JSON string', () => {
    const transfer = createLeagueTransfer(payload)
    const parsed = parseLeagueTransfer(JSON.stringify(transfer))
    expect(parsed.payload.league.id).toBe('daily-sprint')
  })

  it('rejects a tampered payload (checksum mismatch)', () => {
    const transfer = createLeagueTransfer(payload)
    transfer.payload.league.title = 'Hacked'
    expect(() => parseLeagueTransfer(transfer)).toThrow(/checksum/i)
  })

  it('rejects the wrong schema tag and malformed json', () => {
    const transfer = createLeagueTransfer(payload)
    expect(() => parseLeagueTransfer({ ...transfer, schema: 'nope' })).toThrow()
    expect(() => parseLeagueTransfer('{not json')).toThrow()
  })
})
