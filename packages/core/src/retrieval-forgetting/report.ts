/** Plain-language summary of an audit. Heuristics are labelled as such. */
import type { RifAudit } from './audit'

export interface RifReport {
  headline: string
  advice: string[]
  caveats: string[]
}

export function summarizeAudit(a: RifAudit): RifReport {
  const advice: string[] = []
  if (a.clusters.length === 0) {
    return {
      headline: `No competing cards found among ${a.scanned} cards.`,
      advice: [
        'Nothing to guard. Cards that share a cue but have different answers will show up here.',
      ],
      caveats: caveats(a),
    }
  }
  const headline =
    a.atRisk > 0
      ? `${a.atRisk} card${a.atRisk === 1 ? '' : 's'} at high risk of being crowded out by practised siblings.`
      : a.watch > 0
        ? `${a.watch} card${a.watch === 1 ? '' : 's'} to watch. Nothing at high risk.`
        : 'Practice looks balanced across competing cards.'
  if (a.atRisk > 0) {
    advice.push(
      'Review the suppressed cards in the rescue queue before practising their siblings again.',
    )
    advice.push(
      'Test them from the answer side (reverse probe): an independent cue avoids the suppression.',
    )
  }
  const lopsided = a.clusters.filter((c) => c.balance < 0.5 && c.members.length >= 3)
  if (lopsided.length > 0) {
    advice.push(
      `${lopsided.length} group${lopsided.length === 1 ? ' is' : 's are'} practised unevenly. Practise the whole group in one session, interleaved, instead of one card at a time.`,
    )
  }
  if (a.atRisk === 0 && a.watch === 0)
    advice.push('Keep reviewing as you are. Re-check after a heavy cramming week.')
  return { headline, advice, caveats: caveats(a) }
}

function caveats(a: RifAudit): string[] {
  const out = [
    'Risk is estimated from card wording and your review history. It is a heuristic, not a memory measurement.',
  ]
  if (a.truncatedScope)
    out.push('Too many cards in scope: only the first 1500 were examined. Narrow by deck.')
  if (a.clusters.some((c) => c.trimmed))
    out.push('Some very large groups were trimmed to their best-connected cards.')
  return out
}
