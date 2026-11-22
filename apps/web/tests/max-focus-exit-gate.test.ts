/**
 * MaxFocusExitGate (M2-18) integration test — SSR-safe renderToString of the
 * early-exit arc's three states plus the null lock. The device-local vault
 * read happens in a client effect, so on the server the can_confirm state
 * shows the honest "checking PIN setup" placeholder; the M2-04 handler tests
 * cover the POST side (PIN verify, rate limit, friction log).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  MAX_FOCUS_PIN_VAULT_KEY,
  MaxFocusExitGate,
  readMaxFocusPinVault,
  type MaxFocusExitGateLock,
} from '../src/components/MaxFocusExitGate'

const lock = (
  exitState: MaxFocusExitGateLock['exitState'],
  cooldown = 0,
): MaxFocusExitGateLock => ({
  exitState,
  cooldownRemainingSec: cooldown,
})

/** renderToString splits interpolated JSX text with comment markers —
 * strip them so assertions see the visible text. */
const cleanHtml = (html: string): string => html.replace(/<!-- -->/g, '')

const render = (lockShape: MaxFocusExitGateLock | null): string =>
  renderToString(React.createElement(MaxFocusExitGate, { lock: lockShape }))

describe('MaxFocusExitGate rendering', () => {
  it('renders nothing without a lock or in terminal states (SSR-safe default)', () => {
    expect(render(null)).toBe('')
    expect(render(lock('none'))).toBe('')
    expect(render(lock('ended'))).toBe('')
  })

  it('locked: shows only the reflection request affordance', () => {
    const html = render(lock('locked'))
    expect(cleanHtml(html)).toContain('Request early exit')
    expect(cleanHtml(html)).toContain('60-second reflection')
    expect(cleanHtml(html)).not.toContain('Confirm early exit')
  })

  it('cooldown: shows the reflection timer and the resistance action', () => {
    const html = render(lock('cooldown', 42))
    expect(cleanHtml(html)).toContain('42s remaining')
    expect(cleanHtml(html)).toContain('Resist impulse and return to focus')
    expect(cleanHtml(html)).not.toContain('Confirm early exit')
  })

  it('can_confirm on the server: honest PIN-setup placeholder (vault lives client-side)', () => {
    const html = render(lock('can_confirm'))
    expect(cleanHtml(html)).toContain('Checking PIN setup')
    expect(cleanHtml(html)).not.toContain('Confirm early exit')
  })

  it('the device-local vault key is pinned (contract for handlers + extension)', () => {
    expect(MAX_FOCUS_PIN_VAULT_KEY).toBe('lh:max-focus-pin-vault')
  })

  it('vault reads fail soft without a window (SSR) — never throws', () => {
    expect(readMaxFocusPinVault()).toBeNull()
  })
})
