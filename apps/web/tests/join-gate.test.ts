import { describe, expect, it } from 'vitest'
import { createJoinGate } from '../src/lib/join-gate'

const A = (n: number) => ({ jti: `j${n}` })
const seq = (...vals: unknown[]) => {
  let i = 0
  const calls: number[] = []
  return {
    calls,
    fn: async () => {
      calls.push(i)
      const v = vals[i++]
      if (v instanceof Error) throw v
      return v as { joinAssertion?: unknown } | null | undefined
    },
  }
}

describe('join gate', () => {
  it('first open uses the caller assertion and does not fetch', async () => {
    const f = seq()
    const g = createJoinGate(A(1), f.fn)
    expect(await g.decide()).toEqual({ send: true, proof: A(1) })
    expect(f.calls).toEqual([])
  })

  it('each reconnect fetches a distinct fresh assertion and never reuses the first', async () => {
    const f = seq({ joinAssertion: A(2) }, { joinAssertion: A(3) })
    const g = createJoinGate(A(1), f.fn)
    const out = [await g.decide(), await g.decide(), await g.decide()]
    expect(out.map((o) => (o.send ? (o.proof as { jti: string }).jti : null))).toEqual([
      'j1',
      'j2',
      'j3',
    ])
    expect(f.calls).toEqual([0, 1])
  })

  it('verified then explicit null fails closed (no downgrade)', async () => {
    const g = createJoinGate(A(1), seq({ joinAssertion: null }).fn)
    await g.decide()
    expect(await g.decide()).toEqual({ send: false })
  })

  it('verified then missing key, failed fetch or empty reply fails closed', async () => {
    for (const reply of [{}, new Error('net'), null, undefined]) {
      const g = createJoinGate(A(1), seq(reply).fn)
      await g.decide()
      expect(await g.decide(), String(reply)).toEqual({ send: false })
    }
  })

  it('initial explicit null is anonymous, and stays so on a null reconnect', async () => {
    const g = createJoinGate(null, seq({ joinAssertion: null }).fn)
    expect(await g.decide()).toEqual({ send: true, proof: null })
    expect(await g.decide()).toEqual({ send: true, proof: null })
  })

  it('initial missing key fails closed', async () => {
    const g = createJoinGate(undefined, seq().fn)
    expect(await g.decide()).toEqual({ send: false })
  })

  it('anonymous may upgrade to verified, and then sticks', async () => {
    const g = createJoinGate(
      null,
      seq({ joinAssertion: A(2) }, { joinAssertion: null }, { joinAssertion: A(4) }).fn,
    )
    expect((await g.decide()).send).toBe(true)
    expect(await g.decide()).toEqual({ send: true, proof: A(2) })
    expect(await g.decide()).toEqual({ send: false }) // verified -> null: closed
    expect(await g.decide()).toEqual({ send: true, proof: A(4) }) // a later object is fine
  })

  it('a failure is reported once per open: no internal retry', async () => {
    const f = seq(new Error('x'), { joinAssertion: A(9) })
    const g = createJoinGate(A(1), f.fn)
    await g.decide()
    expect(await g.decide()).toEqual({ send: false })
    expect(f.calls).toEqual([0])
  })
})

import { runJoinOnOpen } from '../src/lib/join-gate'

describe('runJoinOnOpen stale completion', () => {
  const deferred = () => {
    let res!: (v: { joinAssertion?: unknown }) => void
    const p = new Promise<{ joinAssertion?: unknown }>((r) => (res = r))
    return { p, res }
  }

  it('drops a fetch that settles after the socket was replaced', async () => {
    const d = deferred()
    const gate = createJoinGate(A(1), () => d.p)
    await gate.decide() // first open consumed
    let current = true
    const sent: unknown[] = []
    let failed = 0
    const run = runJoinOnOpen(gate, () => current, {
      send: (p) => sent.push(p),
      failClosed: () => failed++,
    })
    current = false // user left / socket replaced while the GET was out
    d.res({ joinAssertion: A(2) })
    await run
    expect(sent).toEqual([])
    expect(failed).toBe(0)
  })

  it('sends when still current and fails closed (once) on a verified->null reply', async () => {
    const gate = createJoinGate(A(1), async () => ({ joinAssertion: null }))
    await gate.decide()
    const sent: unknown[] = []
    let failed = 0
    await runJoinOnOpen(gate, () => true, { send: (p) => sent.push(p), failClosed: () => failed++ })
    expect(sent).toEqual([])
    expect(failed).toBe(1)
  })
})
