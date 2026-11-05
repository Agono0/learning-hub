/**
 * Worker side of the outbound network bridge (see protocol.ts).
 *
 * {@link createBridgedFetch} returns a spec-shaped `fetch` that forwards each
 * request to the main thread and rebuilds a streaming `Response` from the
 * net-head / net-chunk / net-end frames — so AI SDK streaming (chat) works
 * unchanged while the actual HTTP runs natively (tauri-plugin-http), free of
 * webview CORS. AbortSignal is honored in both directions.
 */
import type { HubNetFromWorker, HubNetToWorker } from './protocol'

type Post = (message: HubNetFromWorker, transfer?: Transferable[]) => void

interface InFlight {
  resolve: (res: Response) => void
  reject: (err: Error) => void
  controller?: ReadableStreamDefaultController<Uint8Array>
  settled: boolean
}

export interface NetBridge {
  fetch: typeof fetch
  /** Feed every net-* message from the main thread here. */
  handle(message: HubNetToWorker): void
}

export function createBridgedFetch(post: Post): NetBridge {
  let nextId = 1
  const inflight = new Map<number, InFlight>()

  const bridgedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.signal.aborted)
      throw request.signal.reason ?? new DOMException('Aborted', 'AbortError')

    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer()
    const id = nextId++

    return new Promise<Response>((resolve, reject) => {
      const entry: InFlight = { resolve, reject, settled: false }
      inflight.set(id, entry)
      request.signal.addEventListener(
        'abort',
        () => {
          post({ type: 'net-abort', id })
          const reason = new DOMException('Aborted', 'AbortError')
          if (!entry.settled) {
            entry.settled = true
            reject(reason)
          } else {
            entry.controller?.error(reason)
          }
          inflight.delete(id)
        },
        { once: true },
      )
      post(
        { type: 'net-request', id, url: request.url, method: request.method, headers, body },
        body ? [body] : [],
      )
    })
  }

  function handle(message: HubNetToWorker): void {
    const entry = inflight.get(message.id)
    if (!entry) return
    switch (message.type) {
      case 'net-head': {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            entry.controller = controller
          },
        })
        entry.settled = true
        const nullBody = message.status === 204 || message.status === 304
        entry.resolve(
          new Response(nullBody ? null : stream, {
            status: message.status,
            statusText: message.statusText,
            headers: message.headers,
          }),
        )
        return
      }
      case 'net-chunk':
        entry.controller?.enqueue(new Uint8Array(message.bytes))
        return
      case 'net-end':
        entry.controller?.close()
        inflight.delete(message.id)
        return
      case 'net-error': {
        const err = new TypeError(`network request failed: ${message.message}`)
        if (entry.settled) entry.controller?.error(err)
        else entry.reject(err)
        inflight.delete(message.id)
        return
      }
    }
  }

  return { fetch: bridgedFetch, handle }
}
