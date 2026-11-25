/**
 * StudyRoom Durable Object — manages real-time study sessions,
 * pomodoro sync, participant presence and room chat.
 */
import {
  JOIN_ASSERTION_MAX_TTL_MS,
  joinAssertionPayload,
  verifyIdentityPayload,
} from '@learning-hub/core/identity-crypto'
import { lookupRegistered, type IdentityEnv } from './signed-request'
import {
  filterContentSafety,
  type StudyRoomParticipant,
  type StudyRoomState,
} from '@learning-hub/core/online'

interface WsSessionAttachment {
  participantId?: string
  /** Host the socket upgrade arrived on (audience fallback when EXPECTED_HOST is unset). */
  host?: string
}

/** Most unexpired join-assertion ids remembered per room; beyond this, joins are refused. */
const MAX_REMEMBERED_JTIS = 1000

function boundedInt(v: unknown, max: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : 0
}

export class StudyRoom {
  private state: DurableObjectState
  private room: StudyRoomState
  private env: IdentityEnv

  constructor(state: DurableObjectState, env: IdentityEnv = {}) {
    this.state = state
    this.env = env
    this.room = {
      code: '------',
      title: 'Study Room',
      timerMode: 'pomodoro',
      pomodoroWorkMinutes: 25,
      pomodoroBreakMinutes: 5,
      isBreak: false,
      timerExpiresAt: null,
      participants: [],
    }

    // Restore persisted state if available
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<StudyRoomState>('room')
      if (stored) {
        this.room = stored
        // Clear stale participants on boot
        this.room.participants = []
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Room info endpoint (HTTP GET)
    if (request.method === 'GET' && url.pathname.endsWith('/info')) {
      return Response.json({ ok: true, room: this.room })
    }

    // Room init endpoint (HTTP POST)
    if (request.method === 'POST' && url.pathname.endsWith('/init')) {
      const body = (await request.json()) as Partial<StudyRoomState>
      this.room = {
        ...this.room,
        ...body,
        participants: [],
      }
      await this.state.storage.put('room', this.room)
      return Response.json({ ok: true, room: this.room })
    }

    // WebSocket Upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.state.acceptWebSocket(server)
      server.serializeAttachment({ host: url.host } as WsSessionAttachment)
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
          const attach = (ws.deserializeAttachment() as WsSessionAttachment | null) ?? {}
          // A socket joins once. It cannot switch to another identity afterwards.
          if (attach.participantId) break
          const who = await this.resolveJoinIdentity(ws, attach, data)
          if (!who.ok) {
            this.reject(ws, who.code)
            break
          }
          const input = (data.participant ?? {}) as Record<string, unknown>
          const rawAlias = typeof input.alias === 'string' ? input.alias : 'Learner'
          const p: StudyRoomParticipant = {
            id: who.id,
            alias: who.alias ?? filterContentSafety(rawAlias.slice(0, 40)).clean,
            avatar: typeof input.avatar === 'string' ? input.avatar.slice(0, 16) : undefined,
            status: input.status === 'break' || input.status === 'idle' ? input.status : 'studying',
            streak: boundedInt(input.streak, 36_500),
            cardsReviewed: boundedInt(input.cardsReviewed, 1_000_000),
            joinedAt: new Date().toISOString(),
          } as StudyRoomParticipant
          ws.serializeAttachment({ ...attach, participantId: p.id } as WsSessionAttachment)
          this.room.participants = [...this.room.participants.filter((x) => x.id !== p.id), p]
          await this.persistAndBroadcast()
          break
        }

        case 'timer_toggle': {
          this.room.isBreak = !this.room.isBreak
          const minutes = this.room.isBreak
            ? this.room.pomodoroBreakMinutes
            : this.room.pomodoroWorkMinutes
          this.room.timerExpiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString()
          await this.persistAndBroadcast()
          break
        }

        case 'review_bump': {
          const attach = ws.deserializeAttachment() as WsSessionAttachment | null
          if (attach?.participantId) {
            const p = this.room.participants.find((x) => x.id === attach.participantId)
            if (p) {
              p.cardsReviewed += 1
              await this.persistAndBroadcast()
            }
          }
          break
        }

        case 'chat': {
          const attach = ws.deserializeAttachment() as WsSessionAttachment | null
          const p = this.room.participants.find((x) => x.id === attach?.participantId)
          if (p && typeof data.content === 'string') {
            const { clean } = filterContentSafety(data.content.slice(0, 500))
            const chatPayload = JSON.stringify({
              type: 'chat',
              message: {
                id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                roomCode: this.room.code,
                senderId: p.id,
                senderAlias: p.alias,
                content: clean,
                sentAt: new Date().toISOString(),
              },
            })
            this.broadcastRaw(chatPayload)
          }
          break
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }))
          break
        }
      }
    } catch {
      // Ignore malformed frames
    }
  }

  private reject(ws: WebSocket, code: string): void {
    try {
      ws.send(JSON.stringify({ type: 'error', code }))
      ws.close(1008, code)
    } catch {
      // socket already gone
    }
  }

  /**
   * Decides who a join is. No assertion: anonymous with a server-chosen random id (a client
   * can no longer choose its id, so it cannot replace someone else). A supplied assertion must
   * verify (audience, room, expiry, key registered, unique id not seen before) or the join is
   * refused: no downgrade. Duplicate or replayed joins never replace an existing participant.
   */
  private async resolveJoinIdentity(
    ws: WebSocket,
    attach: WsSessionAttachment,
    data: Record<string, unknown>,
  ): Promise<{ ok: true; id: string; alias?: string } | { ok: false; code: string }> {
    const a = data.assertion
    if (a === undefined || a === null) {
      const bytes = crypto.getRandomValues(new Uint8Array(8))
      return {
        ok: true,
        id: `anon_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`,
      }
    }
    if (typeof a !== 'object') return { ok: false, code: 'invalid_assertion' }
    const { key, exp, jti, sig } = a as Record<string, unknown>
    const now = Date.now()
    if (
      typeof key !== 'string' ||
      typeof sig !== 'string' ||
      typeof jti !== 'string' ||
      typeof exp !== 'number' ||
      !Number.isInteger(exp) ||
      key.length > 512 ||
      sig.length > 256 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(key) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(sig) ||
      !/^[A-Za-z0-9_-]{8,64}$/.test(jti) ||
      exp <= now ||
      exp - now > JOIN_ASSERTION_MAX_TTL_MS
    ) {
      return { ok: false, code: 'invalid_assertion' }
    }
    const host = this.env.EXPECTED_HOST || attach.host || ''
    const payload = joinAssertionPayload({ host, room: this.room.code, exp, jti })
    if (!(await verifyIdentityPayload(key, payload, sig))) {
      return { ok: false, code: 'invalid_assertion' }
    }
    const found = await lookupRegistered(this.env, key)
    if (found === 'unavailable') return { ok: false, code: 'identity_unavailable' }
    if (!found) return { ok: false, code: 'register_required' }

    // Check-and-consume under the storage gate so concurrent joins cannot both pass.
    return this.state.blockConcurrencyWhile(async () => {
      const seen = (await this.state.storage.get<Record<string, number>>('jtis')) ?? {}
      for (const [k, v] of Object.entries(seen)) if (v <= now) delete seen[k]
      if (seen[jti] !== undefined) return { ok: false as const, code: 'replayed' }
      if (Object.keys(seen).length >= MAX_REMEMBERED_JTIS)
        return { ok: false as const, code: 'busy' }
      const taken = this.state.getWebSockets().some((w) => {
        if (w === ws) return false
        const at = w.deserializeAttachment() as WsSessionAttachment | null
        return at?.participantId === found.id
      })
      // The id is spent even when refused: a refused assertion cannot be retried.
      seen[jti] = exp
      await this.state.storage.put('jtis', seen)
      if (taken) return { ok: false as const, code: 'already_joined' }
      return { ok: true as const, id: found.id, alias: filterContentSafety(found.alias).clean }
    })
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attach = ws.deserializeAttachment() as WsSessionAttachment | null
    if (attach?.participantId) {
      this.room.participants = this.room.participants.filter((x) => x.id !== attach.participantId)
      await this.persistAndBroadcast()
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  private async persistAndBroadcast(): Promise<void> {
    await this.state.storage.put('room', this.room)
    this.broadcastRaw(JSON.stringify({ type: 'state', room: this.room }))
  }

  private broadcastRaw(payload: string): void {
    const sockets = this.state.getWebSockets()
    for (const ws of sockets) {
      try {
        ws.send(payload)
      } catch {
        // ignore dead socket
      }
    }
  }
}
