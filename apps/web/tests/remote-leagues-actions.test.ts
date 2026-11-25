import { describe, expect, it } from 'vitest'
import {
  buildMembershipRequest,
  buildNewInvite,
  numberOr,
  submitMembership,
} from '../src/lib/remote-leagues-actions'

const T = { serverUrl: 'https://league.example', remoteLeagueId: 'lg-1' }

describe('buildMembershipRequest', () => {
  it('builds an enqueue body for each membership action', () => {
    expect(buildMembershipRequest(T, { kind: 'leave' })).toEqual({
      ok: true,
      body: { action: 'enqueue', ...T, mutation: { type: 'leave' } },
    })
    expect(buildMembershipRequest(T, { kind: 'rename', alias: '  Ada  ' })).toMatchObject({
      ok: true,
      body: { mutation: { type: 'rename', alias: 'Ada' } },
    })
    expect(buildMembershipRequest(T, { kind: 'policy', required: true })).toMatchObject({
      ok: true,
      body: { mutation: { type: 'invite-policy', required: true } },
    })
  })

  it('refuses blank names with a readable message', () => {
    for (const form of [
      { kind: 'rename', alias: '   ' },
      { kind: 'join', alias: '' },
    ] as const) {
      const r = buildMembershipRequest(T, form)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/Enter a/)
    }
  })

  it('joins with or without an invite and trims the code', () => {
    const code = 'q'.repeat(32)
    expect(
      buildMembershipRequest(T, { kind: 'join', alias: 'Bo', invite: `  ${code} ` }),
    ).toMatchObject({
      ok: true,
      body: { mutation: { type: 'join', alias: 'Bo', invite: code } },
    })
    const plain = buildMembershipRequest(T, { kind: 'join', alias: 'Bo', invite: '   ' })
    expect(plain.ok).toBe(true)
    if (plain.ok) expect('invite' in plain.body.mutation).toBe(false)
  })

  it('rejects a too-short invite code and a malformed digest', () => {
    expect(buildMembershipRequest(T, { kind: 'join', alias: 'Bo', invite: 'short' }).ok).toBe(false)
    expect(buildMembershipRequest(T, { kind: 'revoke', digest: 'nothex' }).ok).toBe(false)
  })

  it('lower-cases a pasted digest before validating it', () => {
    const r = buildMembershipRequest(T, { kind: 'revoke', digest: 'AB'.repeat(32) })
    expect(r).toMatchObject({ ok: true, body: { mutation: { digest: 'ab'.repeat(32) } } })
  })
})

describe('buildNewInvite', () => {
  it('returns a code that is not part of the request, only its digest', async () => {
    const inv = await buildNewInvite(T, { uses: 3, hours: 2 })
    expect(inv.code).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(inv.request.ok).toBe(true)
    if (inv.request.ok) {
      expect(inv.request.body.mutation).toEqual({
        type: 'invite-create',
        digest: inv.digest,
        maxUses: 3,
        ttlMs: 7_200_000,
      })
    }
    expect(JSON.stringify(inv.request)).not.toContain(inv.code)
  })

  it('makes a different code each time', async () => {
    const a = await buildNewInvite(T, { uses: 1, hours: 1 })
    const b = await buildNewInvite(T, { uses: 1, hours: 1 })
    expect(a.code).not.toBe(b.code)
    expect(a.digest).not.toBe(b.digest)
  })

  it('reports out-of-range options instead of throwing', async () => {
    for (const opts of [
      { uses: 0, hours: 1 },
      { uses: 21, hours: 1 },
      { uses: 1, hours: 0 },
      { uses: 1, hours: 24 * 8 },
    ]) {
      const inv = await buildNewInvite(T, opts)
      expect(inv.request.ok).toBe(false)
    }
  })
})

describe('numberOr', () => {
  it('parses numbers and falls back on blanks and junk', () => {
    expect(numberOr(' 5 ', 1)).toBe(5)
    expect(numberOr('', 7)).toBe(7)
    expect(numberOr('abc', 9)).toBe(9)
    expect(numberOr('2.5', 1)).toBe(2.5)
  })
})

describe('submitMembership', () => {
  const ok = buildMembershipRequest(T, { kind: 'leave' })
  type Call = { path: string; body: { action: string } }

  function fakeSend(replies: Array<unknown | Error>) {
    const calls: Call[] = []
    const send = (async (path: string, _m: 'POST', body: unknown) => {
      calls.push({ path, body: body as { action: string } })
      const next = replies.shift()
      if (next instanceof Error) throw next
      return next
    }) as Parameters<typeof submitMembership>[1]
    return { send, calls }
  }

  it('does not call the server for an invalid form', async () => {
    const { send, calls } = fakeSend([])
    const r = await submitMembership({ ok: false, error: 'Enter a new name.' }, send)
    expect(r).toEqual({ ok: false, message: 'Enter a new name.' })
    expect(calls).toHaveLength(0)
  })

  it('queues first, then syncs, and reports done when nothing is pending', async () => {
    const { send, calls } = fakeSend([
      { ok: true },
      { ok: true, queue: { pending: 0, rejected: 0 } },
    ])
    const r = await submitMembership(ok, send)
    expect(calls.map((c) => c.body.action)).toEqual(['enqueue', 'sync'])
    expect(r).toEqual({ ok: true, message: 'Done.' })
  })

  it('says saved-but-waiting when the push leaves work pending', async () => {
    const { send } = fakeSend([{}, { queue: { pending: 1 } }])
    const r = await submitMembership(ok, send)
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/waiting/)
  })

  it('reports a refusal when the league rejects the change', async () => {
    const { send } = fakeSend([{}, { queue: { pending: 0, rejected: 1 } }])
    const r = await submitMembership(ok, send)
    expect(r).toEqual({ ok: false, message: 'The league refused the change.' })
  })

  it('keeps a queued change when the sync call throws', async () => {
    const { send, calls } = fakeSend([{}, new Error('A device key identity is required')])
    const r = await submitMembership(ok, send)
    expect(calls).toHaveLength(2)
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/Saved, not sent yet: A device key/)
  })

  it('stops and says so when queueing itself fails', async () => {
    const { send, calls } = fakeSend([new Error('Remote leagues are not enabled')])
    const r = await submitMembership(ok, send)
    expect(calls).toHaveLength(1)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/Could not queue the change/)
  })
})
