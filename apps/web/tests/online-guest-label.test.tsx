import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { OnlineIdentityLabel } from '../src/components/OnlineIdentityLabel'
import { OnlineSocket, joinRefusalMessage } from '../src/lib/online-socket'

describe('guest label', () => {
  it('tags unverified and unknown senders as guests, not verified ones', () => {
    const html = (verified?: boolean) =>
      renderToStaticMarkup(createElement(OnlineIdentityLabel, { alias: 'Ada', verified }))
    expect(html(true)).toContain('Ada')
    expect(html(true)).not.toContain('guest')
    expect(html(false)).toContain('(guest)')
    // An older server that sends no flag is treated as unverified.
    expect(html(undefined)).toContain('(guest)')
  })

  it('a guest copying a registered name is visibly different from the registered user', () => {
    const verified = renderToStaticMarkup(
      createElement(OnlineIdentityLabel, { alias: 'Ada', verified: true }),
    )
    const guest = renderToStaticMarkup(
      createElement(OnlineIdentityLabel, { alias: 'Ada', verified: false }),
    )
    expect(guest).not.toBe(verified)
  })
})

describe('join refusal', () => {
  it('gives actionable messages', () => {
    expect(joinRefusalMessage('register_required')).toMatch(/register/i)
    expect(joinRefusalMessage('audience_unconfigured')).toMatch(/not set up/i)
    expect(joinRefusalMessage('already_joined')).toMatch(/another connection/i)
    expect(joinRefusalMessage('whatever')).toMatch(/could not verify/i)
  })

  it('an error frame stops reconnecting and reports the code', () => {
    class FakeWs {
      static OPEN = 1
      readyState = 1
      onmessage: ((e: { data: string }) => void) | null = null
      onopen: (() => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      send() {}
      close() {}
    }
    const made: FakeWs[] = []
    vi.stubGlobal(
      'WebSocket',
      class extends FakeWs {
        constructor() {
          super()
          made.push(this)
        }
      },
    )
    const refused: string[] = []
    const socket = new OnlineSocket({
      url: 'wss://x',
      onState: () => {},
      onRefused: (c) => refused.push(c),
    })
    socket.connect()
    made[0]!.onmessage!({ data: JSON.stringify({ type: 'error', code: 'register_required' }) })
    made[0]!.onclose!()
    expect(refused).toEqual(['register_required'])
    expect(made).toHaveLength(1) // no reconnect attempt created a second socket
    vi.unstubAllGlobals()
  })
})
