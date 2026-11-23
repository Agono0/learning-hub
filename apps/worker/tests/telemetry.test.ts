import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkRateLimit,
  computeCrashFingerprint,
  crashReportSchema,
  handleCrashTelemetry,
  normalizeMessage,
  resetRateLimits,
  sanitizeCrashReport,
  sanitizeText,
  type TelemetryEnv,
} from '../src/telemetry'

describe('Telemetry: Crash Report Schema', () => {
  it('validates a valid crash report', () => {
    const raw = {
      errorName: 'TypeError',
      errorMessage: 'Cannot read properties of undefined (reading "foo")',
      stack: 'TypeError: Cannot read properties...\n  at bar.ts:10:5',
      component: 'StudySession',
      appVersion: '1.2.0',
      platform: 'windows' as const,
      deviceAbi: 'x86_64',
      breadcrumbs: ['opened deck', 'started session'],
      timestamp: '2026-11-23T20:00:00.000Z',
    }

    const parsed = crashReportSchema.safeParse(raw)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.errorName).toBe('TypeError')
      expect(parsed.data.platform).toBe('windows')
    }
  })

  it('rejects an invalid platform', () => {
    const raw = {
      errorName: 'Error',
      errorMessage: 'boom',
      appVersion: '1.0.0',
      platform: 'ios-unsupported',
    }
    const parsed = crashReportSchema.safeParse(raw)
    expect(parsed.success).toBe(false)
  })

  it('rejects empty errorName or appVersion', () => {
    expect(
      crashReportSchema.safeParse({
        errorName: '',
        errorMessage: 'boom',
        appVersion: '1.0.0',
        platform: 'web',
      }).success,
    ).toBe(false)

    expect(
      crashReportSchema.safeParse({
        errorName: 'Error',
        errorMessage: 'boom',
        appVersion: '',
        platform: 'web',
      }).success,
    ).toBe(false)
  })
})

describe('Telemetry: Sanitization Helper', () => {
  it('strips GitHub tokens and Bearer tokens', () => {
    const raw =
      'Failed with ghp_1234567890abcdef1234567890abcdef1234 and Bearer eyJhbGciOiJIUzI1Ni...'
    const clean = sanitizeText(raw)
    expect(clean).not.toContain('ghp_1234567890abcdef1234567890abcdef1234')
    expect(clean).toContain('[REDACTED_GH_TOKEN]')
    expect(clean).not.toContain('eyJhbGciOiJIUzI1Ni')
    expect(clean).toContain('Bearer [REDACTED]')
  })

  it('strips passwords, secrets, and URL auth', () => {
    const raw =
      'Connect to https://admin:superSecret123@db.internal:5432 with password="topSecret456" and api_key=xyzSecret'
    const clean = sanitizeText(raw)
    expect(clean).not.toContain('superSecret123')
    expect(clean).not.toContain('topSecret456')
    expect(clean).not.toContain('xyzSecret')
    expect(clean).toContain('https://admin:[REDACTED]@db.internal:5432')
  })

  it('normalizes Windows and Unix paths', () => {
    const winPath = 'at foo (C:\\Users\\alice\\Desktop\\learning-hub\\apps\\web\\main.ts:25:10)'
    const unixPath = 'at bar (/home/bob/work/learning-hub/packages/core/src/index.ts:15:3)'

    const cleanWin = sanitizeText(winPath)
    const cleanUnix = sanitizeText(unixPath)

    expect(cleanWin).not.toContain('alice')
    expect(cleanWin).toContain('<home>/Desktop/learning-hub/apps/web/main.ts:25:10')

    expect(cleanUnix).not.toContain('bob')
    expect(cleanUnix).toContain('<home>/work/learning-hub/packages/core/src/index.ts:15:3')
  })

  it('deeply sanitizes crash reports', () => {
    const report = {
      errorName: 'AuthError',
      errorMessage: 'Failed for ghp_abc123456789012345678901234567890123',
      stack: 'at C:\\Users\\john\\app.ts:1:1',
      component: 'password=superSecretForm',
      appVersion: '1.0.0',
      platform: 'windows' as const,
      breadcrumbs: [
        'auth header: Bearer secToken12345',
        { message: 'token: ghp_token12345678901234567890' },
      ],
      timestamp: '2026-11-23T20:00:00.000Z',
    }

    const sanitized = sanitizeCrashReport(report)
    expect(sanitized.errorMessage).toContain('[REDACTED_GH_TOKEN]')
    expect(sanitized.stack).toContain('<home>/app.ts:1:1')
    expect(sanitized.component).toContain('[REDACTED]')
    expect(sanitized.breadcrumbs[0]).toContain('Bearer [REDACTED]')
    expect(JSON.stringify(sanitized.breadcrumbs[1])).toContain('[REDACTED_GH_TOKEN]')
  })
})

describe('Telemetry: Deterministic Crash Fingerprint', () => {
  it('normalizes variable dynamic elements (UUIDs, numbers, IDs)', () => {
    const msg1 =
      'Error processing usr_99887766 on item_112233 at line 42 with id 12345678-1234-1234-1234-123456789abc'
    const msg2 =
      'Error processing usr_00112233 on item_998877 at line 99 with id 87654321-4321-4321-4321-cba987654321'

    const norm1 = normalizeMessage(msg1)
    const norm2 = normalizeMessage(msg2)

    expect(norm1).toBe(norm2)
    expect(norm1).toBe('error processing <id> on <id> at line <num> with id <uuid>')
  })

  it('produces identical SHA-256 fingerprint for equivalent crashes', async () => {
    const fp1 = await computeCrashFingerprint('TypeError', 'Cannot access usr_abc123 at line 100')
    const fp2 = await computeCrashFingerprint('TypeError', 'Cannot access usr_xyz789 at line 200')

    expect(fp1).toBe(fp2)
    expect(fp1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces distinct fingerprints for distinct errors', async () => {
    const fp1 = await computeCrashFingerprint('TypeError', 'Cannot read property')
    const fp2 = await computeCrashFingerprint('RangeError', 'Maximum call stack size exceeded')

    expect(fp1).not.toBe(fp2)
  })
})

describe('Telemetry: Rate Limiting', () => {
  beforeEach(() => {
    resetRateLimits()
  })

  it('allows 10 requests per minute and blocks the 11th', () => {
    const ip = '192.168.1.100'

    for (let i = 1; i <= 10; i++) {
      const res = checkRateLimit(ip, 10, 60_000)
      expect(res.allowed).toBe(true)
      expect(res.remaining).toBe(10 - i)
    }

    const blocked = checkRateLimit(ip, 10, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.resetInMs).toBeGreaterThan(0)
  })
})

describe('Telemetry: handleCrashTelemetry', () => {
  beforeEach(() => {
    resetRateLimits()
    vi.restoreAllMocks()
  })

  it('returns 429 when rate limit is exceeded', async () => {
    const env: TelemetryEnv = { GITHUB_ISSUE_TOKEN: 'fake-token' }

    // Exhaust 10 tokens
    for (let i = 0; i < 10; i++) {
      checkRateLimit('10.0.0.1', 10, 60_000)
    }

    const req = new Request('http://worker.local/api/v1/telemetry/crash', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '10.0.0.1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        errorName: 'TypeError',
        appVersion: '1.0.0',
        platform: 'web',
      }),
    })

    const res = await handleCrashTelemetry(req, env)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })

  it('returns 400 on invalid payload', async () => {
    const env: TelemetryEnv = { GITHUB_ISSUE_TOKEN: 'fake-token' }
    const req = new Request('http://worker.local/api/v1/telemetry/crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bad: 'data' }),
    })

    const res = await handleCrashTelemetry(req, env)
    expect(res.status).toBe(400)
  })

  it('returns 503 when GITHUB_ISSUE_TOKEN is missing', async () => {
    const env: TelemetryEnv = {}
    const req = new Request('http://worker.local/api/v1/telemetry/crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorName: 'TypeError',
        errorMessage: 'test crash',
        appVersion: '1.0.0',
        platform: 'android',
      }),
    })

    const res = await handleCrashTelemetry(req, env)
    expect(res.status).toBe(503)
    const data = (await res.json()) as { ok: boolean; error: string; fingerprint: string }
    expect(data.ok).toBe(false)
    expect(data.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('creates a new GitHub issue when no matching issue exists', async () => {
    const env: TelemetryEnv = {
      GITHUB_ISSUE_TOKEN: 'mock-gh-token',
      GITHUB_REPO: 'Agono0/learning-hub',
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.includes('/issues?labels=crash-report') && init?.method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      if (urlStr.endsWith('/issues') && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body))
        return new Response(
          JSON.stringify({
            number: 142,
            title: body.title,
            html_url: 'https://github.com/Agono0/learning-hub/issues/142',
          }),
          { status: 201 },
        )
      }
      return new Response('Not Found', { status: 404 })
    })

    const req = new Request('http://worker.local/api/v1/telemetry/crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorName: 'ReferenceError',
        errorMessage: 'foo is not defined',
        stack: 'at Object.eval (eval at <anonymous>)',
        appVersion: '2.0.0',
        platform: 'web',
      }),
    })

    const res = await handleCrashTelemetry(req, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; action: string; issueNumber: number }
    expect(json.ok).toBe(true)
    expect(json.action).toBe('created')
    expect(json.issueNumber).toBe(142)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('comments on existing issue when fingerprint matches', async () => {
    const env: TelemetryEnv = {
      GITHUB_ISSUE_TOKEN: 'mock-gh-token',
      GITHUB_REPO: 'Agono0/learning-hub',
    }

    const fingerprint = await computeCrashFingerprint('NullPointer', 'element is null')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.includes('/issues?labels=crash-report') && init?.method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              number: 88,
              title: '[Crash] NullPointer: element is null',
              body: `## Automated Crash Report\n<!-- fingerprint: ${fingerprint} -->`,
              html_url: 'https://github.com/Agono0/learning-hub/issues/88',
            },
          ]),
          { status: 200 },
        )
      }
      if (urlStr.includes('/issues/88/comments') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            html_url: 'https://github.com/Agono0/learning-hub/issues/88#issuecomment-12345',
          }),
          { status: 201 },
        )
      }
      return new Response('Not Found', { status: 404 })
    })

    const req = new Request('http://worker.local/api/v1/telemetry/crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorName: 'NullPointer',
        errorMessage: 'element is null',
        appVersion: '2.0.1',
        platform: 'windows',
      }),
    })

    const res = await handleCrashTelemetry(req, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; action: string; issueNumber: number }
    expect(json.ok).toBe(true)
    expect(json.action).toBe('commented')
    expect(json.issueNumber).toBe(88)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
