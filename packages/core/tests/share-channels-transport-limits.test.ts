import { describe, expect, it } from 'vitest'

import { ChannelManifestSchema, createChannel, type ChannelManifest } from '../src/share-channels'
import { HttpChannelTransport, type FetchLike } from '../src/share-channels/transport'

function manifest(): ChannelManifest {
  return createChannel({
    channelId: 'ch-1',
    type: 'deck',
    title: 'T',
    authorHandle: 'a',
    visibility: 'link',
    items: [{ id: 'i1', content: { front: 'f', back: 'b' } }],
    now: '2026-01-01T00:00:00Z',
  })
}
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init })
const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } })

function make(fetchFn: FetchLike, extra: Record<string, unknown> = {}) {
  return new HttpChannelTransport({
    baseUrl: 'https://host.example',
    fetchFn,
    sleepFn: async () => {},
    ...extra,
  })
}

describe('HttpChannelTransport destination policy', () => {
  it('refuses a refused host before any fetch, never retries, and does not throw in the constructor', async () => {
    let calls = 0
    const t = new HttpChannelTransport({
      baseUrl: 'https://169.254.169.254/latest',
      fetchFn: async () => {
        calls += 1
        return json(manifest())
      },
      sleepFn: async () => {},
    })
    await expect(t.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'host-refused' })
    expect(calls).toBe(0)
  })

  it('enforces the policy on publish too', async () => {
    let calls = 0
    const t = new HttpChannelTransport({
      baseUrl: 'http://10.0.0.5',
      fetchFn: async () => {
        calls += 1
        return json({})
      },
    })
    await expect(t.publishManifest(manifest())).rejects.toMatchObject({ code: 'host-refused' })
    expect(calls).toBe(0)
  })

  it('refuses loopback and plain http by default, allows only loopback with the explicit flag', async () => {
    const seen: string[] = []
    const fetchFn: FetchLike = async (input) => {
      seen.push(String(input))
      return json(manifest())
    }
    const off = new HttpChannelTransport({ baseUrl: 'http://127.0.0.1:4173', fetchFn })
    await expect(off.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'host-refused' })
    const dev = new HttpChannelTransport({
      baseUrl: 'http://127.0.0.1:4173',
      fetchFn,
      allowHttpLoopback: true,
    })
    await expect(dev.fetchManifest('ch-1')).resolves.toMatchObject({ channelId: 'ch-1' })
    expect(seen).toEqual(['http://127.0.0.1:4173/share/channels/ch-1/manifest'])
    const lan = new HttpChannelTransport({
      baseUrl: 'http://192.168.1.20:4173',
      fetchFn,
      allowHttpLoopback: true,
    })
    await expect(lan.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'host-refused' })
    expect(seen).toHaveLength(1)
  })

  it('asks fetch not to follow redirects itself', async () => {
    let redirectMode: RequestRedirect | undefined
    const t = make(async (_i, init) => {
      redirectMode = init?.redirect
      return json(manifest())
    })
    await t.fetchManifest('ch-1')
    expect(redirectMode).toBe('manual')
  })

  it('follows a same-origin redirect and re-validates it', async () => {
    const seen: string[] = []
    const t = make(async (input) => {
      seen.push(String(input))
      return seen.length === 1 ? redirect('/share/channels/ch-1/manifest?v=2') : json(manifest())
    })
    await expect(t.fetchManifest('ch-1')).resolves.toMatchObject({ channelId: 'ch-1' })
    expect(seen).toEqual([
      'https://host.example/share/channels/ch-1/manifest',
      'https://host.example/share/channels/ch-1/manifest?v=2',
    ])
  })

  it('refuses cross-origin redirects, to a private address or otherwise, without a second request and without the invite header', async () => {
    for (const target of [
      'http://169.254.169.254/latest',
      'https://other.example/x',
      'http://host.example/x', // https to http downgrade
      'https://host.example:8443/x', // different port, different origin
    ]) {
      const headersSeen: unknown[] = []
      const t = make(async (_i, init) => {
        headersSeen.push(init?.headers)
        return redirect(target)
      })
      await expect(t.fetchManifest('ch-1', { inviteToken: 'SECRET-TOKEN' })).rejects.toMatchObject({
        code: 'host-refused',
      })
      expect(headersSeen).toHaveLength(1)
    }
  })

  it('refuses more than three redirect hops', async () => {
    let calls = 0
    const t = make(async () => {
      calls += 1
      return redirect(`/share/channels/ch-1/manifest?hop=${calls}`)
    })
    await expect(t.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'host-refused' })
    expect(calls).toBe(4) // first request plus three followed hops
  })

  it('refuses opaque redirects, redirects without a location, and redirects on PUT', async () => {
    const opaque = make(async () => {
      const r = new Response(null, { status: 200 })
      Object.defineProperty(r, 'type', { value: 'opaqueredirect' })
      return r
    })
    await expect(opaque.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'host-refused' })
    const noLoc = make(async () => new Response(null, { status: 302 }))
    await expect(noLoc.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'host-refused' })
    let puts = 0
    const put = make(async () => {
      puts += 1
      return redirect('/elsewhere', 307)
    })
    await expect(put.publishManifest(manifest())).rejects.toMatchObject({ code: 'host-refused' })
    expect(puts).toBe(1)
  })

  it('treats 304 as not modified, not as a redirect', async () => {
    const t = make(async () => new Response(null, { status: 304 }))
    await expect(t.fetchManifest('ch-1', { ifNoneMatch: 'abcd' })).resolves.toBeNull()
  })

  it('does not echo credentials from the base URL in the error', async () => {
    const t = new HttpChannelTransport({
      baseUrl: 'https://user:hunter2@host.example',
      fetchFn: async () => json({}),
    })
    const err = await t.fetchManifest('ch-1').catch((e: Error) => e)
    expect(String((err as Error).message)).not.toContain('hunter2')
  })
})

describe('HttpChannelTransport body limits', () => {
  it('refuses an oversize body with too-large, once, no retry', async () => {
    let calls = 0
    const t = make(
      async () => {
        calls += 1
        return json({ pad: 'x'.repeat(5000) })
      },
      { maxBodyBytes: 1000 },
    )
    await expect(t.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'too-large' })
    expect(calls).toBe(1)
  })

  it('refuses a declared oversize Content-Length and cancels the body unread', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    const t = make(
      async () => new Response(body, { status: 200, headers: { 'content-length': '999999' } }),
      { maxBodyBytes: 1000 },
    )
    await expect(t.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'too-large' })
    expect(cancelled).toBe(true) // stream cancelled, never read
  })

  it('applies the timeout to the body read, so a dripping host is cut off', async () => {
    const t = make(
      async (_i, init) => {
        const signal = init?.signal
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            signal?.addEventListener('abort', () => controller.error(new Error('aborted')))
          },
        })
        return new Response(body, { status: 200 })
      },
      { timeoutMs: 30, maxAttempts: 1 },
    )
    await expect(t.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'timeout' })
  })

  it('reports invalid JSON as invalid-manifest', async () => {
    const t = make(async () => new Response('not json', { status: 200 }), { maxAttempts: 1 })
    await expect(t.fetchManifest('ch-1')).rejects.toMatchObject({ code: 'invalid-manifest' })
  })

  it('still retries transient 5xx and network errors (existing behavior)', async () => {
    let calls = 0
    const t = make(async () => {
      calls += 1
      if (calls === 1) throw new Error('socket hang up')
      if (calls === 2) return new Response('{}', { status: 503 })
      return json(manifest())
    })
    await expect(t.fetchManifest('ch-1')).resolves.toMatchObject({ channelId: 'ch-1' })
    expect(calls).toBe(3)
  })
})

describe('ChannelManifestSchema structural caps', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = () => JSON.parse(JSON.stringify(manifest())) as Record<string, any>

  it('accepts a normal manifest and a large-but-legal course lesson body', () => {
    expect(ChannelManifestSchema.safeParse(base()).success).toBe(true)
    const m = base()
    m['versions'][0].items[0].content = { title: 'L', body: 'x'.repeat(620_000) }
    expect(ChannelManifestSchema.safeParse(m).success).toBe(true)
  })

  it('refuses too many items in a version', () => {
    const m = base()
    m['versions'][0].items = Array.from({ length: 10_001 }, (_, i) => ({
      id: `i${i}`,
      content: {},
      revision: 1,
    }))
    expect(ChannelManifestSchema.safeParse(m).success).toBe(false)
  })

  it('refuses too many versions', () => {
    const m = base()
    m['versions'] = Array.from({ length: 201 }, (_, i) => ({ ...m['versions'][0], version: i + 1 }))
    expect(ChannelManifestSchema.safeParse(m).success).toBe(false)
  })

  it('refuses oversize, over-deep and over-wide item content and long ids', () => {
    const big = base()
    big['versions'][0].items[0].content = { body: 'x'.repeat(1_100_000) }
    expect(ChannelManifestSchema.safeParse(big).success).toBe(false)

    const deep = base()
    let v: unknown = 'leaf'
    for (let i = 0; i < 200; i += 1) v = { n: v }
    deep['versions'][0].items[0].content = { v }
    expect(ChannelManifestSchema.safeParse(deep).success).toBe(false)

    const wide = base()
    wide['versions'][0].items[0].content = { list: Array.from({ length: 100_001 }, () => 1) }
    expect(ChannelManifestSchema.safeParse(wide).success).toBe(false)

    const longId = base()
    longId['channelId'] = 'c'.repeat(201)
    expect(ChannelManifestSchema.safeParse(longId).success).toBe(false)
    const longItem = base()
    longItem['versions'][0].items[0].id = 'i'.repeat(201)
    expect(ChannelManifestSchema.safeParse(longItem).success).toBe(false)
  })

  it('counts multi-byte content by UTF-8 bytes', () => {
    const m = base()
    m['versions'][0].items[0].content = { body: '€'.repeat(400_000) } // 1.2 MB in UTF-8, 400k units
    expect(ChannelManifestSchema.safeParse(m).success).toBe(false)
  })

  it('caps the cumulative content of a manifest, not only each item', () => {
    const m = base()
    const item = (i: number) => ({
      id: `i${i}`,
      content: { body: 'x'.repeat(900_000) },
      revision: 1,
    })
    m['versions'][0].items = Array.from({ length: 19 }, (_, i) => item(i)) // 17.1 MB, each item under 1 MiB
    expect(ChannelManifestSchema.safeParse(m).success).toBe(false)
    m['versions'][0].items = Array.from({ length: 10 }, (_, i) => item(i)) // 9 MB
    expect(ChannelManifestSchema.safeParse(m).success).toBe(true)
  })

  it('rejects very deep content quickly, parsed from real JSON, without a stack error', () => {
    const depth = 50_000
    const deep = '{"n":'.repeat(depth) + '1' + '}'.repeat(depth)
    const m = base()
    const text = JSON.stringify(m).replace('"back":"b"', `"back":${deep}`)
    const start = Date.now()
    const parsed = JSON.parse(text)
    const result = ChannelManifestSchema.safeParse(parsed)
    expect(result.success).toBe(false)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
