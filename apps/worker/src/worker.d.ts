/**
 * Ambient Cloudflare Worker & Durable Object types for local typecheck.
 */
declare interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put<T = unknown>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
}

declare interface DurableObjectState {
  id: any
  storage: DurableObjectStorage
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  acceptWebSocket(ws: WebSocket): void
  getWebSockets(): WebSocket[]
}

declare interface DurableObjectNamespace {
  idFromName(name: string): any
  get(id: any): {
    fetch(request: Request | string, init?: RequestInit): Promise<Response>
  }
}

declare interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement
  all<T = Record<string, any>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
  first<T = Record<string, any>>(): Promise<T | null>
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface WebSocket {
  serializeAttachment(attachment: any): void
  deserializeAttachment(): any
}

interface ResponseInit {
  webSocket?: WebSocket
}
