/**
 * StudyRoom Durable Object — manages real-time study sessions,
 * pomodoro sync, participant presence and room chat.
 */
import {
  filterContentSafety,
  type StudyRoomParticipant,
  type StudyRoomState,
} from '@learning-hub/core/online'

interface WsSessionAttachment {
  participantId?: string
}

export class StudyRoom {
  private state: DurableObjectState
  private room: StudyRoomState

  constructor(state: DurableObjectState) {
    this.state = state
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
          const p: StudyRoomParticipant = {
            id: data.participant.id,
            alias: data.participant.alias,
            avatar: data.participant.avatar,
            status: data.participant.status ?? 'studying',
            streak: data.participant.streak ?? 0,
            cardsReviewed: data.participant.cardsReviewed ?? 0,
            joinedAt: new Date().toISOString(),
          }
          ws.serializeAttachment({ participantId: p.id } as WsSessionAttachment)

          // Add or replace
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
