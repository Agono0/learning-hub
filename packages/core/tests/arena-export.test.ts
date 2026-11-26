import { describe, expect, it } from 'vitest'
import {
  ARENA_CSV_COLUMNS,
  ARENA_EXPORT_VERSION,
  arenaRunsToCsv,
  buildArenaExport,
  csvCell,
  type ArenaExportRun,
} from '../src/arena'

const run = (over: Partial<ArenaExportRun> = {}): ArenaExportRun => ({
  id: 1,
  createdAt: '2026-11-25T10:00:00.000Z',
  result: 'victory',
  archetype: 'warden',
  boss: false,
  rounds: 10,
  correct: 8,
  accuracy: 0.8,
  bestCombo: 6,
  crits: 2,
  score: 900,
  coins: 12,
  xp: 30,
  durationMs: 45_400,
  deckIds: [3, 4],
  ...over,
})

describe('csvCell', () => {
  it('passes plain values through', () => {
    expect(csvCell('warden')).toBe('warden')
    expect(csvCell(12)).toBe('12')
    expect(csvCell(true)).toBe('true')
  })
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
  it('neutralizes formula starters in text', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+cmd')).toBe("'+cmd")
    expect(csvCell('@x')).toBe("'@x")
    expect(csvCell('-x')).toBe("'-x")
  })
  it('leaves real negative numbers alone', () => {
    expect(csvCell('-5')).toBe('-5')
    expect(csvCell(-5)).toBe('-5')
  })
})

describe('arenaRunsToCsv', () => {
  it('writes a header and CRLF-terminated rows', () => {
    const csv = arenaRunsToCsv([run()])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(ARENA_CSV_COLUMNS.join(','))
    expect(lines[1]).toBe(
      '1,2026-11-25T10:00:00.000Z,victory,warden,no,10,8,80.0,6,2,900,12,30,45,3 4',
    )
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it('header only for no runs', () => {
    expect(arenaRunsToCsv([])).toBe(`${ARENA_CSV_COLUMNS.join(',')}\r\n`)
  })
  it('marks boss runs and rounds the accuracy to one decimal', () => {
    const line = arenaRunsToCsv([run({ boss: true, accuracy: 2 / 3 })]).split('\r\n')[1]!
    expect(line).toContain(',yes,')
    expect(line).toContain(',66.7,')
  })
  it('has one cell per column', () => {
    const line = arenaRunsToCsv([run()]).split('\r\n')[1]!
    expect(line.split(',')).toHaveLength(ARENA_CSV_COLUMNS.length)
  })
})

describe('buildArenaExport', () => {
  const now = new Date('2026-11-25T12:00:00.000Z')
  it('is versioned and flagged self-reported', () => {
    const doc = buildArenaExport([run()], now)
    expect(doc.version).toBe(ARENA_EXPORT_VERSION)
    expect(doc.selfReported).toBe(true)
    expect(doc.exportedAt).toBe('2026-11-25T12:00:00.000Z')
  })
  it('totals match the rows', () => {
    const doc = buildArenaExport(
      [run(), run({ id: 2, result: 'defeat', rounds: 5, correct: 1, score: 1500, bestCombo: 9 })],
      now,
    )
    expect(doc.runCount).toBe(2)
    expect(doc.totals.victories).toBe(1)
    expect(doc.totals.defeats).toBe(1)
    expect(doc.totals.rounds).toBe(15)
    expect(doc.totals.correct).toBe(9)
    expect(doc.totals.accuracy).toBeCloseTo(0.6)
    expect(doc.totals.bestScore).toBe(1500)
    expect(doc.totals.bestCombo).toBe(9)
  })
  it('handles an empty record book', () => {
    const doc = buildArenaExport([], now)
    expect(doc.totals.accuracy).toBe(0)
    expect(doc.runs).toEqual([])
  })
  it('does not alias the input array', () => {
    const input = [run()]
    const doc = buildArenaExport(input, now)
    input.push(run({ id: 9 }))
    expect(doc.runs).toHaveLength(1)
  })
})
