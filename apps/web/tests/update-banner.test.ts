/**
 * Unit tests for the ask-first update banner (O1-15).
 *
 * Rendered with `renderToString` (SSR-safe contract: the banner is pure
 * presentation over props — no effects, no fetch). Covers: hot-patch vs full
 * size display, native-required state, ask-first copy, honest dismissal,
 * null-offer and Play-flavor gating (fresh module import with the baked env,
 * same pattern as update-channel-flag.test.ts), and untrusted-notes escaping.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { formatUpdateSize, UpdateBanner, type UpdateOffer } from '../src/components/UpdateBanner'

function offer(overrides: Partial<UpdateOffer> = {}): UpdateOffer {
  return {
    version: '20261122-abc1234',
    notes: 'Focus timer: fixed drift on long sessions.',
    patchSize: 51200,
    fullSize: 40 * 1024 * 1024,
    ...overrides,
  }
}

function render(props: { offer: UpdateOffer | null; applying?: boolean }) {
  return renderToString(React.createElement(UpdateBanner, props))
}

describe('UpdateBanner (O1-15)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('renders the ask-first prompt with patch-vs-full sizes', () => {
    const html = render({ offer: offer() })
    expect(html).toContain('Learning HUB 20261122-abc1234 is ready')
    expect(html).toContain('Hot update · 50.0 KB · full download 40.0 MB')
    expect(html).toContain('installs after you restart — nothing changes until then')
    expect(html).toContain('Download update')
    expect(html).toContain('Not now')
    expect(html).toContain('Focus timer: fixed drift on long sessions.')
  })

  it('shows the full-download size when no patch matches', () => {
    const html = render({ offer: offer({ patchSize: undefined }) })
    expect(html).toContain('Full download · 40.0 MB')
    expect(html).not.toContain('Hot update')
  })

  it('flags native-required releases (no hot patch even if one exists)', () => {
    const html = render({ offer: offer({ requiresNative: true }) })
    expect(html).toContain('Full download · 40.0 MB')
    expect(html).toContain('app reinstall required')
    expect(html).not.toContain('Hot update')
  })

  it('renders nothing without an offer', () => {
    expect(render({ offer: null })).toBe('')
  })

  it('shows the busy state while the consented download runs', () => {
    const html = render({ offer: offer(), applying: true })
    expect(html).toContain('Preparing…')
    expect(html).toContain('aria-busy="true"')
  })

  it('renders untrusted notes as escaped text (never HTML)', () => {
    const html = render({ offer: offer({ notes: '<script>alert(1)</script>fix' }) })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders nothing for Play builds (self-update baked off)', async () => {
    vi.stubEnv('LH_UPDATE_CHANNEL', 'play')
    vi.resetModules()
    const { UpdateBanner: PlayBanner } = await import('../src/components/UpdateBanner')
    const html = renderToString(React.createElement(PlayBanner, { offer: offer() }))
    expect(html).toBe('')
  })
})

describe('formatUpdateSize', () => {
  it('formats bytes, KB and MB calmly', () => {
    expect(formatUpdateSize(512)).toBe('512 B')
    expect(formatUpdateSize(1024)).toBe('1.0 KB')
    expect(formatUpdateSize(51200)).toBe('50.0 KB')
    expect(formatUpdateSize(15 * 1024)).toBe('15 KB')
    expect(formatUpdateSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatUpdateSize(40 * 1024 * 1024)).toBe('40.0 MB')
  })

  it('is defensive against junk input', () => {
    expect(formatUpdateSize(-1)).toBe('0 B')
    expect(formatUpdateSize(Number.NaN)).toBe('0 B')
    expect(formatUpdateSize(Number.POSITIVE_INFINITY)).toBe('0 B')
  })
})
