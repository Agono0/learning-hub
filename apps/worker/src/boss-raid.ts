/**
 * BossRaid Durable Object — manages real-time multiplayer co-op boss raids.
 */
import { type PartyRaidMember, type PartyRaidState } from '@learning-hub/core/online'
import { BOSS_ROSTER } from '@learning-hub/core/boss'
import { RAID_LIMITS, frameByteLength, parseRaidInit, parseRaidJoin } from './raid-validation'

interface RaidAttachment {
  memberId?: string
}

export class BossRaid {
  private state: DurableObjectState
  private raid: PartyRaidState

  constructor(state: DurableObjectState) {
    this.state = state
    this.raid = {
      id: 'raid-default',
      bossKey: 'chronos',
      bossName: 'Chronos',
      bossHp: 1000,
      bossMaxHp: 1000,
      partyHp: 400,
      partyMaxHp: 400,
      status: 'waiting',
      members: [],
      combatLog: ['Raid party forming. Review cards to deal damage to the boss!'],
    }

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<PartyRaidState>('raid')
      if (stored) {
        this.raid = stored
        this.raid.members = []
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname.endsWith('/info')) {
      return Response.json({ ok: true, raid: this.raid })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/init')) {
      const parsed = parseRaidInit(await request.json().catch(() => null), BOSS_ROSTER)
      if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 })
      this.raid = {
        ...this.raid,
        ...parsed.value,
        members: [],
      }
      await this.state.storage.put('raid', this.raid)
      return Response.json({ ok: true, raid: this.raid })
    }

    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.state.acceptWebSocket(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    return new Response('Not Found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (frameByteLength(message) > RAID_LIMITS.maxFrameBytes) {
      this.refuse(ws, 'frame_too_large')
      return
    }
    if (typeof message !== 'string') return

    try {
      const data = JSON.parse(message)

      switch (data.type) {
        case 'join': {
          const parsed = parseRaidJoin(data)
          if (!parsed.ok) {
            this.refuse(ws, parsed.error)
            break
          }
          const { id, alias } = parsed.value
          const attach = (ws.deserializeAttachment() as RaidAttachment | null) ?? {}
          // Joining again as the same member on the same socket changes nothing.
          if (attach.memberId === id && this.raid.members.some((m) => m.id === id)) break
          // A live socket's member is never replaced by another socket.
          const taken = this.state.getWebSockets().some((w) => {
            if (w === ws) return false
            return (w.deserializeAttachment() as RaidAttachment | null)?.memberId === id
          })
          if (taken) {
            this.refuse(ws, 'id_in_use')
            break
          }
          // This socket's previous identity (if any) leaves; it does not stay behind as a ghost.
          const others = this.raid.members.filter((m) => m.id !== attach.memberId && m.id !== id)
          if (others.length >= RAID_LIMITS.maxMembers) {
            this.refuse(ws, 'room_full')
            break
          }
          const member: PartyRaidMember = { id, alias, damageDealt: 0, isAlive: true }
          ws.serializeAttachment({ memberId: id } as RaidAttachment)
          this.raid.members = [...others, member]
          if (this.raid.status === 'waiting' && this.raid.members.length >= 1) {
            this.raid.status = 'fighting'
          }
          await this.persistAndBroadcast()
          break
        }

        case 'attack': {
          const attach = ws.deserializeAttachment() as RaidAttachment | null
          const member = this.raid.members.find((m) => m.id === attach?.memberId)
          const damage = Math.min(100, Math.max(1, Number(data.damage) || 10))

          if (member && this.raid.status === 'fighting') {
            member.damageDealt += damage
            this.raid.bossHp = Math.max(0, this.raid.bossHp - damage)
            this.raid.combatLog.push(
              `${member.alias} dealt ${damage} damage to ${this.raid.bossName}!`,
            )

            if (this.raid.bossHp === 0) {
              this.raid.status = 'victory'
              this.raid.combatLog.push(`🏆 Victory! The party defeated ${this.raid.bossName}!`)
            }

            // Keep log size bounded
            if (this.raid.combatLog.length > 25) {
              this.raid.combatLog = this.raid.combatLog.slice(-25)
            }

            await this.persistAndBroadcast()
          }
          break
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }))
          break
        }
      }
    } catch {
      // Ignore
    }
  }

  private refuse(ws: WebSocket, code: string): void {
    try {
      ws.send(JSON.stringify({ type: 'error', code }))
    } catch {
      // socket already gone
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attach = ws.deserializeAttachment() as RaidAttachment | null
    if (attach?.memberId) {
      this.raid.members = this.raid.members.filter((m) => m.id !== attach.memberId)
      await this.persistAndBroadcast()
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  private async persistAndBroadcast(): Promise<void> {
    await this.state.storage.put('raid', this.raid)
    const payload = JSON.stringify({ type: 'state', raid: this.raid })
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload)
      } catch {
        // ignore
      }
    }
  }
}
