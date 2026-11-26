/**
 * Free Recall (the "brain dump") — pure domain logic (no I/O, no DB, no fetch).
 *
 * The learner reads a passage, closes it and writes everything they remember.
 * Retrieval practice beats re-reading and even concept mapping for later
 * recall (Roediger & Karpicke 2006; Karpicke & Blunt 2011), but only if the
 * learner then sees what they missed. This module splits the passage into idea
 * units, matches the recall text against them, and reports recalled, partial
 * and missed ideas, possible intrusions, order fidelity and a follow-up plan.
 * Missed units convert into Elaborative Interrogation facts.
 *
 * Matching is lexical (stemmed content words), so it cannot credit a pure
 * paraphrase with no shared words. Present results as coaching, not a verdict.
 */
import { z } from 'zod'
import { contentWords, eiFactSchema, type EiFact } from '../elaborative-interrogation'

export const MIN_UNIT_WORDS = 4
export const RECALLED_AT = 0.6
export const PARTIAL_AT = 0.3
export const INTRUSION_BELOW = 0.2

export const passageSchema = z.object({
  title: z.string().trim().max(200).default(''),
  text: z.string().trim().min(40).max(30_000),
})
export type Passage = z.infer<typeof passageSchema>

/** One idea unit of a passage. */
export interface IdeaUnit {
  id: number
  text: string
  terms: string[]
  /** 0..1 relative importance: rarer terms inside the passage weigh more. */
  weight: number
}

/** Split text into sentences, then on semicolons. Keeps only units with enough content words. */
export function splitIdeaUnits(text: string): IdeaUnit[] {
  const raw = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])|;\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const kept = raw
    .map((t) => ({ t, terms: [...new Set(contentWords(t))] }))
    .filter((u) => u.terms.length >= MIN_UNIT_WORDS)
  const df = new Map<string, number>()
  for (const u of kept) for (const w of u.terms) df.set(w, (df.get(w) ?? 0) + 1)
  const n = kept.length
  const rawW = kept.map(
    (u) => u.terms.reduce((a, w) => a + Math.log(1 + n / (df.get(w) ?? 1)), 0) / u.terms.length,
  )
  const max = Math.max(0, ...rawW)
  return kept.map((u, i) => ({
    id: i + 1,
    text: u.t,
    terms: u.terms,
    weight: max > 0 ? Math.round(((rawW[i] as number) / max) * 100) / 100 : 0,
  }))
}

export type UnitStatus = 'recalled' | 'partial' | 'missed'

export interface UnitResult {
  unit: IdeaUnit
  coverage: number
  status: UnitStatus
  /** Index of the recall sentence that matched best, or -1. */
  matchedAt: number
}

export interface Intrusion {
  text: string
  /** Best coverage this recall sentence had against any idea unit. */
  bestOverlap: number
}

export interface RecallReport {
  units: UnitResult[]
  recalled: number
  partial: number
  missed: number
  /** Weighted recall, recalled=1 partial=0.5, 0..100. */
  recallScore: number
  /** Share of the recall sentences that matched an idea unit, 0..100 (null if nothing written). */
  precision: number | null
  intrusions: Intrusion[]
  /** Longest in-order run of matched units over matched units, 0..100 (null under 3 matches). */
  orderFidelity: number | null
  band: 'blank' | 'fragmentary' | 'partial' | 'good' | 'thorough'
  feedback: string[]
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+|;\s+/)
    .map((s) => s.trim())
    .filter((s) => contentWords(s).length >= 2)
}

function lisLength(xs: number[]): number {
  const tails: number[] = []
  for (const x of xs) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((tails[mid] as number) < x) lo = mid + 1
      else hi = mid
    }
    tails[lo] = x
  }
  return tails.length
}

/** Score a recall attempt against a passage's idea units. */
export function scoreRecall(units: IdeaUnit[], recall: string): RecallReport {
  const sents = sentencesOf(recall)
  const recallSet = new Set(contentWords(recall))
  const sentSets = sents.map((s) => new Set(contentWords(s)))
  const results: UnitResult[] = units.map((unit) => {
    const hits = unit.terms.filter((t) => recallSet.has(t)).length
    const coverage = unit.terms.length === 0 ? 0 : hits / unit.terms.length
    let matchedAt = -1
    let best = 0
    sentSets.forEach((set, i) => {
      const h = unit.terms.filter((t) => set.has(t)).length / Math.max(1, unit.terms.length)
      if (h > best) {
        best = h
        matchedAt = i
      }
    })
    const status: UnitStatus =
      coverage >= RECALLED_AT ? 'recalled' : coverage >= PARTIAL_AT ? 'partial' : 'missed'
    return {
      unit,
      coverage: Math.round(coverage * 100) / 100,
      status,
      matchedAt: status === 'missed' ? -1 : matchedAt,
    }
  })
  const recalled = results.filter((r) => r.status === 'recalled').length
  const partial = results.filter((r) => r.status === 'partial').length
  const missed = results.length - recalled - partial
  const totalW = results.reduce((a, r) => a + (r.unit.weight || 1), 0)
  const gotW = results.reduce(
    (a, r) =>
      a + (r.status === 'recalled' ? 1 : r.status === 'partial' ? 0.5 : 0) * (r.unit.weight || 1),
    0,
  )
  const recallScore = results.length === 0 || totalW === 0 ? 0 : Math.round((gotW / totalW) * 100)

  const intrusions: Intrusion[] = []
  let matchedSents = 0
  sents.forEach((s, i) => {
    const set = sentSets[i] as Set<string>
    let best = 0
    for (const u of units) {
      if (u.terms.length === 0) continue
      const overlap =
        u.terms.filter((t) => set.has(t)).length / Math.min(u.terms.length, Math.max(1, set.size))
      if (overlap > best) best = overlap
    }
    if (best < INTRUSION_BELOW && set.size >= 3)
      intrusions.push({ text: s, bestOverlap: Math.round(best * 100) / 100 })
    else matchedSents++
  })
  const precision = sents.length === 0 ? null : Math.round((matchedSents / sents.length) * 100)

  const order = results.filter((r) => r.matchedAt >= 0).map((r) => r.matchedAt)
  const orderFidelity =
    order.length < 3 ? null : Math.round((lisLength(order) / order.length) * 100)

  const band: RecallReport['band'] =
    recallSet.size === 0
      ? 'blank'
      : recallScore >= 85
        ? 'thorough'
        : recallScore >= 60
          ? 'good'
          : recallScore >= 30
            ? 'partial'
            : 'fragmentary'
  const feedback: string[] = []
  if (band === 'blank')
    feedback.push(
      'Nothing written yet. Close the passage and write what you remember, even rough fragments.',
    )
  if (missed > 0)
    feedback.push(
      `${missed} idea(s) were not recalled. Re-read only those, then try again after a short break.`,
    )
  if (intrusions.length > 0)
    feedback.push(
      `${intrusions.length} sentence(s) do not match the passage. Check them: they may be your own inferences or mistakes.`,
    )
  if (orderFidelity !== null && orderFidelity < 60)
    feedback.push(
      'The ideas came out in a different order from the passage. Try to rebuild the structure, not only the facts.',
    )
  if (band === 'thorough')
    feedback.push(
      'Thorough recall. Space the next attempt out and move to explaining why each idea holds (elaborative interrogation).',
    )
  return {
    units: results,
    recalled,
    partial,
    missed,
    recallScore,
    precision,
    intrusions,
    orderFidelity,
    band,
    feedback,
  }
}

/** Most important missed or partial units first (weight, then lower coverage). */
export function gapList(report: RecallReport, limit = 10): UnitResult[] {
  return report.units
    .filter((u) => u.status !== 'recalled')
    .sort(
      (a, b) => b.unit.weight - a.unit.weight || a.coverage - b.coverage || a.unit.id - b.unit.id,
    )
    .slice(0, Math.max(1, limit))
}

/** Turn the gap into Elaborative Interrogation facts (statement must be 8 to 600 chars). */
export function gapsToEiFacts(report: RecallReport, limit = 10, idPrefix = 'gap'): EiFact[] {
  const out: EiFact[] = []
  for (const g of gapList(report, limit)) {
    const parsed = eiFactSchema.safeParse({
      id: `${idPrefix}${g.unit.id}`,
      statement: g.unit.text.slice(0, 600),
      keyTerms: g.unit.terms.slice(0, 6),
      priorKnowledge: g.status === 'partial' ? 0.5 : 0.2,
    })
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

/** One round in a multi-round retrieval session. */
export interface RoundScore {
  round: number
  recallScore: number
}

/**
 * Plan the next step from the rounds so far. Karpicke & Blunt (2011): repeated
 * retrieval rounds beat study rounds. Stop at 85+, otherwise another round on
 * the gaps; if two rounds in a row do not improve, switch to explanation.
 */
export function nextStep(rounds: RoundScore[]): {
  action: 'retry' | 'explain' | 'done'
  reason: string
} {
  const last = rounds[rounds.length - 1]
  if (!last) return { action: 'retry', reason: 'Start with a first free recall.' }
  if (last.recallScore >= 85)
    return { action: 'done', reason: 'Recall is thorough. Review again after a delay.' }
  const prev = rounds[rounds.length - 2]
  const prev2 = rounds[rounds.length - 3]
  if (
    prev &&
    prev2 &&
    last.recallScore <= prev.recallScore &&
    prev.recallScore <= prev2.recallScore
  ) {
    return {
      action: 'explain',
      reason:
        'Scores have stopped improving. Explain why the missed ideas are true instead of recalling them again.',
    }
  }
  return {
    action: 'retry',
    reason: 'Re-read the missed ideas once, take a short break, then recall again.',
  }
}

/** Delay before the next retrieval, in minutes, from the latest recall score (expanding retrieval). */
export function suggestedDelayMinutes(recallScore: number): number {
  if (recallScore >= 85) return 24 * 60
  if (recallScore >= 60) return 6 * 60
  if (recallScore >= 30) return 60
  return 10
}
