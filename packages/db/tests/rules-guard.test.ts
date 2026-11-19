/**
 * Rules Guard Structural Invariant Tests (F-24)
 *
 * Mechanically enforces AGENTS.md Hard Rules:
 * - Rule 7: One grading path. Mastery and Elo rating updates must route exclusively
 *   through `applySkillResponse` (packages/db/src/mastery-service.ts).
 * - Rule 8: Append-only tables stay append-only (revlog, xp_events, friction_events, elo_events, study_coin_ledger).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = join(__dirname, '../../..')

function walkFiles(dir: string, ext: string = '.ts'): string[] {
  const results: string[] = []
  try {
    const list = readdirSync(dir)
    for (const file of list) {
      const fullPath = join(dir, file)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('dist')) {
          results.push(...walkFiles(fullPath, ext))
        }
      } else if (file.endsWith(ext) && !file.endsWith('.d.ts')) {
        results.push(fullPath)
      }
    }
  } catch {
    // skip unreadable directories
  }
  return results
}

describe('Rules Guard: Structural Invariant Enforcement', () => {
  it('Rule 7: No direct mastery or eloEvents writes exist outside mastery-service.ts and test fixtures', () => {
    const sourceDirs = [
      join(rootDir, 'apps/web/src'),
      join(rootDir, 'apps/cli/src'),
      join(rootDir, 'apps/mcp/src'),
      join(rootDir, 'apps/server/src'),
    ]

    const files = sourceDirs.flatMap((d) => walkFiles(d))
    const forbiddenPatterns = [/\.update\(\s*mastery\s*\)/, /\.insert\(\s*eloEvents\s*\)/]

    const violations: Array<{ file: string; match: string }> = []

    for (const f of files) {
      const content = readFileSync(f, 'utf8')
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push({ file: f, match: pattern.toString() })
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('Rule 8: Append-only tables have no UPDATE or DELETE statements in web handlers or production repos', () => {
    const sourceDirs = [
      join(rootDir, 'apps/web/src/server/handlers'),
      join(rootDir, 'packages/db/src/repos'),
    ]

    const files = sourceDirs.flatMap((d) => walkFiles(d))
    const appendOnlyTableNames = [
      'revlog',
      'xp_events',
      'friction_events',
      'elo_events',
      'study_coin_ledger',
      'notification_log',
      'prototype_exemplar_sessions',
    ]

    const violations: Array<{ file: string; line: string }> = []

    for (const f of files) {
      const content = readFileSync(f, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim()
        if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) continue

        for (const tbl of appendOnlyTableNames) {
          const sqlPattern = new RegExp(`(UPDATE|DELETE\\s+FROM)\\s+["\`]?${tbl}["\`]?`, 'i')
          const drizzlePattern = new RegExp(`\\.(update|delete)\\(\\s*${tbl}\\s*\\)`, 'i')
          if (sqlPattern.test(line) || drizzlePattern.test(line)) {
            violations.push({ file: `${f}:${i + 1}`, line: line.trim() })
          }
        }
      }
    }

    expect(violations).toEqual([])
  })
})
