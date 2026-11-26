/**
 * Bridge from explanation grades to the spaced-repetition scheduler.
 *
 * The FSRS-6 scheduler (../fsrs.ts) grades recall with four ratings: Again(1),
 * Hard(2), Good(3), Easy(4). This module maps an explanation grade to one of
 * those ratings so explanation practice can feed the same review history, and
 * blends the EI interval with a scheduler interval. Pure: no ts-fsrs import, so
 * it stays usable in every host; callers pass the numeric rating on.
 */
import type { EiGrade } from './engine'

/** FSRS rating values (kept numeric to avoid importing the scheduler). */
export type FsrsRatingValue = 1 | 2 | 3 | 4

/**
 * Map a graded explanation to an FSRS rating. Restating or shallow answers are
 * Again; developing is Hard; solid is Good; deep is Easy. A copied answer is
 * always Again even if its score looks high.
 */
export function gradeToFsrsRating(grade: Pick<EiGrade, 'band' | 'copied'>): FsrsRatingValue {
  if (grade.copied) return 1
  switch (grade.band) {
    case 'restating':
    case 'shallow':
      return 1
    case 'developing':
      return 2
    case 'solid':
      return 3
    case 'deep':
      return 4
  }
}

/**
 * Blend the EI interval with the FSRS interval (days). Explanation recall is a
 * deeper test than flashcard recall, so we never schedule later than the
 * scheduler suggests; we take the shorter of the two unless the answer was deep.
 */
export function blendIntervals(
  eiDays: number,
  fsrsDays: number,
  grade: Pick<EiGrade, 'band' | 'copied'>,
): number {
  const ei = Math.max(1, Math.round(eiDays))
  const fs = Math.max(1, Math.round(fsrsDays))
  if (grade.copied) return 1
  if (grade.band === 'deep') return Math.round((ei + fs) / 2)
  return Math.min(ei, fs)
}

/** Daily load forecast: how many facts fall due on each of the next `days` days. */
export function dueForecast(dueDays: number[], today: number, days = 14): number[] {
  const out = new Array<number>(Math.max(1, days)).fill(0)
  for (const d of dueDays) {
    const offset = Math.max(0, d - today)
    if (offset < out.length) out[offset] = (out[offset] ?? 0) + 1
  }
  return out
}

/** Pick how many new facts to introduce today so reviews stay under a daily cap. */
export function newFactBudget(dueToday: number, dailyCap = 12, maxNew = 5): number {
  return Math.max(0, Math.min(maxNew, dailyCap - dueToday))
}
