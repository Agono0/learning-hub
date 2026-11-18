/**
 * Error taxonomy tests — honest classification, retry policy, hardening.
 */
import { describe, expect, it } from 'vitest'
import {
  RETRY_MAX_ATTEMPTS,
  appError,
  classifyError,
  nextRetryMs,
  parseAppError,
  shouldRetry,
} from '../src/errors'
import * as core from '../src/index'

describe('classifyError', () => {
  it('offline context wins over everything', () => {
    const err = { status: 500, message: 'boom' }
    expect(classifyError(err, { online: false }).code).toBe('offline')
    expect(classifyError(err, { online: false }).canRetry).toBe(true)
  })

  it('maps HTTP statuses to the honest taxonomy', () => {
    expect(classifyError({ status: 404 }).code).toBe('not_found')
    expect(classifyError({ status: 404 }).canRetry).toBe(false)
    expect(classifyError({ status: 401 }).code).toBe('unauthorized')
    expect(classifyError({ status: 403 }).code).toBe('unauthorized')
    expect(classifyError({ status: 400 }).code).toBe('validation')
    expect(classifyError({ status: 422 }).code).toBe('validation')
    expect(classifyError({ status: 422 }).canRetry).toBe(false)
    expect(classifyError({ status: 500 }).code).toBe('server')
    expect(classifyError({ status: 502 }).canRetry).toBe(true)
    expect(classifyError({ status: 408 }).code).toBe('timeout')
  })

  it('classifies network failures as offline even when navigator claims online', () => {
    expect(classifyError({ name: 'TypeError', message: 'Failed to fetch' }).code).toBe('offline')
    expect(classifyError({ name: 'NetworkError' }).code).toBe('offline')
  })

  it('classifies timeouts and storage quota failures', () => {
    expect(classifyError({ name: 'AbortError' }).code).toBe('timeout')
    expect(classifyError({ message: 'Request timed out after 30s' }).code).toBe('timeout')
    expect(classifyError({ name: 'QuotaExceededError' }).code).toBe('storage')
    expect(classifyError({ message: 'quota exceeded while writing' }).code).toBe('storage')
  })

  it('never leaks server detail into the headline; keeps it as detail', () => {
    const e = classifyError({
      status: 500,
      message: 'select * from secrets failed',
      detail: 'SQLITE_BUSY',
    })
    expect(e.title).not.toContain('secrets')
    expect(e.detail).toBe('SQLITE_BUSY')
  })

  it('copy is always present and actionable (no empty strings)', () => {
    for (const code of [
      'offline',
      'server',
      'not_found',
      'validation',
      'unauthorized',
      'timeout',
      'storage',
      'unknown',
    ] as const) {
      const e = appError(code)
      expect(e.title.length).toBeGreaterThan(5)
      expect(e.recovery.length).toBeGreaterThan(10)
    }
  })

  it('survives null/undefined errors (throw sites are not always tidy)', () => {
    expect(classifyError(null).code).toBe('unknown')
    expect(classifyError(undefined).code).toBe('unknown')
    expect(classifyError('a string throw').code).toBe('unknown')
  })
})

describe('retry policy', () => {
  it('retries only what can succeed', () => {
    expect(shouldRetry(appError('server'), 1)).toBe(true)
    expect(shouldRetry(appError('offline'), 1)).toBe(true)
    expect(shouldRetry(appError('timeout'), 1)).toBe(true)
    expect(shouldRetry(appError('validation'), 1)).toBe(false)
    expect(shouldRetry(appError('not_found'), 1)).toBe(false)
    expect(shouldRetry(appError('unauthorized'), 1)).toBe(false)
  })

  it('caps attempts and backs off exponentially with a ceiling', () => {
    expect(RETRY_MAX_ATTEMPTS).toBe(2)
    expect(shouldRetry(appError('server'), 2)).toBe(false)
    expect(nextRetryMs(1)).toBe(800)
    expect(nextRetryMs(2)).toBe(1600)
    expect(nextRetryMs(10)).toBe(15_000)
  })
})

describe('persistence hardening', () => {
  it('parseAppError rejects junk', () => {
    expect(parseAppError(null)).toBeNull()
    expect(parseAppError({ code: 'weird' })).toBeNull()
    expect(
      parseAppError({ code: 'server', title: 't', recovery: 'r', canRetry: true }),
    ).not.toBeNull()
  })
})

describe('public surface parity', () => {
  it('is re-exported from the package root', () => {
    expect(typeof core.classifyError).toBe('function')
    expect(typeof core.shouldRetry).toBe('function')
  })
})
