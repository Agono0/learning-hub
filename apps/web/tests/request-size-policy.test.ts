/**
 * Request-size policy for the web API: every JSON body goes through readJson, which refuses
 * anything over DEFAULT_JSON_BODY_BYTES with a 413 before parsing it. Routes that legitimately take
 * more must say so with an explicit `maxBytes`, and this test pins that list so a new exception is
 * a visible, reviewed change. No wall-clock or memory assertions: only byte counts.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { z } from 'zod'
import { ApiError, DEFAULT_JSON_BODY_BYTES, readJson } from '@/lib/api'

const HANDLERS = join(__dirname, '..', 'src', 'server', 'handlers')

/** Routes allowed to read a body larger than the default, with the reason. */
const MAX_BYTES_EXCEPTIONS = [
  'import/route.ts', // Anki .apkg arrives as base64, capped at 50 MiB of payload
  'curriculum/import/route.ts', // LHCF source up to 5M characters
  'share/import/route.ts', // a shared deck pasted as text
  'review/attempt-image/route.ts', // handwriting canvas as a base64 data URL, schema max 8M chars
  'ingest/multimodal/route.ts', // transcript or paper up to 500k characters, any script
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const schema = z.object({ v: z.string() })
const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method: 'POST', body, headers })

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p
    return 200
  } catch (e) {
    if (e instanceof ApiError) return e.status
    throw e
  }
}

/** A stream that yields `chunks` chunks of `size` bytes and records how many were pulled. */
function counted(chunks: number, size: number) {
  const state = { pulled: 0 }
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= chunks) return controller.close()
      state.pulled++
      controller.enqueue(new Uint8Array(size).fill(0x20))
    },
  })
  return { state, stream }
}

describe('readJson body cap', () => {
  it('accepts a body at the limit and refuses one byte over with 413', async () => {
    const pad = (n: number) => JSON.stringify({ v: 'a'.repeat(n) })
    const overhead = pad(0).length
    const atLimit = pad(DEFAULT_JSON_BODY_BYTES - overhead)
    expect(atLimit.length).toBe(DEFAULT_JSON_BODY_BYTES)
    expect(await status(readJson(post(atLimit), schema))).toBe(200)
    expect(await status(readJson(post(atLimit + ' '), schema))).toBe(413)
  })

  it('refuses on the declared Content-Length without reading the body', async () => {
    const { state, stream } = counted(4, 1024)
    const req = new Request('http://localhost/x', {
      method: 'POST',
      body: stream,
      headers: { 'content-length': String(DEFAULT_JSON_BODY_BYTES + 1) },
      // @ts-expect-error duplex is required by Node for stream bodies
      duplex: 'half',
    })
    expect(await status(readJson(req, schema))).toBe(413)
    // The runtime primes one chunk when the Request is built; our reader must not pull more.
    expect(state.pulled).toBeLessThanOrEqual(1)
  })

  it('stops reading a chunked body once it passes the limit', async () => {
    const chunk = 64 * 1024
    const total = 1000 // 64 MiB offered
    const { state, stream } = counted(total, chunk)
    const req = new Request('http://localhost/x', {
      method: 'POST',
      body: stream,
      // @ts-expect-error duplex is required by Node for stream bodies
      duplex: 'half',
    })
    expect(await status(readJson(req, schema))).toBe(413)
    // Cap is 16 chunks; the reader may have buffered a few more, never anywhere near all 1000.
    expect(state.pulled).toBeGreaterThanOrEqual(DEFAULT_JSON_BODY_BYTES / chunk)
    expect(state.pulled).toBeLessThan(DEFAULT_JSON_BODY_BYTES / chunk + 8)
  })

  it('honors an explicit maxBytes in both directions', async () => {
    const body = JSON.stringify({ v: 'a'.repeat(2000) })
    expect(await status(readJson(post(body), schema, { maxBytes: 4096 }))).toBe(200)
    expect(await status(readJson(post(body), schema, { maxBytes: 1000 }))).toBe(413)
  })

  it('keeps the 400 contract for empty, malformed and invalid bodies', async () => {
    expect(await status(readJson(post(''), schema))).toBe(400)
    expect(await status(readJson(post('{nope'), schema))).toBe(400)
    expect(await status(readJson(post('{"v":1}'), schema))).toBe(400)
    const bodyless = new Request('http://localhost/x', { method: 'POST' })
    expect(await status(readJson(bodyless, schema))).toBe(400)
  })

  it('counts bytes, not characters (multi-byte text)', async () => {
    const body = JSON.stringify({ v: '€'.repeat(400) }) // 1200 bytes, 400 chars
    expect(await status(readJson(post(body), schema, { maxBytes: 1000 }))).toBe(413)
  })
})

describe('request-size policy is structural', () => {
  it('no route handler reads a body outside readJson (it would bypass the cap)', () => {
    const offenders = walk(HANDLERS)
      .filter((f) => /\b(req|request)\.(json|text|arrayBuffer)\(\)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(HANDLERS, f).split('\\').join('/'))
    expect(offenders).toEqual([])
  })

  it('the routes that raise maxBytes are exactly the reviewed exceptions', () => {
    const found = walk(HANDLERS)
      .filter((f) => /readJson\([^)]*maxBytes/s.test(readFileSync(f, 'utf8')))
      .map((f) => relative(HANDLERS, f).split('\\').join('/'))
      .sort()
    expect(found).toEqual([...MAX_BYTES_EXCEPTIONS].sort())
  })

  it('each exception names its limit as a documented constant', () => {
    for (const rel of MAX_BYTES_EXCEPTIONS) {
      const text = readFileSync(join(HANDLERS, rel), 'utf8')
      expect(text, rel).toMatch(/maxBytes: MAX_[A-Z_]*BODY_BYTES/)
      const m = /const MAX_[A-Z_]*BODY_BYTES = ([^\n]+)/.exec(text)
      expect(m, rel).not.toBeNull()
    }
  })
})
