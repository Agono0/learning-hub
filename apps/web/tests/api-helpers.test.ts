/**
 * Unit tests for the shared server API helpers (apps/web/src/lib/api.ts):
 * readJson zod boundary, tzOffset threading, and AI error sanitization.
 * Run from apps/web: `npx vitest run`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { z } from 'zod'
import {
  ApiError,
  aiErrorResponse,
  jsonError,
  readJson,
  tzOffsetFromQuery,
  tzOffsetSchema,
  withRoute,
} from '../src/lib/api'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('readJson', () => {
  const schema = z.object({
    name: z.string().min(1),
    count: z.number().int().optional().default(0),
  })

  it('parses and validates a matching body', async () => {
    const parsed = await readJson(jsonRequest({ name: 'deck' }), schema)
    expect(parsed).toEqual({ name: 'deck', count: 0 })
  })

  it('throws ApiError 400 for malformed JSON instead of an uncaught 500', async () => {
    const err = await readJson(jsonRequest('{not json'), schema).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
    expect((err as ApiError).message).toBe('Request body must be valid JSON')
  })

  it('throws ApiError 400 with flattened issues on schema violations', async () => {
    const err = await readJson(jsonRequest({ name: '' }), schema).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err as ApiError
    expect(apiErr.status).toBe(400)
    expect(apiErr.detail).toEqual([{ path: 'name', message: expect.any(String) }])
  })
})

describe('tzOffsetSchema / tzOffsetFromQuery', () => {
  it('defaults to 0 (UTC bucket) when absent', () => {
    expect(tzOffsetSchema.parse(undefined)).toBe(0)
  })

  it('accepts getTimezoneOffset() semantics (negative east of UTC)', () => {
    expect(tzOffsetSchema.parse(-120)).toBe(-120)
    expect(tzOffsetSchema.parse(300)).toBe(300)
  })

  it('rejects out-of-range and non-integer offsets', () => {
    expect(tzOffsetSchema.safeParse(900).success).toBe(false)
    expect(tzOffsetSchema.safeParse(-1000).success).toBe(false)
    expect(tzOffsetSchema.safeParse(30.5).success).toBe(false)
    expect(tzOffsetSchema.safeParse('120').success).toBe(false)
  })

  it('tzOffsetFromQuery: missing → 0, valid → number, invalid → 0 (never throws a GET)', () => {
    expect(tzOffsetFromQuery(new Request('http://localhost/api/quests'))).toBe(0)
    expect(tzOffsetFromQuery(new Request('http://localhost/api/quests?tzOffset=-120'))).toBe(-120)
    expect(tzOffsetFromQuery(new Request('http://localhost/api/quests?tzOffset=abc'))).toBe(0)
    expect(tzOffsetFromQuery(new Request('http://localhost/api/quests?tzOffset=9999'))).toBe(0)
  })
})

describe('aiErrorResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps the not-configured case to 400 + needsSetup (historical contract)', () => {
    const res = aiErrorResponse(
      new Error('AI is not configured — pick a provider and model in Settings.'),
    )
    expect(res.status).toBe(400)
  })

  it('sanitizes provider errors to a generic 502 without leaking the message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = aiErrorResponse(
      new Error('fetch failed: https://secret-endpoint.example.com/v1 model=gpt-4o 401'),
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; detail: string }
    expect(body.error).toBe('AI request failed')
    expect(JSON.stringify(body)).not.toContain('secret-endpoint')
    expect(JSON.stringify(body)).not.toContain('gpt-4o')
    // the real error goes to the server log
    expect(consoleError).toHaveBeenCalled()
  })
})

describe('withRoute', () => {
  it('passes ApiError status/message/detail through as JSON', async () => {
    const handler = withRoute(async () => {
      throw new ApiError(409, 'deck name already exists')
    })
    const res = await handler(new Request('http://localhost/api/test'), undefined)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('deck name already exists')
  })

  it('sanitizes unknown errors to a 500 without leaking the message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = withRoute(async () => {
      throw new Error('SQLITE_CONSTRAINT: table decks https://…')
    })
    const res = await handler(new Request('http://localhost/api/test'), undefined)
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Internal error')
    expect(JSON.stringify(body)).not.toContain('SQLITE_CONSTRAINT')
  })

  it('jsonError omits the detail key when absent', () => {
    const withDetail = jsonError(400, 'bad', { issues: [] }) as Response
    const without = jsonError(400, 'bad') as Response
    expect(withDetail.status).toBe(400)
    expect(without.status).toBe(400)
  })
})
