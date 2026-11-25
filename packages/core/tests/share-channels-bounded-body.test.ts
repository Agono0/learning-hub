import { describe, expect, it } from 'vitest'

import {
  BodyLimitError,
  measureJson,
  readBoundedText,
  utf8ByteLength,
} from '../src/share-channels/bounded-body'

function streamOf(chunks: Uint8Array[], onCancel?: () => void, onPull?: () => void) {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.()
      if (i < chunks.length) controller.enqueue(chunks[i++]!)
      else controller.close()
    },
    cancel() {
      onCancel?.()
    },
  })
}

describe('readBoundedText', () => {
  it('reads a body under the cap', async () => {
    const res = new Response('{"a":1}')
    await expect(readBoundedText(res, 100)).resolves.toBe('{"a":1}')
  })

  it('refuses up front when Content-Length is over the cap', async () => {
    const res = new Response('x', { headers: { 'content-length': '5000' } })
    await expect(readBoundedText(res, 100)).rejects.toMatchObject({ kind: 'too-large' })
  })

  it('does not trust a small Content-Length: the streamed bytes are counted and the stream is cancelled', async () => {
    const chunk = new Uint8Array(64).fill(97)
    let cancelled = false
    let pulls = 0
    const body = streamOf(
      Array.from({ length: 1000 }, () => chunk),
      () => {
        cancelled = true
      },
      () => {
        pulls += 1
      },
    )
    const res = new Response(body, { headers: { 'content-length': '10' } })
    await expect(readBoundedText(res, 200)).rejects.toBeInstanceOf(BodyLimitError)
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThan(10) // stopped near the cap, did not read all 1000 chunks
  })

  it('decodes multi-byte text split across chunks', async () => {
    const bytes = new TextEncoder().encode('héllo €')
    const res = new Response(streamOf([bytes.slice(0, 2), bytes.slice(2)]))
    await expect(readBoundedText(res, 100)).resolves.toBe('héllo €')
  })

  it('reports an unreadable body', async () => {
    const res = new Response(null, { status: 200 })
    await expect(readBoundedText(res, 100)).rejects.toMatchObject({ kind: 'unreadable' })
  })
})

describe('measureJson', () => {
  const limits = { maxBytes: 1000, maxDepth: 5, maxNodes: 50 }

  it('accepts small nested content', () => {
    expect(measureJson({ a: 'x', b: [1, 2, { c: null }] }, limits).ok).toBe(true)
  })

  it('refuses oversize strings', () => {
    expect(measureJson({ a: 'x'.repeat(2000) }, limits)).toMatchObject({
      ok: false,
      reason: 'too-large',
    })
  })

  it('refuses deep nesting without recursing', () => {
    let v: unknown = 'leaf'
    for (let i = 0; i < 100_000; i += 1) v = [v]
    expect(measureJson(v, { ...limits, maxNodes: 1_000_000 })).toMatchObject({
      ok: false,
      reason: 'too-deep',
    })
  })

  it('refuses too many nodes', () => {
    expect(measureJson({ list: Array.from({ length: 100 }, () => 1) }, limits)).toMatchObject({
      ok: false,
      reason: 'too-many-nodes',
    })
  })

  it('terminates on a cyclic structure', () => {
    const a: Record<string, unknown> = {}
    a['self'] = a
    expect(measureJson(a, limits).ok).toBe(false)
  })
})

describe('UTF-8 byte counting', () => {
  it('matches TextEncoder for ASCII, 2, 3 and 4 byte characters and lone surrogates', () => {
    const samples = ['', 'abc', 'é', '€', '😀', 'a😀b€é', '\ud800', 'x\udc00', '\ud83d']
    for (const t of samples) {
      expect(utf8ByteLength(t), JSON.stringify(t)).toBe(new TextEncoder().encode(t).length)
    }
  })

  it('counts bytes, not UTF-16 units, against the size limit', () => {
    const text = '€'.repeat(400) // 400 units, 1200 bytes
    expect(measureJson({ a: text }, { maxBytes: 1000, maxDepth: 5, maxNodes: 50 })).toMatchObject({
      ok: false,
      reason: 'too-large',
    })
    expect(
      measureJson({ a: 'a'.repeat(400) }, { maxBytes: 1000, maxDepth: 5, maxNodes: 50 }).ok,
    ).toBe(true)
  })
})
