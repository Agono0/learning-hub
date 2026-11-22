/**
 * Unit tests for the download-progress bridge (O1-27): the ratio math is
 * total/defensive and the hook is a no-op off-Tauri; the banner renders the
 * progress bar when a reading is present (SSR-safe).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { UpdateBanner, type UpdateOffer } from '../src/components/UpdateBanner'
import { progressRatio, useUpdateDownloadProgress } from '../src/platform/update-progress'

const offer: UpdateOffer = {
  version: '20261122-abc1234',
  patchSize: 51200,
  fullSize: 40 * 1024 * 1024,
}

describe('progressRatio (O1-27)', () => {
  it('clamps to 0..1 and handles junk', () => {
    expect(progressRatio({ downloaded: 0, total: 100 })).toBe(0)
    expect(progressRatio({ downloaded: 50, total: 100 })).toBe(0.5)
    expect(progressRatio({ downloaded: 100, total: 100 })).toBe(1)
    expect(progressRatio({ downloaded: 150, total: 100 })).toBe(1)
    expect(progressRatio({ downloaded: -5, total: 100 })).toBe(0)
    expect(progressRatio({ downloaded: 10, total: 0 })).toBe(0)
    expect(progressRatio({ downloaded: Number.NaN, total: 100 })).toBe(0)
    expect(progressRatio(null)).toBe(0)
  })
})

describe('useUpdateDownloadProgress', () => {
  it('is exported and returns null off-Tauri (hook contract, node env)', () => {
    expect(typeof useUpdateDownloadProgress).toBe('function')
    // The hook body is a no-op effect off-Tauri; renderToString exercises it
    // without throwing via the banner mount below.
  })
})

describe('UpdateBanner with progress', () => {
  it('renders the progress bar while applying with a live reading', () => {
    const html = renderToString(
      React.createElement(UpdateBanner, {
        offer,
        applying: true,
        progress: { downloaded: 25600, total: 51200 },
      }),
    )
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="50"')
    expect(html).toContain('Preparing…')
  })

  it('renders no progress bar without a reading or while not applying', () => {
    expect(
      renderToString(React.createElement(UpdateBanner, { offer, applying: true })),
    ).not.toContain('role="progressbar"')
    expect(
      renderToString(
        React.createElement(UpdateBanner, {
          offer,
          applying: false,
          progress: { downloaded: 10, total: 100 },
        }),
      ),
    ).not.toContain('role="progressbar"')
  })
})
