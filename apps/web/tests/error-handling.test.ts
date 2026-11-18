/**
 * Error-handling web integration — the boundary/retry wiring contract
 * (node environment: pure parts only).
 */
import { describe, expect, it } from 'vitest'
import {
  classifyError,
  shouldRetry,
  appError,
  RETRY_BASE_MS,
  RETRY_CAP_MS,
} from '@learning-hub/core/errors'
import { classifyRequestError } from '../src/lib/use-api-error'

describe('classifyRequestError — apiGetRetry contract', () => {
  it('reads the classified fields the retry wrapper attaches', () => {
    const err = Object.assign(new Error('The server hit a problem'), {
      code: 'server',
      recovery: 'Wait a moment and try again.',
      canRetry: true,
      detail: 'boom',
    })
    const classified = classifyRequestError(err)
    expect(classified.code).toBe('server')
    expect(classified.recovery).toBe('Wait a moment and try again.')
    expect(classified.canRetry).toBe(true)
  })

  it('falls back to fresh classification for raw errors', () => {
    expect(classifyRequestError({ status: 404 }).code).toBe('not_found')
    expect(classifyRequestError(new TypeError('Failed to fetch')).code).toBe('offline')
  })
})

describe('boundary wiring contract', () => {
  it('only retry-capable failures offer Try again (validation is final)', async () => {
    // The boundary renders the retry button only when `error.canRetry` —
    // pin the policy that decides it.
    expect(appError('validation').canRetry).toBe(false)
    expect(appError('server').canRetry).toBe(true)
  })

  it('backoff stays within sane bounds for the UI wait', () => {
    expect(RETRY_BASE_MS).toBeGreaterThanOrEqual(500) // not instant — avoids thundering herd
    expect(RETRY_CAP_MS).toBeLessThanOrEqual(15_000) // never makes the user wait longer
    expect(shouldRetry(appError('server'), 3)).toBe(false)
  })

  it('the dashboard passes classified copy straight into the Callout', () => {
    // The page renders `err.title` + `err.recovery` verbatim — pin that they
    // are non-empty for every code the dashboard can hit.
    for (const code of ['offline', 'server', 'timeout', 'unknown'] as const) {
      const e = classifyError(
        { status: code === 'server' ? 500 : undefined, message: 'x' },
        { online: code !== 'offline' },
      )
      expect(e.title.length).toBeGreaterThan(5)
      expect(e.recovery.length).toBeGreaterThan(10)
    }
  })
})
