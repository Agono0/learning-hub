import { describe, expect, it } from 'vitest'
import {
  attemptTitle,
  speedTrendLabel,
  type CardTimelinePayload,
} from '../src/components/arena/CardTimeline'

const attempt = (
  over: Partial<CardTimelinePayload['attempts'][number]> = {},
): CardTimelinePayload['attempts'][number] => ({
  run: 2,
  attempt: 3,
  grade: 3,
  confidence: 0,
  timeMs: 2500,
  correct: true,
  overconfident: false,
  ...over,
})

describe('speedTrendLabel', () => {
  it('labels every trend', () => {
    expect(speedTrendLabel('faster')).toBe('Getting faster')
    expect(speedTrendLabel('slower')).toBe('Getting slower')
    expect(speedTrendLabel('steady')).toBe('Steady pace')
    expect(speedTrendLabel('unknown')).toContain('Not enough')
  })
})

describe('attemptTitle', () => {
  it('names the run, attempt, grade and time', () => {
    expect(attemptTitle(attempt())).toBe('Run 2, attempt 3: Good in 2.5s')
  })
  it('flags confident misses', () => {
    expect(attemptTitle(attempt({ grade: 1, overconfident: true }))).toBe(
      'Run 2, attempt 3: Again in 2.5s (confident miss)',
    )
  })
  it('survives an unknown grade', () => {
    expect(attemptTitle(attempt({ grade: 9 }))).toContain('Unknown')
  })
})
