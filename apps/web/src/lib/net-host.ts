/**
 * Main-thread side of the outbound network bridge (see hub/protocol.ts).
 *
 * Executes the hub worker's net-request messages with the native HTTP client
 * (`@tauri-apps/plugin-http` — Rust reqwest, no webview CORS) and streams the
 * response back as net-head / net-chunk / net-end frames. Only active inside
 * Tauri; the plugin module is imported dynamically so browser bundles never
 * load it.
 */
import type { HubNetFromWorker, HubNetToWorker } from '@/hub/protocol'

type Post = (message: HubNetToWorker, transfer?: Transferable[]) => void

const controllers = new Map<number, AbortController>()
let nativeFetch: Promise<typeof fetch> | null = null

function getNativeFetch(): Promise<typeof fetch> {
  nativeFetch ??= import('@tauri-apps/plugin-http').then((m) => m.fetch as typeof fetch)
  return nativeFetch
}

async function run(
  message: Extract<HubNetFromWorker, { type: 'net-request' }>,
  post: Post,
): Promise<void> {
  const controller = new AbortController()
  controllers.set(message.id, controller)
  try {
    const doFetch = await getNativeFetch()
    const res = await doFetch(message.url, {
      method: message.method,
      headers: message.headers,
      body: message.body,
      signal: controller.signal,
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })
    post({
      type: 'net-head',
      id: message.id,
      status: res.status,
      statusText: res.statusText,
      headers,
    })
    const reader = res.body?.getReader()
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const bytes = value.slice().buffer as ArrayBuffer
        post({ type: 'net-chunk', id: message.id, bytes }, [bytes])
      }
    }
    post({ type: 'net-end', id: message.id })
  } catch (err) {
    if (!controller.signal.aborted) {
      post({
        type: 'net-error',
        id: message.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  } finally {
    controllers.delete(message.id)
  }
}

/** Handle one worker → main net message. Returns true when it was a net message. */
export function handleNetMessage(message: { type?: string }, post: Post): boolean {
  const msg = message as HubNetFromWorker
  if (msg.type === 'net-request') {
    void run(msg, post)
    return true
  }
  if (msg.type === 'net-abort') {
    controllers.get(msg.id)?.abort()
    controllers.delete(msg.id)
    return true
  }
  return false
}
