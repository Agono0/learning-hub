/**
 * Reading, Study Plan, and GKT CLI commands.
 */
import { type RegisteredCommand } from './registry'
import { writeFileSync } from 'node:fs'
import { readBoundedText } from '../bounded-input'
import {
  propagateGktBelief,
  toICS,
  type GktNode,
  type SourceKind,
  type WeeklyPlan,
} from '@learning-hub/core'
import {
  createSource,
  generateAndSaveStudyPlan,
  getConceptDag,
  getSavedStudyPlan,
  listSources,
  updateNodeMasteries,
  updateSource,
  upsertConceptDagNode,
} from '@learning-hub/db'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

export function readingCommand(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const status = parseFlag(args, '--status') as 'queued' | 'reading' | 'done' | undefined
    const sources = listSources({ status, limit: 30 })
    if (sources.length === 0) {
      console.log('No reading sources found.')
      return
    }
    const lines = sources.map((s) => {
      const pos = `${s.position}%`
      return `  #${s.id} [${s.kind}] ${s.title.padEnd(30)} prio: ${s.priority} status: ${s.status.padEnd(8)} pos: ${pos}`
    })
    console.log(`Reading Sources:\n${lines.join('\n')}`)
    return
  }

  if (sub === 'add') {
    const title = parseFlag(args, '--title')
    const filePath = parseFlag(args, '--file')
    const url = parseFlag(args, '--url')
    const kind = (parseFlag(args, '--kind') ?? 'article') as SourceKind
    const prioStr = parseFlag(args, '--priority')
    const priority = prioStr ? Number(prioStr) : 50

    let content = parseFlag(args, '--content')
    if (filePath) {
      try {
        content = readBoundedText(filePath)
      } catch (err) {
        console.error(`✖ Failed to read file "${filePath}": ${(err as Error).message}`)
        return
      }
    }

    if (!title || !content) {
      console.error(
        'Usage: learning-hub reading add --title "Title" (--file <path> | --content "text") [--url URL] [--priority 0-100]',
      )
      return
    }

    const created = createSource({
      title,
      content,
      kind,
      url: url ?? null,
      priority,
    })
    console.log(
      `✔ Ingested reading source #${created.id} "${created.title}" (priority: ${created.priority}).`,
    )
    return
  }

  if (sub === 'finish') {
    const id = Number(args[1])
    if (!Number.isInteger(id) || id <= 0) {
      console.error('Usage: learning-hub reading finish <id>')
      return
    }
    const updated = updateSource(id, { status: 'done', position: 100 })
    if (!updated) {
      console.error(`✖ Source #${id} not found.`)
      return
    }
    console.log(`✔ Marked source #${id} as done.`)
    return
  }

  console.log(
    'Usage: learning-hub reading [list [--status queued|reading|done] | add --title "..." (--file <path> | --content "...") | finish <id>]',
  )
}

export function planCommand(args: string[]): void {
  const sub = args[0] || 'week'
  if (sub === 'week' || sub === 'today') {
    const saved = getSavedStudyPlan()
    if (!saved) {
      console.log(
        'No study plan saved yet. Run `learning-hub plan set --minutes 180` to create one.',
      )
      return
    }
    const plan = saved.plan as unknown as WeeklyPlan
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const icsPath = parseFlag(args, '--ics')
    if (icsPath) {
      const events = plan.blocks.map((b) => ({
        date: new Date().toISOString().slice(0, 10),
        title: b.label,
        description: `${b.minutes} min planned via Learning HUB`,
      }))
      writeFileSync(icsPath, toICS(events, 'Learning HUB Study Plan'))
      console.log(`✔ Exported study plan to ${icsPath}`)
      return
    }

    if (sub === 'today') {
      const todayDay = new Date().getDay()
      const todayBlocks = plan.blocks.filter((b) => b.day === todayDay)
      console.log(`Today's Scheduled Blocks (${dayNames[todayDay]}):`)
      if (todayBlocks.length === 0) {
        console.log('  Rest day or no blocks scheduled for today.')
      } else {
        for (const b of todayBlocks) {
          console.log(`  - ${b.label}: ${b.minutes} minutes`)
        }
      }
      return
    }

    console.log(
      `Weekly Study Plan (${plan.weeklyMinutes} min/week, estimated weeks: ${plan.weeks}):`,
    )
    for (let d = 0; d < 7; d++) {
      if (plan.restDay === d) {
        console.log(`  ${dayNames[d]}: [Rest Day]`)
        continue
      }
      const dayBlocks = plan.blocks.filter((b) => b.day === d)
      if (dayBlocks.length === 0) {
        console.log(`  ${dayNames[d]}: —`)
      } else {
        const desc = dayBlocks.map((b) => `${b.label} (${b.minutes}m)`).join(', ')
        console.log(`  ${dayNames[d]}: ${desc}`)
      }
    }
    return
  }

  if (sub === 'set') {
    const minStr = parseFlag(args, '--minutes')
    const restStr = parseFlag(args, '--rest-day')
    if (!minStr) {
      console.error('Usage: learning-hub plan set --minutes <N> [--rest-day 0-6]')
      return
    }
    const weeklyMinutes = Number(minStr)
    const restDay = restStr !== undefined ? Number(restStr) : null
    const { plan } = generateAndSaveStudyPlan({ weeklyMinutes, restDay })
    console.log(
      `✔ Generated and saved study plan template: ${plan.weeklyMinutes} min/week over ${plan.weeks} estimated weeks.`,
    )
    return
  }

  console.log(
    'Usage: learning-hub plan [today [--ics out.ics] | week [--ics out.ics] | set --minutes N [--rest-day N]]',
  )
}

export function gktCommand(args: string[]): void {
  const sub = args[0] || 'drill'
  if (sub === 'drill') {
    const courseIdStr = parseFlag(args, '--course')
    const courseId = courseIdStr ? Number(courseIdStr) : undefined
    const dag = getConceptDag(courseId)
    if (dag.nodes.length === 0) {
      const root = upsertConceptDagNode({
        id: 'core-concept',
        title: 'Core Fundamentals',
        courseId,
        masteryProb: 0.25,
      })
      dag.nodes.push(root)
    }

    const sorted = [...dag.nodes].sort((a, b) => a.masteryProb - b.masteryProb)
    const nextConcept = sorted[0]

    console.log('--- Graph Knowledge Tracing (GKT) ---')
    console.log(`Prerequisite DAG: ${dag.nodes.length} concepts, ${dag.edges.length} edges.`)
    console.log(
      `Suggested focus drill: "${nextConcept.title}" (mastery: ${Math.round(nextConcept.masteryProb * 100)}%)`,
    )

    const answerStr = parseFlag(args, '--answer')
    if (answerStr !== undefined) {
      const passed = answerStr === 'true' || answerStr === 'correct' || answerStr === '1'
      const nodeMap = new Map<string, GktNode>(
        dag.nodes.map((n) => [
          n.id,
          {
            id: n.id,
            title: n.title,
            courseId: n.courseId ?? undefined,
            masteryProb: n.masteryProb,
            slipProb: n.slipProb,
            guessProb: n.guessProb,
            transitProb: n.transitProb,
            lastAssessedAt: n.lastAssessedAt ?? undefined,
          },
        ]),
      )
      const propResult = propagateGktBelief(nodeMap, dag.edges, { nodeId: nextConcept.id, passed })
      updateNodeMasteries(propResult.updatedMasteries)
      console.log(
        `✔ Updated mastery: ${Math.round(propResult.updatedMasteries[nextConcept.id] * 100)}%`,
      )
      if (propResult.rootCauseAlert) {
        console.log(`⚠ Root-cause prerequisite bottleneck: ${propResult.rootCauseAlert.message}`)
      }
    }
    return
  }

  console.log('Usage: learning-hub gkt [drill [--course <id>] [--answer true|false]]')
}

export const readingCommands: RegisteredCommand[] = [
  {
    name: 'reading',
    description: 'incremental reading queue and ingestion',
    usage: '[list|add|finish]',
    run: (runArgs) => readingCommand(runArgs),
  },
]

export const planCommands: RegisteredCommand[] = [
  {
    name: 'plan',
    description: 'study plan agenda and weekly template',
    usage: '[today|week|set]',
    run: (runArgs) => planCommand(runArgs),
  },
]

export const gktCommands: RegisteredCommand[] = [
  {
    name: 'gkt',
    description: 'Bayesian prerequisite DAG knowledge tracing',
    usage: '[drill]',
    run: (runArgs) => gktCommand(runArgs),
  },
]
