/**
 * `review` CLI command — the terminal review session over THE shared due
 * queue (repos/fsrs.dueQueue): same candidate fetch, undo-exclusion and
 * hypercorrection-first ordering as the web review session builder.
 * Grading goes through the canonical executeReview engine (rule 7).
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { dueQueue, executeReview } from '@learning-hub/db'
import { type Grade } from '@learning-hub/core'
import { bar, panel, renderCard } from './ui'
import type { RegisteredCommand } from './registry'

const GRADE_ALIASES: Record<string, Grade> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  a: 1,
  h: 2,
  g: 3,
  e: 4,
}

async function review(limitArg?: string) {
  const limit = Math.max(1, Math.min(100, Number(limitArg ?? 20) || 20))
  // THE shared due queue (repos/fsrs.dueQueue) — same candidate fetch, ordering
  // and undo-exclusion (NOT EXISTS revlog_undos) as the web review session
  // builder. The previous inline copy had none of that, so erased reviews
  // leaked back into the terminal queue's semantics.
  const dueCards = dueQueue({ limit, now: new Date() })
  if (dueCards.length === 0) {
    console.log('Nothing due — check back later. 🌱 (or run `learning-hub stats`)')
    return
  }
  const rl = createInterface({ input: stdin, output: stdout })
  console.log(
    `Review session: ${dueCards.length} cards. Grade with 1=Again 2=Hard 3=Good 4=Easy (q quits).\n`,
  )
  let done = 0
  let correct = 0
  let xpEarned = 0
  let lastStreak: { current: number; best: number } | null = null
  const intervals: number[] = []
  const startedAt = Date.now()
  for (const card of dueCards) {
    const { prompt, reveal } = renderCard(card.type, card.content)
    console.log(`┌─ card #${card.id} · ${card.type}${card.source ? ` · ${card.source}` : ''}`)
    console.log(`│ ${prompt.replace(/\n/g, '\n│ ')}`)
    await rl.question('└─ [enter to reveal]')
    console.log(`   → ${reveal.replace(/\n/g, '\n   ')}\n`)
    let grade: Grade | null = null
    while (grade === null) {
      const answer = (await rl.question('grade [1-4]: ')).trim().toLowerCase()
      if (answer === 'q') break
      if (answer in GRADE_ALIASES) grade = GRADE_ALIASES[answer]!
      else console.log('  1=Again 2=Hard 3=Good 4=Easy (or q to quit)')
    }
    if (grade === null) break
    const reviewedAt = new Date()
    // canonical engine: cards + revlog + XP + streak + Elo/BKT in one transaction
    const result = await executeReview({
      cardId: card.id,
      grade,
      confidence: 1,
      timeMs: Date.now() - startedAt,
    })
    const intervalDays = Math.max(
      0,
      Math.round((Date.parse(result.card.due) - reviewedAt.getTime()) / 86_400_000),
    )
    if (grade >= 2) correct++
    intervals.push(intervalDays)
    xpEarned += result.xpEarned
    lastStreak = { current: result.streak.current, best: result.streak.best }
    done++
    console.log(`   next in ${intervalDays}d\n`)
  }
  rl.close()
  const accuracy = done ? Math.round((correct / done) * 100) : 0
  console.log(
    panel('SESSION COMPLETE', [
      `Reviewed:  ${done} cards`,
      `Recalled:  ${correct}/${done} (${accuracy}%) ${bar(accuracy, 100)}`,
      `Next up:   ${intervals.length ? `${Math.min(...intervals)}–${Math.max(...intervals)} days out` : '—'}`,
      `XP earned: ${xpEarned}`,
      ...(lastStreak ? [`Streak:    ${lastStreak.current} days (best ${lastStreak.best})`] : []),
      `Time:      ${Math.round((Date.now() - startedAt) / 1000)}s`,
    ]),
  )
}

export const reviewCommands: RegisteredCommand[] = [
  {
    name: 'review',
    description: 'terminal review session',
    usage: '[n]',
    run: (runArgs) => review(runArgs[0]),
  },
]
