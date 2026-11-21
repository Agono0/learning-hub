/**
 * Dual Coding Theory CLI Command:
 * 1. analyze: quick viability scan of a text snippet or card — is it
 *    dual-coded, which non-verbal modality fits, what to draw (Paivio 1971,
 *    1986; Clark & Paivio 1991). Mirrors GET /api/cognitive/dual-coding.
 * 2. evaluate: full evaluation with explicit image/diagram flags and
 *    per-channel retention estimates — composite retrieval probability
 *    P = 1 - (1 - Rv)(1 - Rimg), forgetting-reduction factor vs a verbal-only
 *    trace, and the modality suggestion (Mayer 2001 multimedia principle).
 *    Mirrors POST /api/cognitive/dual-coding.
 *
 * Output shapes mirror the web handler and the MCP tools exactly — the
 * `--json` flag emits the same envelope (`{ ok, analysis }`) so hosts can be
 * diffed by the host-parity check.
 */

import { type RegisteredCommand } from './registry'
import { analyzeDualCoding, type DualCodingAnalysis } from '@learning-hub/core'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

/**
 * Parses a positive-integer flag (web GET `z.coerce.number().int().positive()`
 * parity). Returns undefined when absent, null when present but invalid.
 */
function parsePositiveIntFlag(args: string[], flag: string): number | undefined | null {
  const raw = parseFlag(args, flag)
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

/**
 * Parses a 0..1 probability flag (web POST `z.number().min(0).max(1)` parity).
 * Returns undefined when absent, null when present but out of range.
 */
function parseUnitIntervalFlag(args: string[], flag: string): number | undefined | null {
  const raw = parseFlag(args, flag)
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (Number.isNaN(n) || n < 0 || n > 1) return null
  return n
}

/** Renders one DualCodingAnalysis with the cognitive-command banner style. */
function printAnalysis(analysis: DualCodingAnalysis, text: string, mode: 'scan' | 'full'): void {
  if (mode === 'scan') {
    console.log('\nDual Coding Viability Scan')
    console.log('Paivio (1971, 1986) dual coding; Clark & Paivio (1991)')
  } else {
    console.log('\nDual Coding Evaluation — Composite Retention')
    console.log('Paivio (1971, 1986) dual coding; Mayer (2001) multimedia principle')
  }
  console.log('═'.repeat(65))
  console.log(
    `Card:                ${analysis.cardId !== undefined ? `#${analysis.cardId}` : '(none)'}`,
  )
  console.log(`Text:                ${text}`)
  console.log(`Dual Coded:          ${analysis.isDualCoded ? 'YES' : 'NO'}`)
  console.log(`Verbal Retention:    ${(analysis.verbalRetention * 100).toFixed(1)}%`)
  console.log(`Visual Retention:    ${(analysis.visualRetention * 100).toFixed(1)}%`)
  console.log(`Composite Retention: ${(analysis.compositeRetention * 100).toFixed(1)}%`)
  console.log(`Forgetting Reduction: ${analysis.forgettingReductionFactor}x vs verbal-only`)
  console.log(`Recommended Modality: ${analysis.recommendedModality}`)
  console.log(`Visual Prompt:       ${analysis.visualPromptSuggestion}`)
  if (!analysis.isDualCoded) {
    console.log('─'.repeat(65))
    console.log('Next step:  add one non-verbal channel (image or diagram) to open the')
    console.log('            imagistic trace — two independent routes, less forgetting.')
  }
}

/**
 * `dualcoding` — Paivio dual-coding viability scan / composite-retention
 * evaluation from the terminal; pure engine surface (no DB reads or writes).
 */
export function dualcodingCommand(args: string[]): void {
  const sub = args[0] || 'analyze'

  if (sub === 'analyze' || sub === 'scan') {
    const cardId = parsePositiveIntFlag(args, '--card')
    if (cardId === null) {
      console.error('Invalid --card: expected a positive integer card ID.')
      process.exitCode = 1
      return
    }
    const text = parseFlag(args, '--text') || ''
    const analysis = analyzeDualCoding({
      cardId,
      text: text || 'Concept definition',
      hasImage: false,
      hasDiagram: false,
    })
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ ok: true, analysis }))
      return
    }
    printAnalysis(analysis, text || 'Concept definition', 'scan')
    return
  }

  if (sub === 'evaluate' || sub === 'eval') {
    const text = parseFlag(args, '--text')
    // Web POST parity: `z.string().min(1)` — any non-empty string is valid.
    if (!text || text.length < 1) {
      console.error(
        'Usage: learning-hub dualcoding evaluate --text <text> [--card <id>] [--image] [--diagram] [--verbal 0.7 --visual 0.8] [--json]',
      )
      process.exitCode = 1
      return
    }
    const cardId = parsePositiveIntFlag(args, '--card')
    if (cardId === null) {
      console.error('Invalid --card: expected a positive integer card ID.')
      process.exitCode = 1
      return
    }
    const verbalRetention = parseUnitIntervalFlag(args, '--verbal')
    if (verbalRetention === null) {
      console.error('Invalid --verbal: expected a probability between 0 and 1.')
      process.exitCode = 1
      return
    }
    const visualRetention = parseUnitIntervalFlag(args, '--visual')
    if (visualRetention === null) {
      console.error('Invalid --visual: expected a probability between 0 and 1.')
      process.exitCode = 1
      return
    }
    const analysis = analyzeDualCoding({
      cardId,
      text,
      hasImage: hasFlag(args, '--image'),
      hasDiagram: hasFlag(args, '--diagram'),
      verbalRetention,
      visualRetention,
    })
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ ok: true, analysis }))
      return
    }
    printAnalysis(analysis, text, 'full')
    return
  }

  console.log('Usage: learning-hub dualcoding [analyze|evaluate]')
  console.log('  analyze [--card <id>] [--text <text>] [--json]')
  console.log('                                  quick dual-coding viability scan (GET parity)')
  console.log(
    '  evaluate --text <text> [--card <id>] [--image] [--diagram] [--verbal 0.7 --visual 0.8] [--json]',
  )
  console.log(
    '                                  composite retention + modality advice (POST parity)',
  )
}

export const dualcodingCommands: RegisteredCommand[] = [
  {
    name: 'dualcoding',
    description: 'Paivio (1971, 1986) dual coding analysis & composite retention',
    usage: '[analyze|evaluate]',
    run: (runArgs) => dualcodingCommand(runArgs),
  },
]
