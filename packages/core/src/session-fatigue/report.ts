/** Plain-language reading of a session-fatigue audit. */
import type { FatAudit } from './audit'

export interface FatReport {
  headline: string
  advice: string[]
  caveats: string[]
}

export function summarizeFatigue(a: FatAudit): FatReport {
  const caveats = [
    'This is a pattern in your own reviews, not an experiment. If you save harder or newer cards for late in a session, that can look like tiredness.',
    'Accuracy is corrected for how often each card is usually answered correctly, but not for everything else (time of day, sleep, topic).',
    'The drop is measured on reviews that were not used to find where it starts, so it is not inflated by picking the worst spot.',
  ]
  if (a.truncated) caveats.push('Too many reviews or sessions in scope: only the newest were used.')
  if (a.skipped > 0)
    caveats.push(`${a.skipped} review(s) with an invalid time or rating were skipped.`)
  const advice: string[] = []
  const k = a.knee
  let headline: string
  if (a.usableSessions < 6) {
    headline = `Only ${a.usableSessions} session${a.usableSessions === 1 ? '' : 's'} of 15 or more reviews in the last ${a.windowDays} days. Too few to say anything about fatigue.`
  } else if (k.verdict === 'fatigue' && k.at !== null && k.drop !== null) {
    headline = `Accuracy falls by about ${Math.round(k.drop * 100)} points after roughly ${k.at} reviews in a session.`
    advice.push(a.advice.why)
    if (a.advice.minutes !== null)
      advice.push(
        `That is about ${a.advice.minutes} minutes at your pace. Break for ${a.advice.breakMinutes} minutes or switch activity.`,
      )
  } else if (k.verdict === 'steady') {
    headline = 'No sign that accuracy falls inside your review sessions.'
    advice.push(a.advice.why)
  } else {
    headline = `Accuracy differs by ${Math.round((k.drop ?? 0) * 100)} points after the best-looking cut-off, but the data cannot separate that from chance yet.`
    advice.push(a.advice.why)
  }
  if (a.warmup.slowStart)
    advice.push(
      'The first few reviews of a session are weaker than the next ones. A short warm-up of easy cards may help.',
    )
  return { headline, advice, caveats }
}
