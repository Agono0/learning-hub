import { describe, expect, it } from 'vitest'
import { runEstimateText } from '../src/components/arena/RunEstimateLine'

describe('runEstimateText', () => {
  it('says typical pace with no history', () => {
    expect(runEstimateText(10, { sampleRuns: 0, medianMsPerCard: null })).toContain('typical pace')
  })
  it('names the sample size when using the personal pace', () => {
    const t = runEstimateText(10, { sampleRuns: 7, medianMsPerCard: 6000 })
    expect(t).toContain('your pace over 7 runs')
    expect(t).toContain('About 1 min')
  })
  it('mentions the boss at boss length only', () => {
    const none = { sampleRuns: 0, medianMsPerCard: null }
    expect(runEstimateText(20, none)).toContain('boss')
    expect(runEstimateText(5, none)).not.toContain('boss')
  })
})
