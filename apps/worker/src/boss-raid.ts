/**
 * BossRaid Durable Object — manages real-time multiplayer co-op boss raids.
 */
import { type PartyRaidMember, type PartyRaidState } from '@learning-hub/core/online'

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
      const body = (await request.json()) as Partial<PartyRaidState>
      this.raid = {
        ...this.raid,
        ...body,
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
    if (typeof message !== 'string') return

    try {
      const data = JSON.parse(message)

      switch (data.type) {
        case 'join': {
          const member: PartyRaidMember = {
            id: data.member.id,
            alias: data.member.alias,
            damageDealt: 0,
            isAlive: true,
          }
          ws.serializeAttachment({ memberId: member.id } as RaidAttachment)
          this.raid.members = [...this.raid.members.filter((m) => m.id !== member.id), member]
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
