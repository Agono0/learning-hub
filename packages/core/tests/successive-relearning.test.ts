import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SR_CRITERION,
  initialSrState,
  needsAnotherRecall,
  recordSrResult,
} from '../src/practice/successive-relearning'

describe('successive relearning', () => {
  it('a never-failed card never re-queues (FSRS owns it)', () => {
    let s = initialSrState()
    s = recordSrResult(s, true)
    s = recordSrResult(s, true)
    expect(needsAnotherRecall(s)).toBe(false)
  })

  it('default criterion: a mistake needs one verification recall', () => {
    let s = initialSrState()
    expect(needsAnotherRecall(s, DEFAULT_SR_CRITERION)).toBe(false) // nothing failed yet
    s = recordSrResult(s, false)
    expect(needsAnotherRecall(s, DEFAULT_SR_CRITERION)).toBe(true) // failed, unverified
    s = recordSrResult(s, true)
    expect(needsAnotherRecall(s, DEFAULT_SR_CRITERION)).toBe(false) // verified once
  })

  it('criterion 2 keeps the card until two spaced correct recalls', () => {
    let s = initialSrState()
    s = recordSrResult(s, false)
    s = recordSrResult(s, true)
    expect(needsAnotherRecall(s, 2)).toBe(true)
    s = recordSrResult(s, true)
    expect(needsAnotherRecall(s, 2)).toBe(false)
  })

  it('a new mistake resets the streak and counts toward learning', () => {
    let s = initialSrState()
    s = recordSrResult(s, false)
    s = recordSrResult(s, true) // verified once
    s = recordSrResult(s, false) // failed again
    expect(s.mistakes).toBe(2)
    expect(s.streakSinceMistake).toBe(0)
    expect(needsAnotherRecall(s, 1)).toBe(true)
  })

  it('tracks totals for the summary', () => {
    let s = initialSrState()
    for (const c of [true, false, true, true]) s = recordSrResult(s, c)
    expect(s).toEqual({ correct: 3, mistakes: 1, streakSinceMistake: 2 })
  })
})
