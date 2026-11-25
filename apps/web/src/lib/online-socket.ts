/**
 * Runtime-neutral WebSocket client for Learning HUB Live Study Rooms & Raids.
 *
 * Runs seamlessly in Web, Tauri WebView, and Android Web Workers.
 * Features auto-reconnect with exponential backoff and message typing.
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface OnlineSocketOptions<TState, TChat> {
  url: string
  onState: (state: TState) => void
  onChat?: (message: TChat) => void
  onStatusChange?: (status: ConnectionStatus) => void
  /** The server refused this client (for example an unverified or replayed join). */
  onRefused?: (code: string) => void
}

/**
 * TState / TChat are the server's room-state and chat-message shapes. They are
 * not validated here — the socket only routes frames by `type`.
 */
export class OnlineSocket<TState = unknown, TChat = unknown> {
  private ws: WebSocket | null = null
  private url: string
  private onState: (state: TState) => void
  private onChat?: (message: TChat) => void
  private onStatusChange?: (status: ConnectionStatus) => void
  private onRefused?: (code: string) => void
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private closedExplicitly = false

  constructor(options: OnlineSocketOptions<TState, TChat>) {
    this.url = options.url
    this.onState = options.onState
    this.onChat = options.onChat
    this.onStatusChange = options.onStatusChange
    this.onRefused = options.onRefused
  }

  connect(): void {
    this.closedExplicitly = false
    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.setStatus('connected')
        this.reconnectAttempts = 0
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'state' && (data.room || data.raid)) {
            this.onState(data.room || data.raid)
          } else if (data.type === 'error' && typeof data.code === 'string') {
            // A refusal is final: do not reconnect and retry the same join.
            this.closedExplicitly = true
            this.onRefused?.(data.code)
          } else if (data.type === 'chat' && data.message && this.onChat) {
            this.onChat(data.message)
          }
        } catch {
          // ignore
        }
      }

      this.ws.onclose = () => {
        this.stopHeartbeat()
        this.setStatus('disconnected')
        if (!this.closedExplicitly) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = () => {
        this.setStatus('error')
      }
    } catch {
      this.setStatus('error')
      this.scheduleReconnect()
    }
  }

  /** Closes the socket and stops reconnection (leave room / unmount). */
  close(): void {
    this.closedExplicitly = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    try {
      this.ws?.close()
    } catch {
      // ignore double-close
    }
    this.ws = null
  }

  send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  disconnect(): void {
    this.closedExplicitly = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  private setStatus(status: ConnectionStatus): void {
    this.onStatusChange?.(status)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' })
    }, 25000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return

    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000)
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }
}

/** What the user sees when the server refuses a join. */
export function joinRefusalMessage(code: string): string {
  switch (code) {
    case 'register_required':
      return 'This device is not registered with the online server yet. Register it in Identity, then join again.'
    case 'audience_unconfigured':
    case 'identity_unavailable':
      return 'The online server is not set up for verified joins yet.'
    case 'already_joined':
      return 'You are already in this room on another connection.'
    case 'room_full':
      return 'This room is full.'
    default:
      return 'The server could not verify this join. Try again.'
  }
}
