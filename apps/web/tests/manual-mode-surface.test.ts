/**
 * Rule 9 surface invariant (F-09): every AI feature's manual mode must be
 * reachable from the UI — either a page wires `useManualMode('<feature>')`,
 * renders the feature's manual envelope, or the feature is on the documented
 * allowlist (text-only modes whose "manual path" is a real person, or the
 * voice tutor which has its own offline Socratic fallback).
 *
 * This test FAILED before F-09: `tutor-session-summary` and `nl-search` had
 * manual modes in core but no UI wiring anywhere.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MANUAL_MODES } from '@learning-hub/core'

const APP_DIR = join(__dirname, '../app')
const COMPONENTS_DIR = join(__dirname, '../src/components')
const UI_DIR = join(__dirname, '../src/ui')

/** Features whose manual mode is deliberately NOT a UI-rendered checklist. */
const SURFACE_ALLOWLIST = new Set([
  // "teach a real person" / self-grade checklists rendered as full flows,
  // not step lists — their manual modes are wired via dedicated UI, not the
  // generic steps panel.
  'feynman-student',
])

/** Recursively collect .tsx/.ts file paths under a directory. */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(entry.name)) out.push(p)
  }
  return out
}

describe('rule 9: every AI manual mode is surfaced in the UI', () => {
  const sources = [...walk(APP_DIR), ...walk(COMPONENTS_DIR), ...walk(UI_DIR)].map((p) => ({
    path: p,
    text: readFileSync(p, 'utf8'),
  }))

  it('every non-allowlisted feature has a UI wiring (useManualMode, TransportPanel feature, or manual-envelope render)', () => {
    const unsurfaced: string[] = []
    for (const feature of Object.keys(MANUAL_MODES)) {
      if (SURFACE_ALLOWLIST.has(feature)) continue
      // The feature id appearing anywhere in app/components source is the
      // wiring proxy — it covers useManualMode('<f>'), TransportPanel
      // feature="<f>" / feature={f} (persona arrays), and manual-envelope
      // fetches (feature=<f> in a query string).
      const wired = sources.some((s) => s.text.includes(feature))
      if (!wired) unsurfaced.push(feature)
    }
    expect(unsurfaced).toEqual([])
  })

  it('the tutor page renders the summary manual steps and the search page the search tips', () => {
    const tutor = readFileSync(join(APP_DIR, 'tutor/page.tsx'), 'utf8')
    const search = readFileSync(join(APP_DIR, 'search/page.tsx'), 'utf8')
    expect(tutor).toContain("useManualMode('tutor-session-summary'")
    expect(tutor).toContain('Do it by hand')
    expect(search).toContain('feature=nl-search')
    expect(search).toContain('Search tips')
  })
})
