/**
 * Idle detection core (S3-33): the classify thresholds (jitter / break /
 * discard), the Max Focus suppression (S3-34's idle half), the subtraction
 * cap, and the dialog action application (S3-78).
 */
import { describe, expect, it } from 'vitest'
import { applyIdleSubtraction, classifyIdle, idleThresholdsSchema } from '../src/tasks/idle'

describe('classifyIdle', () => {
  it('jitter under the ignore threshold stays active (never prompts)', () => {
    const r = classifyIdle(90_000) // 1.5 min < 2 min default
    expect(r.verdict).toBe('active')
    expect(r.subtractMs).toBe(0)
    expect(r.suppressedBy).toBeNull()
  })

  it('mid-length idle suggests a break (information, not subtraction)', () => {
    const r = classifyIdle(5 * 60_000)
    expect(r.verdict).toBe('suggest-break')
    expect(r.subtractMs).toBe(0)
  })

  it('at/over the discard threshold suggests discarding the gap', () => {
    const r = classifyIdle(12 * 60_000)
    expect(r.verdict).toBe('suggest-discard')
    expect(r.subtractMs).toBe(10 * 60_000) // capped at the threshold
  })

  it('a forgotten-overnight gap cannot wipe the whole day (cap)', () => {
    expect(classifyIdle(8 * 60 * 60_000).subtractMs).toBe(10 * 60_000)
  })

  it('negative input clamps to zero', () => {
    expect(classifyIdle(-500).verdict).toBe('active')
  })

  it('Max Focus suppresses the gate (S3-34) — honest reason on the result', () => {
    const r = classifyIdle(30 * 60_000, {}, { maxFocusActive: true })
    expect(r.verdict).toBe('active')
    expect(r.suppressedBy).toBe('max-focus')
    expect(r.subtractMs).toBe(0)
  })

  it('thresholds are configurable and validated', () => {
    const r = classifyIdle(3 * 60_000, { ignoreMs: 4 * 60_000 })
    expect(r.verdict).toBe('active') // under the raised ignore
    expect(idleThresholdsSchema.safeParse({ ignoreMs: -1 }).success).toBe(false)
  })
})

describe('applyIdleSubtraction (S3-78 actions)', () => {
  const discarded = classifyIdle(12 * 60_000)
  const breaking = classifyIdle(5 * 60_000)

  it('discard subtracts the capped gap', () => {
    expect(applyIdleSubtraction(60_000, discarded, 'discard')).toBe(0) // floor at zero
    expect(applyIdleSubtraction(30 * 60_000, discarded, 'discard')).toBe(20 * 60_000)
  })

  it('assign keeps the time (the work DID happen on the task)', () => {
    expect(applyIdleSubtraction(30 * 60_000, discarded, 'assign')).toBe(30 * 60_000)
  })

  it('break keeps the time and never subtracts', () => {
    expect(applyIdleSubtraction(30 * 60_000, breaking, 'break')).toBe(30 * 60_000)
  })
})
