/**
 * MaxFocusPrecheck (M2-16) integration test — SSR renderToString: the
 * checklist frame, the what-will-be-blocked chips computed from the resolved
 * allowlist props, the honest pending audit state (platform detection runs in
 * a client effect), and the explicit confirm toggle that gates the start
 * button. The per-tier granted-vs-needed math itself is unit-tested in
 * packages/core/tests/focus-lock-tiers.test.ts (M2-32).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MaxFocusPrecheck } from '../src/components/MaxFocusPrecheck'

/** renderToString splits interpolated JSX text with comment markers —
 * strip them so assertions see the visible text. */
const cleanHtml = (html: string): string => html.replace(/<!-- -->/g, '')

const render = (props: {
  allowedDomains?: string[]
  allowedApps?: string[]
  confirmed?: boolean
}): string =>
  renderToString(
    React.createElement(MaxFocusPrecheck, {
      allowedDomains: props.allowedDomains ?? [],
      allowedApps: props.allowedApps ?? [],
      confirmed: props.confirmed ?? false,
      onConfirmedChange: () => {},
    }),
  )

describe('MaxFocusPrecheck', () => {
  it('renders the checklist frame with the explicit confirm toggle', () => {
    const html = render({})
    expect(cleanHtml(html)).toContain('Before you commit')
    expect(cleanHtml(html)).toContain('I understand: this device stays locked')
  })

  it('lists what stays reachable as chips from the resolved allowlist', () => {
    const html = render({ allowedDomains: ['my-uni.edu'], allowedApps: ['code.exe'] })
    expect(cleanHtml(html)).toContain('my-uni.edu')
    expect(cleanHtml(html)).toContain('app: code.exe')
    expect(cleanHtml(html)).toContain('Only these stay reachable')
  })

  it('shows the honest empty note when nothing extra is selected', () => {
    expect(render({})).toContain('No extras selected yet')
  })

  it('the platform audit is pending on the server (never a guessed tier)', () => {
    const html = render({})
    expect(cleanHtml(html)).toContain('Checking what this device can enforce')
    expect(cleanHtml(html)).not.toContain('granted')
  })
})
