/**
 * Runtime-neutral WebSocket client for Learning HUB Live Study Rooms & Raids.
 *
 * Runs seamlessly in Web, Tauri WebView, and Android Web Workers.
 * Features auto-reconnect with exponential backoff and message typing.
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface OnlineSocketOptions<TState> {
  url: string
  onState: (state: TState) => void
  onChat?: (message: any) => void
  onStatusChange?: (status: ConnectionStatus) => void
}

export class OnlineSocket<TState = any> {
  private ws: WebSocket | null = null
  private url: string
  private onState: (state: TState) => void
  private onChat?: (message: any) => void
  private onStatusChange?: (status: ConnectionStatus) => void
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimer: any = null
  private heartbeatTimer: any = null
  private closedExplicitly = false

  constructor(options: OnlineSocketOptions<TState>) {
    this.url = options.url
    this.onState = options.onState
    this.onChat = options.onChat
    this.onStatusChange = options.onStatusChange
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
