/**
 * Arena record-book export — pure serialization of settled runs.
 *
 * CSV follows RFC 4180 quoting plus spreadsheet-formula neutralization: a
 * text cell that starts with = + - @ tab or CR is prefixed with an apostrophe
 * so opening the file in a spreadsheet can never execute a formula. The JSON
 * form carries a schema version and an explicit `selfReported` marker: arena
 * grades are client-controlled, so the export is a personal practice log, not
 * a verified record.
 */

export interface ArenaExportRun {
  id: number
  createdAt: string
  result: string
  archetype: string
  boss: boolean
  rounds: number
  correct: number
  accuracy: number
  bestCombo: number
  crits: number
  score: number
  coins: number
  xp: number
  durationMs: number
  deckIds: number[]
}

export const ARENA_EXPORT_VERSION = 1

export const ARENA_CSV_COLUMNS = [
  'run_id',
  'played_at',
  'result',
  'guardian',
  'boss',
  'rounds',
  'correct',
  'accuracy_pct',
  'best_combo',
  'crits',
  'score',
  'coins',
  'xp',
  'duration_s',
  'deck_ids',
] as const

/** Neutralize spreadsheet formulas, then apply RFC 4180 quoting. */
export function csvCell(value: string | number | boolean): string {
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function arenaRunsToCsv(runs: ReadonlyArray<ArenaExportRun>): string {
  const lines = runs.map((r) =>
    [
      r.id,
      r.createdAt,
      r.result,
      r.archetype,
      r.boss ? 'yes' : 'no',
      r.rounds,
      r.correct,
      (Math.round(r.accuracy * 1000) / 10).toFixed(1),
      r.bestCombo,
      r.crits,
      r.score,
      r.coins,
      r.xp,
      Math.round(r.durationMs / 1000),
      r.deckIds.join(' '),
    ]
      .map(csvCell)
      .join(','),
  )
  return [ARENA_CSV_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n'
}

export interface ArenaExportDocument {
  version: number
  exportedAt: string
  /** Grades are self-reported in the client; this is a practice log. */
  selfReported: true
  runCount: number
  totals: {
    victories: number
    defeats: number
    rounds: number
    correct: number
    accuracy: number
    bestScore: number
    bestCombo: number
  }
  runs: ArenaExportRun[]
}

export function buildArenaExport(
  runs: ReadonlyArray<ArenaExportRun>,
  now: Date = new Date(),
): ArenaExportDocument {
  const rounds = runs.reduce((s, r) => s + r.rounds, 0)
  const correct = runs.reduce((s, r) => s + r.correct, 0)
  return {
    version: ARENA_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    selfReported: true,
    runCount: runs.length,
    totals: {
      victories: runs.filter((r) => r.result === 'victory').length,
      defeats: runs.filter((r) => r.result !== 'victory').length,
      rounds,
      correct,
      accuracy: rounds === 0 ? 0 : correct / rounds,
      bestScore: runs.reduce((m, r) => Math.max(m, r.score), 0),
      bestCombo: runs.reduce((m, r) => Math.max(m, r.bestCombo), 0),
    },
    runs: [...runs],
  }
}
