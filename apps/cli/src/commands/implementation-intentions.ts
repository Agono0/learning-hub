/**
 * Implementation Intentions & Habit Formation CLI commands:
 * 1. templates — list canonical plan templates + obstacle library
 * 2. evaluate — score one if-then plan (--data/--file/stdin JSON)
 * 3. project — Lally-curve automaticity projection (--days/--adherence/--complexity)
 * 4. instantiate — draft a plan from a template (--template/--goal)
 * 5. deck — FSRS-6 bridge cards
 *
 * `--json` emits the same envelope as the web handler and MCP tools.
 */

import { readBoundedJson } from '../bounded-input'
import { numFlag } from '../flags'
import { type RegisteredCommand } from './registry'
import {
  evaluatePlanQuality,
  generateIIFSRSCards,
  getCanonicalPlanTemplates,
  IfThenPlanSchema,
  instantiateTemplate,
  LALLY_MEDIAN_DAYS,
  LALLY_RANGE_DAYS,
  OBSTACLE_LIBRARY,
  projectAutomaticity,
  type AdherenceDay,
} from '@learning-hub/core'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return undefined
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function readJsonPayload(args: string[]): unknown {
  const inline = parseFlag(args, '--data')
  if (inline) return JSON.parse(inline)
  const file = parseFlag(args, '--file')
  if (file) return readBoundedJson(file)
  return readBoundedJson(0)
}

/** Build a synthetic adherence record from --days and --adherence flags. */
function buildRecord(daysCount: number, adherencePct: number): AdherenceDay[] {
  return Array.from({ length: daysCount }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    performed: i % 100 < adherencePct,
  }))
}

export const implementationIntentionCommands: RegisteredCommand[] = [
  {
    name: 'ii-templates',
    description: 'list if-then plan templates + MCII obstacle library',
    usage: '[--json]',
    run: (args) => {
      const templates = getCanonicalPlanTemplates()
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, templates, obstacles: OBSTACLE_LIBRARY }, null, 2))
        return
      }
      console.log('\nImplementation Intention Templates')
      console.log('═'.repeat(65))
      for (const t of templates) {
        console.log(`${t.id}  [${t.domain} · complexity ${t.complexityFactor}]`)
        console.log(`  IF   ${t.triggerFrame}`)
        console.log(`  THEN ${t.actionFrame}`)
      }
      console.log('\nMCII Obstacle Library')
      console.log('═'.repeat(65))
      for (const o of OBSTACLE_LIBRARY) {
        console.log(`[${o.category}] ${o.obstacle}`)
        console.log(`  → ${o.responsePattern}`)
      }
    },
  },
  {
    name: 'ii-evaluate',
    description: 'score an if-then plan (specificity, operationality, cue, MCII)',
    usage: '--data <json> | --file <path> [--json]',
    run: (args) => {
      const plan = IfThenPlanSchema.parse(readJsonPayload(args))
      const quality = evaluatePlanQuality(plan)
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, quality }, null, 2))
        return
      }
      console.log('\nPlan Quality (Gollwitzer & Sheeran 2006 rubric)')
      console.log('═'.repeat(65))
      console.log(`Trigger specificity:    ${quality.triggerSpecificity}/100`)
      console.log(`Action operationality:  ${quality.actionOperationality}/100`)
      console.log(`Cue reliability:        ${quality.cueReliability}/100`)
      console.log(`Obstacle coverage:      ${quality.obstacleCoverage}/100`)
      console.log(`Quality index:          ${quality.qualityIndex}/100`)
      for (const r of quality.rationales) console.log(`  - ${r}`)
    },
  },
  {
    name: 'ii-project',
    description: 'project habit automaticity on the Lally et al. (2009) curve',
    usage: '[--days N] [--adherence PCT] [--complexity F] [--json]',
    run: (args) => {
      const daysCount = numFlag(parseFlag(args, '--days'), '--days', 30)
      const adherencePct = numFlag(parseFlag(args, '--adherence'), '--adherence', 80)
      const complexity = numFlag(parseFlag(args, '--complexity'), '--complexity', 1)
      const projection = projectAutomaticity(buildRecord(daysCount, adherencePct), complexity)
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, projection }, null, 2))
        return
      }
      console.log('\nAutomaticity Projection (Lally et al. 2009)')
      console.log('═'.repeat(65))
      console.log(`Current strength:   ${projection.currentStrength}% of asymptote`)
      console.log(`Days to ~95%:       ${projection.daysToAutomaticity}`)
      console.log(
        `Reference median:   ${LALLY_MEDIAN_DAYS} days (range ${LALLY_RANGE_DAYS.min}-${LALLY_RANGE_DAYS.max})`,
      )
      console.log(`Adherence:          ${Math.round(projection.adherenceRate * 100)}%`)
      console.log(`Current streak:     ${projection.currentStreak} days`)
      console.log(`\n${projection.caveat}`)
    },
  },
  {
    name: 'ii-instantiate',
    description: 'draft an if-then plan from a canonical template',
    usage: '--template <id> --goal "text" [--json]',
    run: (args) => {
      const templateId = parseFlag(args, '--template') ?? 'ii-study-spaced-review'
      const goal = parseFlag(args, '--goal') ?? 'My goal'
      const plan = instantiateTemplate(templateId, goal)
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, plan }, null, 2))
        return
      }
      console.log('\nDraft Implementation Intention')
      console.log('═'.repeat(65))
      console.log(`Goal:    ${plan.goal}`)
      console.log(`IF:      ${plan.trigger}`)
      console.log(`THEN:    ${plan.action}`)
      console.log(`Obstacle: ${plan.obstacle ?? '(none)'}`)
      console.log(`Coping:  ${plan.obstacleResponse ?? '(none)'}`)
    },
  },
  {
    name: 'ii-deck',
    description: 'generate FSRS-6 cards (plan anatomy + MCII obstacle drills)',
    usage: '[--templates id1,id2] [--json]',
    run: (args) => {
      const list = parseFlag(args, '--templates')
      const cards = generateIIFSRSCards(list ? list.split(',') : undefined)
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ok: true, count: cards.length, cards }, null, 2))
        return
      }
      console.log(`\nFSRS-6 Bridge Deck — ${cards.length} cards`)
      console.log('═'.repeat(65))
      for (const c of cards) {
        console.log(`[${c.tags.join(', ')}]`)
        console.log(`  Q: ${c.front}`)
        console.log(`  A: ${c.back}\n`)
      }
    },
  },
]
