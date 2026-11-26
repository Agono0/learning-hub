import { describe, expect, it } from 'vitest'
import worker from '../src/index'
import { BossRaid } from '../src/boss-raid'
import { RAID_LIMITS, frameByteLength, isOwnBossKey, parseRaidJoin } from '../src/raid-validation'

class FakeSocket {
  attachment: unknown = null
  sent: string[] = []
  closed = false
  serializeAttachment(v: unknown) {
    this.attachment = v
  }
  deserializeAttachment() {
    return this.attachment
  }
  send(m: string) {
    this.sent.push(m)
  }
  close() {
    this.closed = true
  }
  frames() {
    return this.sent.map((s) => JSON.parse(s) as { type: string; code?: string; raid?: any })
  }
  lastCode() {
    return [...this.frames()].reverse().find((f) => f.type === 'error')?.code
  }
}

function makeRaid(stored?: unknown) {
  const store = new Map<string, unknown>()
  if (stored) store.set('raid', stored)
  const sockets: FakeSocket[] = []
  const state = {
    id: { toString: () => 'x' },
    storage: {
      get: async (k: string) => store.get(k),
      put: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
      delete: async (k: string) => store.delete(k),
    },
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
    acceptWebSocket: (ws: FakeSocket) => void sockets.push(ws),
    getWebSockets: () => sockets as unknown as WebSocket[],
  }
  const raid = new BossRaid(state as unknown as DurableObjectState)
  const connect = () => {
    const ws = new FakeSocket()
    sockets.push(ws)
    return ws
  }
  const send = (ws: FakeSocket, msg: unknown) =>
    raid.webSocketMessage(
      ws as unknown as WebSocket,
      typeof msg === 'string' ? msg : JSON.stringify(msg),
    )
  const join = (ws: FakeSocket, id: string, alias = 'Ann') =>
    send(ws, { type: 'join', member: { id, alias } })
  const members = () => (raid as any).raid.members as { id: string; alias: string }[]
  const snapshot = () => JSON.stringify((raid as any).raid)
  const close = (ws: FakeSocket) => {
    sockets.splice(sockets.indexOf(ws), 1)
    return raid.webSocketClose(ws as unknown as WebSocket)
  }
  return { raid, store, sockets, connect, send, join, members, snapshot, close }
}

const utf8 = (s: string) => new TextEncoder().encode(s).byteLength

describe('raid join bounds', () => {
  it('measures the worst legitimate join below the frame cap', () => {
    // 64 + 40 three-byte characters, plus one escaped quote each so JSON adds a backslash.
    const id = '\u20ac'.repeat(RAID_LIMITS.idMax - 1) + '"'
    const alias = '\u20ac'.repeat(RAID_LIMITS.aliasMax - 1) + '"'
    const frame = JSON.stringify({ type: 'join', member: { id, alias } })
    expect(parseRaidJoin(JSON.parse(frame)).ok).toBe(true)
    const worst = utf8(frame)
    expect(worst).toBeGreaterThan(300)
    expect(worst).toBeLessThanOrEqual(RAID_LIMITS.maxFrameBytes)
    // A client that escapes every unit as \uXXXX (6 bytes) is still under the cap.
    const escaped = `{"type":"join","member":{"id":"${'\\u20ac'.repeat(64)}","alias":"${'\\u20ac'.repeat(40)}"}}`
    expect(utf8(escaped)).toBeLessThanOrEqual(RAID_LIMITS.maxFrameBytes)
  })

  it('accepts id and alias exactly at the limits and refuses one over', () => {
    expect(parseRaidJoin({ member: { id: 'a'.repeat(64), alias: 'b'.repeat(40) } }).ok).toBe(true)
    expect(parseRaidJoin({ member: { id: 'a'.repeat(65), alias: 'b' } }).ok).toBe(false)
    expect(parseRaidJoin({ member: { id: 'a', alias: 'b'.repeat(41) } }).ok).toBe(false)
    expect(parseRaidJoin({ member: { id: '', alias: 'b' } }).ok).toBe(false)
    expect(parseRaidJoin({ member: { id: 'a', alias: '   ' } }).ok).toBe(false)
  })

  it('accepts the id shapes the callers produce without a charset rule', () => {
    for (const id of ['usr_' + 'f'.repeat(32), 'usr_k3j2h1g0lq9x8w', 'usr_self', 'a b', 'é-用户']) {
      expect(parseRaidJoin({ member: { id, alias: 'A' } }).ok).toBe(true)
    }
  })

  it('refuses wrong types and control characters', () => {
    for (const member of [
      { id: { x: 1 }, alias: 'A' },
      { id: 'a', alias: ['A'] },
      { id: 5, alias: 'A' },
      { id: 'a\u0000b', alias: 'A' },
      { id: 'a', alias: 'A\nB' },
      null,
      [],
      'str',
    ]) {
      expect(parseRaidJoin({ member }).ok).toBe(false)
    }
    expect(parseRaidJoin(null).ok).toBe(false)
    expect(parseRaidJoin({}).ok).toBe(false)
  })

  it('counts frame bytes for strings and binary', () => {
    expect(frameByteLength('\u20ac')).toBe(3)
    expect(frameByteLength(new ArrayBuffer(10))).toBe(10)
  })

  it('refuses invalid joins over the socket with no state change', async () => {
    const h = makeRaid()
    const before = h.snapshot()
    const ws = h.connect()
    await h.send(ws, { type: 'join', member: { id: { a: 1 }, alias: 'A' } })
    await h.send(ws, { type: 'join', member: { id: 'a'.repeat(65), alias: 'A' } })
    await h.send(ws, { type: 'join', member: { id: 'a', alias: 'x'.repeat(200_000) } })
    await h.send(ws, { type: 'join' })
    expect(ws.frames().map((f) => f.code)).toEqual([
      'invalid_join',
      'invalid_join',
      'frame_too_large',
      'invalid_join',
    ])
    expect(h.snapshot()).toBe(before)
    expect(h.store.has('raid')).toBe(false)
    expect(ws.attachment).toBeNull()
  })

  it('accepts a frame at the byte cap and refuses one byte over', async () => {
    const h = makeRaid()
    const ws = h.connect()
    const base = '{"type":"ping","pad":""}'
    const atCap = base.replace('""', `"${'x'.repeat(RAID_LIMITS.maxFrameBytes - base.length)}"`)
    expect(utf8(atCap)).toBe(RAID_LIMITS.maxFrameBytes)
    await h.send(ws, atCap)
    expect(ws.frames()).toEqual([{ type: 'pong' }])
    await h.send(ws, atCap + ' ')
    expect(ws.lastCode()).toBe('frame_too_large')
    // multibyte: 342 three-byte characters are 1026 bytes but only 342 UTF-16 units.
    const multi = '\u20ac'.repeat(342)
    expect(multi.length).toBeLessThan(RAID_LIMITS.maxFrameBytes)
    await h.send(ws, multi)
    expect(ws.frames().filter((f) => f.code === 'frame_too_large')).toHaveLength(2)
  })

  it('refuses an oversize binary frame', async () => {
    const h = makeRaid()
    const ws = h.connect()
    await h.raid.webSocketMessage(
      ws as unknown as WebSocket,
      new ArrayBuffer(RAID_LIMITS.maxFrameBytes + 1),
    )
    expect(ws.lastCode()).toBe('frame_too_large')
  })

  it('keeps the persisted raid small with a full max-size roster (UTF-8 bytes of JSON)', async () => {
    const h = makeRaid()
    for (let i = 0; i < RAID_LIMITS.maxMembers; i++) {
      const ws = h.connect()
      const id = String(i).padStart(2, '0') + '\u20ac'.repeat(RAID_LIMITS.idMax - 2)
      await h.join(ws, id, '\u20ac'.repeat(RAID_LIMITS.aliasMax))
      await h.send(ws, { type: 'attack', damage: 1 })
    }
    expect(h.members()).toHaveLength(RAID_LIMITS.maxMembers)
    const stored = h.store.get('raid')
    expect(utf8(JSON.stringify(stored))).toBeLessThan(32_768)
  })
})

describe('raid roster and membership', () => {
  it('lets a legitimate join through and starts the fight', async () => {
    const h = makeRaid()
    const ws = h.connect()
    await h.join(ws, 'usr_a', 'Ann')
    expect(h.members().map((m) => m.id)).toEqual(['usr_a'])
    expect((h.raid as any).raid.status).toBe('fighting')
    expect(ws.frames().at(-1)?.type).toBe('state')
  })

  it('refuses a join whose id belongs to another live socket and leaves it intact', async () => {
    const h = makeRaid()
    const a = h.connect()
    const b = h.connect()
    await h.join(a, 'usr_a', 'Ann')
    await h.send(a, { type: 'attack', damage: 40 })
    await h.join(b, 'usr_a', 'Mallory')
    expect(b.lastCode()).toBe('id_in_use')
    expect(b.attachment).toBeNull()
    expect(h.members()).toHaveLength(1)
    expect(h.members()[0]).toMatchObject({ id: 'usr_a', alias: 'Ann', damageDealt: 40 })
    // b cannot attack as usr_a
    await h.send(b, { type: 'attack', damage: 100 })
    expect((h.raid as any).raid.bossHp).toBe(1000 - 40)
  })

  it('removes the prior member when one socket changes identity', async () => {
    const h = makeRaid()
    const a = h.connect()
    await h.join(a, 'usr_a')
    await h.join(a, 'usr_b', 'Bob')
    expect(h.members().map((m) => m.id)).toEqual(['usr_b'])
    expect(a.attachment).toEqual({ memberId: 'usr_b' })
  })

  it('treats a repeat join of the same id on the same socket as a no-op', async () => {
    const h = makeRaid()
    const a = h.connect()
    await h.join(a, 'usr_a')
    await h.send(a, { type: 'attack', damage: 30 })
    await h.join(a, 'usr_a', 'Other')
    expect(h.members()).toHaveLength(1)
    expect(h.members()[0]).toMatchObject({ alias: 'Ann', damageDealt: 30 })
  })

  it('frees the id after disconnect so a reconnect can join', async () => {
    const h = makeRaid()
    const a = h.connect()
    await h.join(a, 'usr_a')
    await h.close(a)
    expect(h.members()).toHaveLength(0)
    const b = h.connect()
    await h.join(b, 'usr_a', 'Ann again')
    expect(b.lastCode()).toBeUndefined()
    expect(h.members().map((m) => m.alias)).toEqual(['Ann again'])
  })

  it('disconnect of one member leaves the others', async () => {
    const h = makeRaid()
    const a = h.connect()
    const b = h.connect()
    await h.join(a, 'usr_a')
    await h.join(b, 'usr_b')
    await h.close(a)
    expect(h.members().map((m) => m.id)).toEqual(['usr_b'])
  })

  it('caps the roster at the limit and refuses the next join without mutation', async () => {
    const h = makeRaid()
    for (let i = 0; i < RAID_LIMITS.maxMembers; i++) await h.join(h.connect(), `usr_${i}`)
    expect(h.members()).toHaveLength(RAID_LIMITS.maxMembers)
    const before = h.snapshot()
    const extra = h.connect()
    await h.join(extra, 'usr_extra')
    expect(extra.lastCode()).toBe('room_full')
    expect(h.snapshot()).toBe(before)
    expect(extra.attachment).toBeNull()
  })

  it('lets a full roster member switch identity on its own socket', async () => {
    const h = makeRaid()
    const sockets = []
    for (let i = 0; i < RAID_LIMITS.maxMembers; i++) {
      const ws = h.connect()
      sockets.push(ws)
      await h.join(ws, `usr_${i}`)
    }
    await h.join(sockets[0]!, 'usr_new')
    expect(sockets[0]!.lastCode()).toBeUndefined()
    expect(h.members()).toHaveLength(RAID_LIMITS.maxMembers)
    expect(h.members().some((m) => m.id === 'usr_0')).toBe(false)
  })

  it('keeps the 1..100 damage clamp and the 25 entry log bound', async () => {
    const h = makeRaid()
    const a = h.connect()
    await h.join(a, 'usr_a')
    await h.send(a, { type: 'attack', damage: 100000 })
    expect((h.raid as any).raid.bossHp).toBe(900)
    await h.send(a, { type: 'attack', damage: -5 })
    expect((h.raid as any).raid.bossHp).toBe(899)
    for (let i = 0; i < 40; i++) await h.send(a, { type: 'attack', damage: 1 })
    const log = (h.raid as any).raid.combatLog as string[]
    expect(log.length).toBe(RAID_LIMITS.combatLogEntries)
    expect(Math.max(...log.map((l) => l.length))).toBeLessThanOrEqual(160)
  })
})

describe('raid create bossKey', () => {
  const ns = (): DurableObjectNamespace =>
    ({
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: async () => Response.json({ ok: true }) }),
    }) as unknown as DurableObjectNamespace
  const create = (body: unknown) =>
    worker.fetch(
      new Request('http://worker.local/api/v1/raids/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { BOSS_RAID: ns() } as never,
    )

  it('refuses prototype keys and bad types with 400', async () => {
    for (const bossKey of [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      7,
      'x'.repeat(41),
      'nope',
    ]) {
      expect((await create({ bossKey })).status).toBe(400)
    }
  })

  it('accepts an own key and the default', async () => {
    expect((await create({ bossKey: 'hydra' })).status).toBe(200)
    expect((await create({})).status).toBe(200)
    expect(isOwnBossKey({ a: 1 }, 'a')).toBe(true)
    expect(isOwnBossKey({}, 'toString')).toBe(false)
  })
})
