/**
 * Unit tests for client crash telemetry and GlobalErrorBoundary.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearTelemetryCache,
  getTelemetryEndpoint,
  initGlobalErrorHandlers,
  reportError,
  sanitizeString,
  setTelemetryEndpoint,
} from '../src/lib/telemetry'
import { GlobalErrorBoundary } from '../src/components/GlobalErrorBoundary'
import { setRemoteFetch } from '../src/server/net'

describe('sanitizeString', () => {
  it('strips GitHub tokens', () => {
    const input = 'Failed with token: ghp_123456789012345678901234567890123456'
    expect(sanitizeString(input)).toBe('Failed with token: [REDACTED_GH_TOKEN]')

    const pat = 'Error: github_pat_11A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5Y6Z'
    expect(sanitizeString(pat)).toBe('Error: [REDACTED_GH_TOKEN]')
  })

  it('strips Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret'
    expect(sanitizeString(input)).toBe('Authorization: Bearer [REDACTED_TOKEN]')
  })

  it('strips passwords embedded in URLs', () => {
    const input = 'Failed to connect to https://user:super_secret_password@api.github.com/v1'
    expect(sanitizeString(input)).toBe(
      'Failed to connect to https://user:[REDACTED]@api.github.com/v1',
    )
  })

  it('strips key-value credentials', () => {
    expect(sanitizeString('apiKey=AIzaSyD-12345abcde')).toBe('apiKey=[REDACTED]')
    expect(sanitizeString('password: "mySuperSecretPassword"')).toBe('password:[REDACTED]')
    expect(sanitizeString('secret_token = "abc123xyz"')).toContain('[REDACTED]')
  })

  it('normalizes local user home paths', () => {
    const winPath = 'at C:\\Users\\Alice\\Desktop\\learning-hub\\file.ts:12:4'
    expect(sanitizeString(winPath)).toBe(
      'at C:\\Users\\[USER]\\Desktop\\learning-hub\\file.ts:12:4',
    )

    const unixPath = 'at /home/bob/projects/app.js:10:2'
    expect(sanitizeString(unixPath)).toBe('at /home/[USER]/projects/app.js:10:2')

    const macPath = 'at /Users/carol/Library/Caches/file.js:1:1'
    expect(sanitizeString(macPath)).toBe('at /Users/[USER]/Library/Caches/file.js:1:1')
  })
})

describe('reportError', () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []

  beforeEach(() => {
    clearTelemetryCache()
    setTelemetryEndpoint('/api/v1/telemetry/crash')
    fetchCalls.length = 0

    setRemoteFetch((url, init) => {
      fetchCalls.push({ url, init })
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    })
  })

  it('sends sanitized crash report payload via remoteFetch', async () => {
    const err = new Error('Connection failed: apiKey=secretKey123')
    err.name = 'NetworkError'

    const sent = await reportError(err, { component: 'UpdateController', action: 'download' })
    expect(sent).toBe(true)
    expect(fetchCalls).toHaveLength(1)

    const call = fetchCalls[0]
    expect(call.url).toBe('/api/v1/telemetry/crash')
    expect(call.init?.method).toBe('POST')

    const body = JSON.parse(call.init?.body as string)
    expect(body.errorName).toBe('NetworkError')
    expect(body.errorMessage).toBe('Connection failed: apiKey=[REDACTED]')
    expect(body.component).toBe('UpdateController')
    expect(body.platform).toBeDefined()
    expect(body.appVersion).toBeDefined()
    expect(typeof body.timestamp).toBe('number')
  })

  it('enforces 60-second in-memory deduplication', async () => {
    const err = new Error('Database locked')

    // First call: dispatched
    const sent1 = await reportError(err, { component: 'Database' })
    expect(sent1).toBe(true)
    expect(fetchCalls).toHaveLength(1)

    // Immediate second call: deduplicated
    const sent2 = await reportError(err, { component: 'Database' })
    expect(sent2).toBe(false)
    expect(fetchCalls).toHaveLength(1)

    // Different component or message: dispatched
    const sent3 = await reportError(err, { component: 'OtherComponent' })
    expect(sent3).toBe(true)
    expect(fetchCalls).toHaveLength(2)
  })

  it('handles non-Error objects and strings gracefully', async () => {
    const sent1 = await reportError('Raw string error message')
    expect(sent1).toBe(true)

    const sent2 = await reportError({ code: 500, message: 'Server fault' })
    expect(sent2).toBe(true)

    expect(fetchCalls).toHaveLength(2)
  })

  it('handles remoteFetch network failure without throwing', async () => {
    setRemoteFetch(() => Promise.reject(new Error('Network offline')))

    const sent = await reportError(new Error('Test error'))
    expect(sent).toBe(false)
  })

  it('respects configured custom telemetry endpoint', async () => {
    setTelemetryEndpoint('https://worker.custom.com/api/v1/telemetry/crash')
    expect(getTelemetryEndpoint()).toBe('https://worker.custom.com/api/v1/telemetry/crash')

    await reportError(new Error('Custom endpoint test'))
    expect(fetchCalls[0].url).toBe('https://worker.custom.com/api/v1/telemetry/crash')
  })
})

describe('initGlobalErrorHandlers', () => {
  it('registers and unregisters window event listeners cleanly', () => {
    const listeners: Record<string, EventListenerOrEventListenerObject> = {}
    const originalWindow = globalThis.window

    const mockWindow = {
      addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
        listeners[event] = handler
      }),
      removeEventListener: vi.fn((event: string) => {
        delete listeners[event]
      }),
    }

    vi.stubGlobal('window', mockWindow)

    try {
      const cleanup = initGlobalErrorHandlers()
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('error', expect.any(Function))
      expect(mockWindow.addEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function),
      )

      cleanup()
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function),
      )
    } finally {
      if (originalWindow) {
        vi.stubGlobal('window', originalWindow)
      } else {
        vi.unstubAllGlobals()
      }
    }
  })
})

describe('GlobalErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const html = renderToString(
      React.createElement(
        GlobalErrorBoundary,
        null,
        React.createElement('div', { id: 'child' }, 'Normal content'),
      ),
    )
    expect(html).toContain('Normal content')
  })

  it('renders calm fallback UI when state has error', () => {
    const boundary = new GlobalErrorBoundary({ children: null })
    boundary.state = {
      hasError: true,
      error: new Error('Render crash in test widget'),
      errorInfo: null,
    }

    const html = renderToString(boundary.render() as React.ReactElement)
    expect(html).toContain('Something unexpected happened')
    expect(html).toContain('Render crash in test widget')
    expect(html).toContain('Try again')
    expect(html).toContain('Reload application')
  })

  it('calls reportError and onError during componentDidCatch', () => {
    const onError = vi.fn()
    const boundary = new GlobalErrorBoundary({ children: null, onError })

    const testError = new Error('Test crash')
    const errorInfo = { componentStack: '\n    in ProblemWidget\n    in App' }

    boundary.componentDidCatch(testError, errorInfo)
    expect(boundary.state.errorInfo).toBe(errorInfo)
    expect(onError).toHaveBeenCalledWith(testError, errorInfo)
  })

  it('resets error state when reset is called', () => {
    const boundary = new GlobalErrorBoundary({ children: null })
    boundary.state = {
      hasError: true,
      error: new Error('Crash'),
      errorInfo: { componentStack: 'stack' },
    }

    boundary.reset()
    expect(boundary.state.hasError).toBe(false)
    expect(boundary.state.error).toBeNull()
    expect(boundary.state.errorInfo).toBeNull()
  })

  it('supports custom fallback render function', () => {
    const fallbackFn = (err: Error, _reset: () => void) =>
      React.createElement('div', { id: 'custom-fallback' }, `Custom error: ${err.message}`)

    const boundary = new GlobalErrorBoundary({ children: null, fallback: fallbackFn })
    boundary.state = {
      hasError: true,
      error: new Error('Custom crash message'),
      errorInfo: null,
    }

    const html = renderToString(boundary.render() as React.ReactElement)
    expect(html).toContain('Custom error: Custom crash message')
  })
})
