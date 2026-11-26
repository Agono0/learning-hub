/**
 * Inbound body limit for POST /api/backup. The limit counts the bytes that actually arrive, so
 * a missing or false Content-Length does not bypass it. Synthetic bodies only: small limits for
 * most cases, one real-limit case that streams generated chunks and is cancelled at the cap.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-backup-limit-')), 'backup.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  route: typeof import('../src/server/handlers/backup/route')
  bounded: typeof import('../src/server/handlers/backup/bounded-json')
  db: typeof import('@learning-hub/db')
}
let M: Modules

beforeAll(async () => {
  M = {
    route: await import('../src/server/handlers/backup/route'),
    bounded: await import('../src/server/handlers/backup/bounded-json'),
    db: await import('@learning-hub/db'),
  }
})

const enc = new TextEncoder()

interface Probe {
  pulls: number
  cancelled: boolean
}

/** A body that yields the given chunks on demand and records pulls and cancellation. */
function streamOf(chunks: Uint8Array[], probe: Probe = { pulls: 0, cancelled: false }) {
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) return controller.close()
      probe.pulls += 1
      controller.enqueue(chunks[i++]!)
    },
    cancel() {
      probe.cancelled = true
    },
  })
  return { body, probe }
}

function request(body: BodyInit | null, headers: Record<string, string> = {}, url = 'http://x/') {
  return new Request(url, {
    method: 'POST',
    body,
    headers,
    // @ts-expect-error Node's fetch needs duplex for stream bodies
    duplex: 'half',
  })
}

function split(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size))
  return out
}

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p
    return 200
  } catch (err) {
    return (err as { status?: number }).status ?? -1
  }
}

describe('readBoundedJson', () => {
  const doc = JSON.stringify({ a: 'x'.repeat(30) })
  const bytes = enc.encode(doc)

  it('accepts a body of exactly the cap and refuses one byte more', async () => {
    const ok = streamOf(split(bytes, 7))
    expect(await M.bounded.readBoundedJson(request(ok.body), bytes.length)).toEqual({
      a: 'x'.repeat(30),
    })
    const over = streamOf(split(bytes, 7))
    expect(await status(M.bounded.readBoundedJson(request(over.body), bytes.length - 1))).toBe(413)
    expect(over.probe.cancelled).toBe(true)
  })

  it('stops reading at the first chunk that crosses the cap', async () => {
    const { body, probe } = streamOf(split(enc.encode('1'.repeat(1000)), 10))
    expect(await status(M.bounded.readBoundedJson(request(body), 25))).toBe(413)
    expect(probe.pulls).toBeLessThanOrEqual(3)
    expect(probe.cancelled).toBe(true)
  })

  it('does not trust a missing or a false Content-Length', async () => {
    const none = streamOf(split(bytes, 5))
    expect(none.body).toBeDefined()
    const noHeader = request(none.body)
    expect(noHeader.headers.get('content-length')).toBeNull()
    expect(await status(M.bounded.readBoundedJson(noHeader, 10))).toBe(413)

    const lie = streamOf(split(bytes, 5))
    const falseHeader = request(lie.body, { 'content-length': '1' })
    expect(await status(M.bounded.readBoundedJson(falseHeader, 10))).toBe(413)
    expect(lie.probe.cancelled).toBe(true)
  })

  it('counts bytes, not characters, and decodes characters split across chunks', async () => {
    const text = JSON.stringify('\u20ac'.repeat(4)) // 6 characters, 14 bytes
    const b = enc.encode(text)
    expect(text.length).toBe(6)
    expect(b.length).toBe(14)
    expect(await M.bounded.readBoundedJson(request(streamOf(split(b, 4)).body), 14)).toBe(
      '\u20ac'.repeat(4),
    )
    expect(await status(M.bounded.readBoundedJson(request(streamOf(split(b, 4)).body), 13))).toBe(
      413,
    )
    // 4-byte characters (surrogate pairs in JS) too: 2 characters, 8 bytes + 2 quotes.
    const astral = enc.encode(JSON.stringify('\u{1F600}\u{1F600}'))
    expect(astral.length).toBe(10)
    expect(await M.bounded.readBoundedJson(request(streamOf(split(astral, 3)).body), 10)).toBe(
      '\u{1F600}\u{1F600}',
    )
    expect(
      await status(M.bounded.readBoundedJson(request(streamOf(split(astral, 3)).body), 9)),
    ).toBe(413)
  })

  it('answers 400 for malformed, empty and bodyless requests', async () => {
    expect(await status(M.bounded.readBoundedJson(request('{not json'), 100))).toBe(400)
    expect(await status(M.bounded.readBoundedJson(request(''), 100))).toBe(400)
    expect(await status(M.bounded.readBoundedJson(request(null), 100))).toBe(400)
    // a truncated multibyte tail is not a valid document either
    const cut = enc.encode('"\u20ac"').slice(0, 3)
    expect(await status(M.bounded.readBoundedJson(request(streamOf([cut]).body), 100))).toBe(400)
  })

  it('answers 400 when the stream fails part way', async () => {
    let n = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (n++ === 0) controller.enqueue(enc.encode('{"a":'))
        else controller.error(new Error('socket reset'))
      },
    })
    expect(await status(M.bounded.readBoundedJson(request(body), 100))).toBe(400)
  })
})

describe('POST /api/backup body limit', () => {
  const deckCount = () => M.db.db.select().from(M.db.decks).all().length

  async function currentBackupText(): Promise<string> {
    return await (await M.route.GET(new Request('http://x/api/backup'))).text()
  }

  it('refuses an over-cap body in both modes before anything is restored or merged', async () => {
    M.db.db.insert(M.db.decks).values({ name: 'Keep Me' }).run()
    const text = await currentBackupText()
    const size = enc.encode(text).length
    const post = M.route.createBackupPost(size - 1)
    const before = deckCount()
    for (const mode of ['replace', 'merge']) {
      const { body, probe } = streamOf(split(enc.encode(text), 4096))
      const res = await post(request(body, {}, `http://x/api/backup?mode=${mode}`), {} as never)
      expect(res.status, mode).toBe(413)
      // the last chunk crosses the cap and the source may already be closed, so no cancel check
      expect(probe.pulls, mode).toBeGreaterThan(0)
      expect(deckCount(), mode).toBe(before)
    }
  })

  it('accepts a body of exactly the cap, with and without a Content-Length header', async () => {
    const text = await currentBackupText()
    const size = enc.encode(text).length
    const post = M.route.createBackupPost(size)
    const streamed = await post(
      request(streamOf(split(enc.encode(text), 4096)).body, {}, 'http://x/api/backup?mode=merge'),
      {} as never,
    )
    expect(streamed.status).toBe(200)
    const sized = await post(
      request(text, { 'content-length': String(size) }, 'http://x/api/backup?mode=replace'),
      {} as never,
    )
    expect(sized.status).toBe(200)
  })

  it('keeps the header refusal and the malformed-JSON status', async () => {
    const post = M.route.createBackupPost(100)
    const big = await post(request('{}', { 'content-length': '101' }), {} as never)
    expect(big.status).toBe(413)
    const bad = await post(request('{nope'), {} as never)
    expect(bad.status).toBe(400)
  })

  it('enforces the real 64 MiB limit on a chunked body without Content-Length', async () => {
    const chunk = new Uint8Array(1024 * 1024) // one reused 1 MiB buffer, produced on demand
    const probe: Probe = { pulls: 0, cancelled: false }
    const total = 80
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= total) return controller.close()
        sent += 1
        probe.pulls += 1
        controller.enqueue(chunk.slice())
      },
      cancel() {
        probe.cancelled = true
      },
    })
    const before = deckCount()
    const req = request(body, {}, 'http://x/api/backup?mode=replace')
    expect(req.headers.get('content-length')).toBeNull()
    const res = await M.route.POST(req, {} as never)
    expect(res.status).toBe(413)
    expect(probe.cancelled).toBe(true)
    expect(probe.pulls).toBeLessThanOrEqual(65 + 1) // 64 MiB cap: stops at the 65th chunk
    expect(deckCount()).toBe(before)
  })
})
