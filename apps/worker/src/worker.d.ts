/**
 * Ambient Cloudflare Worker & Durable Object types for local typecheck.
 */
declare interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put<T = unknown>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
}

/** Opaque Durable Object id (only passed back to `namespace.get`). */
declare interface DurableObjectId {
  toString(): string
}

declare interface DurableObjectState {
  id: DurableObjectId
  storage: DurableObjectStorage
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  acceptWebSocket(ws: WebSocket): void
  getWebSockets(): WebSocket[]
}

declare interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): {
    fetch(request: Request | string, init?: RequestInit): Promise<Response>
  }
}

declare interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
  first<T = Record<string, unknown>>(): Promise<T | null>
}

/** Values D1 can bind to a `?` placeholder. */
declare type D1Value = string | number | boolean | null | ArrayBuffer

declare interface D1Database {
  prepare(query: string): D1PreparedStatement
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface WebSocket {
  serializeAttachment(attachment: unknown): void
  deserializeAttachment(): unknown
}

interface ResponseInit {
  webSocket?: WebSocket
}
