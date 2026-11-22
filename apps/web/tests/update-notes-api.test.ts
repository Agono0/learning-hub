/**
 * Unit tests for the update changelog flow (O1-26): the /api/update/notes
 * handler (pointer proxy with O1-28 validation) and the `fetchChannelNotes`
 * lib wrapper. GitHub is stubbed at `global.fetch` — no network in tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseUpdatePointer } from '@learning-hub/core/update'

const POINTER = {
  channel: 'nightly',
  version: '20261122-abc1234',
  manifestUrl: 'https://releases.example.com/manifest.json',
  publishedAt: '2026-11-22T03:14:15.926Z',
  notes: 'Focus timer: fixed drift on long sessions.',
}

async function importHandler() {
  return import('../src/server/handlers/update/notes/route')
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeRequest(query = 'channel=nightly'): Request {
  return new Request(`http://localhost/api/update/notes?${query}`)
}

describe('GET /api/update/notes (O1-26)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('returns the pointer notes after core-side validation', async () => {
    const fetchMock = vi.fn((_input: unknown) => Promise.resolve(jsonRes(POINTER)))
    vi.stubGlobal('fetch', fetchMock)
    const { GET } = await importHandler()
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.notes).toBe(POINTER.notes)
    expect(body.version).toBe(POINTER.version)
    expect(body.channel).toBe('nightly')
    // The proxy fetched the canonical channel-pointers URL for the channel.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('channel-pointers/nightly.json')
  })

  it('strips unknown pointer fields via parseUpdatePointer (O1-28 contract)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonRes({ ...POINTER, rolloutPercent: 25, futureField: 'x' })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { GET } = await importHandler()
    const body = (await (await GET(makeRequest())).json()) as Record<string, unknown>
    expect(body.notes).toBe(POINTER.notes)
    expect('rolloutPercent' in body).toBe(false)
  })

  it('answers notes:null + reason when the pointer is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))),
    )
    const { GET } = await importHandler()
    const body = (await (await GET(makeRequest('channel=beta'))).json()) as Record<string, unknown>
    expect(body.notes).toBeNull()
    expect(body.reason).toBe('pointer-unavailable')
    expect(body.channel).toBe('beta')
  })

  it('answers notes:null + pointer-invalid for a malformed document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonRes({ channel: 'nightly', version: '' }))),
    )
    const { GET } = await importHandler()
    const body = (await (await GET(makeRequest())).json()) as Record<string, unknown>
    expect(body.notes).toBeNull()
    expect(body.reason).toBe('pointer-invalid')
  })

  it('rejects unknown channels with 400 before any network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { GET } = await importHandler()
    const res = await GET(makeRequest('channel=canary'))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a network throw as pointer-unavailable (never 500s the UI)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    const { GET } = await importHandler()
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.notes).toBeNull()
  })
})

describe('fetchChannelNotes (lib wrapper)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('maps the proxy reply to ChannelNotes and null on unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonRes(POINTER))),
    )
    const { fetchChannelNotes } = await import('../src/lib/updates')
    const notes = await fetchChannelNotes('nightly')
    expect(notes).toEqual({
      version: POINTER.version,
      publishedAt: POINTER.publishedAt,
      notes: POINTER.notes,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonRes({ notes: null, reason: 'x' }))),
    )
    vi.resetModules()
    const { fetchChannelNotes: refetch } = await import('../src/lib/updates')
    expect(await refetch('stable')).toBeNull()
  })

  it('keeps version-only pointers usable (notes null, not an error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonRes({ ...POINTER, notes: null }))),
    )
    const { fetchChannelNotes } = await import('../src/lib/updates')
    const notes = await fetchChannelNotes('nightly')
    expect(notes?.notes).toBeNull()
    expect(notes?.version).toBe(POINTER.version)
  })
})

describe('parseUpdatePointer sanity for the proxy contract', () => {
  it('accepts the shape the handler forwards', () => {
    const parsed = parseUpdatePointer(POINTER)
    expect(parsed?.notes).toBe(POINTER.notes)
  })
})
