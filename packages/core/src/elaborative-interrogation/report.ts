/** Session reporting and export for Elaborative Interrogation. */
import type { EiFact, EiFactState, EiGrade } from './index'

export interface EiAttempt {
  factId: string
  style: string
  score: number
  band: EiGrade['band']
  day: number
}

/** Count attempts per band, always listing all five bands. */
export function bandHistogram(attempts: EiAttempt[]): Record<EiGrade['band'], number> {
  const out: Record<EiGrade['band'], number> = {
    restating: 0,
    shallow: 0,
    developing: 0,
    solid: 0,
    deep: 0,
  }
  for (const a of attempts) out[a.band]++
  return out
}

/** Mean score per prompt style, to show which styles a learner finds hardest. */
export function styleMeans(attempts: EiAttempt[]): { style: string; mean: number; n: number }[] {
  const acc = new Map<string, { sum: number; n: number }>()
  for (const a of attempts) {
    const cur = acc.get(a.style) ?? { sum: 0, n: 0 }
    cur.sum += a.score
    cur.n++
    acc.set(a.style, cur)
  }
  return [...acc.entries()]
    .map(([style, v]) => ({ style, mean: Math.round(v.sum / v.n), n: v.n }))
    .sort((a, b) => a.mean - b.mean || a.style.localeCompare(b.style))
}

/** Score trend: mean of the last `window` attempts minus the mean of the `window` before them. */
export function trend(attempts: EiAttempt[], window = 5): number | null {
  if (attempts.length < window * 2) return null
  const mean = (xs: EiAttempt[]) => xs.reduce((a, b) => a + b.score, 0) / xs.length
  const last = attempts.slice(-window)
  const prev = attempts.slice(-window * 2, -window)
  return Math.round(mean(last) - mean(prev))
}

/** Markdown export of the bank and progress, for notes or sharing. */
export function toMarkdown(facts: EiFact[], states: EiFactState[]): string {
  const byId = new Map(states.map((s) => [s.factId, s]))
  const lines = ['# Elaborative Interrogation bank', '']
  for (const f of facts) {
    const s = byId.get(f.id)
    const progress =
      s && s.attempts > 0
        ? `best ${s.bestScore}/100, level ${s.level}, ${s.attempts} attempt(s)`
        : 'not attempted'
    lines.push(`- **${f.id}** ${f.statement}`)
    lines.push(`  - ${progress}${f.keyTerms.length ? `; key terms: ${f.keyTerms.join(', ')}` : ''}`)
  }
  return `${lines.join('\n')}\n`
}
