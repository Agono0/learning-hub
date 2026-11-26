import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnlineSocket } from '../src/lib/online-socket'

class FakeWS {
  static CONNECTING = 0
  static OPEN = 1
  static instances: FakeWS[] = []
  readyState = 0
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWS.instances.push(this)
  }
  send(d: string) {
    this.sent.push(d)
  }
  close() {
    this.closed = true
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  drop() {
    this.readyState = 3
    this.onclose?.()
  }
}

function make(joinCount: { n: number }) {
  return new OnlineSocket({
    url: 'ws://test.invalid/x',
    onState: () => {},
    onOpen: (s) => s.send({ type: 'join', nonce: ++joinCount.n }),
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeWS.instances = []
})

describe('OnlineSocket lifecycle (fake WebSocket, no network)', () => {
  it('send while CONNECTING is dropped (documented), join goes out on open', () => {
    vi.stubGlobal('WebSocket', FakeWS)
    const c = { n: 0 }
    const s = make(c)
    s.connect()
    s.send({ type: 'early' })
    const ws = FakeWS.instances[0]
    expect(ws.sent).toEqual([])
    ws.open()
    expect(ws.sent.map((x) => JSON.parse(x).type)).toEqual(['join'])
  })

  it('delayed open still joins exactly once, no timer involved', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    const c = { n: 0 }
    const s = make(c)
    s.connect()
    vi.advanceTimersByTime(5000)
    const ws = FakeWS.instances[0]
    expect(ws.sent).toEqual([])
    ws.open()
    expect(ws.sent).toHaveLength(1)
    s.close()
  })

  it('reconnect re-joins with a freshly built payload (not a cached one)', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    const c = { n: 0 }
    const s = make(c)
    s.connect()
    FakeWS.instances[0].open()
    FakeWS.instances[0].drop()
    vi.advanceTimersByTime(3000)
    expect(FakeWS.instances).toHaveLength(2)
    FakeWS.instances[1].open()
    const n0 = JSON.parse(FakeWS.instances[0].sent[0]).nonce
    const n1 = JSON.parse(FakeWS.instances[1].sent[0]).nonce
    expect(n1).not.toBe(n0)
    s.close()
  })

  it('intentional close stops reconnects and detaches listeners', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWS)
    const c = { n: 0 }
    const s = make(c)
    s.connect()
    const ws = FakeWS.instances[0]
    ws.open()
    s.close()
    expect(ws.closed).toBe(true)
    expect(ws.onopen).toBeNull()
    expect(ws.onclose).toBeNull()
    expect(ws.onmessage).toBeNull()
    vi.advanceTimersByTime(60000)
    expect(FakeWS.instances).toHaveLength(1)
    expect(c.n).toBe(1)
  })

  it('late open on a closed socket does not join', () => {
    vi.stubGlobal('WebSocket', FakeWS)
    const c = { n: 0 }
    const s = make(c)
    s.connect()
    const ws = FakeWS.instances[0]
    const staleOpen = ws.onopen
    s.disconnect()
    staleOpen?.()
    expect(c.n).toBe(0)
  })
})
