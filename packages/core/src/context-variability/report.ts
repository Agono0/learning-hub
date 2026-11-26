/** Plain-language reading of an audit. Observational numbers are labelled as such. */
import type { CtxAudit } from './audit'

export interface CtxReport {
  headline: string
  advice: string[]
  caveats: string[]
}

export function summarizeContext(a: CtxAudit): CtxReport {
  const advice: string[] = []
  const caveats = [
    'These are patterns in your own reviews, not experiments. Easier cards may simply be reviewed in easier places or at easier hours.',
    'The context effect on recall is real but modest in the research (Smith & Vela 2001). Treat large gaps as a prompt to test, not a verdict.',
  ]
  if (a.truncated) caveats.push('Too many reviews in scope: only the newest 20000 were used.')

  if (a.reviews < 20) {
    return {
      headline: `Only ${a.reviews} review${a.reviews === 1 ? '' : 's'} in the last ${a.windowDays} days. Not enough to say anything yet.`,
      advice: ['Keep reviewing. Log where you study (start a session) so places can be compared.'],
      caveats,
    }
  }
  if (a.attributedShare < 0.3) {
    advice.push(
      `Only ${Math.round(a.attributedShare * 100)}% of reviews fall inside a logged session. Log where you study to compare places.`,
    )
  }
  const t = a.transfer
  let headline: string
  if (t.verdict === 'context-bound' && t.gap !== null) {
    headline = `Recall drops by about ${Math.round(t.gap * 100)} points when a card is reviewed away from where it was first learned.`
    advice.push(
      'Review your context-bound cards in a different place or at a different time of day, starting with the list below.',
    )
  } else if (t.verdict === 'transfers') {
    headline =
      'Recall holds up when you change place or time of day. No sign of context-bound memory.'
    advice.push('Keep varying where and when you review. Variety is cheap insurance.')
  } else if (t.verdict === 'inconclusive') {
    headline = `Home and away recall differ by ${Math.round((t.gap ?? 0) * 100)} points, but the data cannot tell that from no difference yet (${Math.round((t.gapLow ?? 0) * 100)} to ${Math.round((t.gapHigh ?? 0) * 100)} points).`
    advice.push(
      'Keep logging sessions and reviewing in more than one place. The answer firms up with more cards.',
    )
  } else {
    headline = `Context spread is ${Math.round(a.diversity * 100)}% across ${a.reviews} reviews. Too little variety to compare home and away yet.`
    advice.push(
      'Review the same cards in a second place or at a second time of day so the comparison becomes possible.',
    )
  }
  if (a.diversity < 0.3 && a.reviews >= 40) {
    advice.push(
      'Nearly all reviews happen in one place and hour. A new room or time of day builds more retrieval routes.',
    )
  }
  for (const g of a.goals) {
    if (g.status === 'unfamiliar') {
      advice.push(
        `${g.label}: ${Math.round(g.matchShare * 100)}% of your reviews match ${g.place} at ${g.window}. Do about ${g.reviewsToFamiliar} more there, or use the reinstatement script.`,
      )
    }
  }
  return { headline, advice, caveats }
}
