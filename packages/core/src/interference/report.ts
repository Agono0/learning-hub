/** Plain-language reading of an interference audit. */
import type { InfAudit } from './audit'

export interface InfReport {
  headline: string
  advice: string[]
  caveats: string[]
}

export function summarizeInterference(a: InfAudit): InfReport {
  const caveats = [
    'Similarity is measured on card text only. A pair can look alike on paper and never be confused, or be confused for reasons the text does not show.',
    'Review evidence is observational: cards reviewed close together may share a hard topic. The similarity thresholds are heuristics, not validated cut-offs.',
    'Words are matched by spelling. Synonyms are not linked, and text in Chinese, Japanese or Korean is compared by character pairs.',
  ]
  if (a.truncated)
    caveats.push(
      'Too many cards or pairs in scope: only part was checked. Narrow the audit to one deck.',
    )
  const risky = a.pairs.filter((p) => p.kind !== 'near-duplicate')
  const high = risky.filter((p) => p.band === 'high')
  const proven = risky.filter((p) => p.evidence.verdict === 'interfering')
  const dupes = a.byKind['near-duplicate']
  const advice: string[] = []
  if (a.scanned < 2 || a.pairs.length === 0) {
    return {
      headline:
        a.scanned < 2
          ? 'Fewer than two usable cards. Nothing to compare.'
          : `No lookalike cards found among ${a.scanned} cards.`,
      advice: a.dismissed > 0 ? [`${a.dismissed} pair(s) were dismissed and are hidden.`] : [],
      caveats,
    }
  }
  if (proven.length > 0)
    advice.push(
      `${proven.length} pair(s) show more failures right after the lookalike was reviewed. Start with those.`,
    )
  if (high.length > 0)
    advice.push(`${high.length} pair(s) are high severity. Fix the cues or run the drill.`)
  if (dupes > 0) advice.push(`${dupes} near-duplicate pair(s): merge or delete one card of each.`)
  advice.push('Use the review order option to keep lookalikes apart within a session.')
  return {
    headline: `${risky.length} lookalike pair(s) across ${a.cardsAffected} cards${proven.length ? `, ${proven.length} with review evidence` : ''}.`,
    advice,
    caveats,
  }
}
