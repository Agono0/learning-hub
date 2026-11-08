/**
 * Outbound-network port for handlers (runtime-neutral; injected per target).
 *
 * On web this is the global fetch. Under the hub worker (native webview) the
 * worker installs the native HTTP bridge at boot (worker.ts — the SAME bridge
 * AI provider traffic uses), so remote calls from handlers are not subject to
 * webview CORS: `tauri-plugin-http` executes them in Rust. Handlers must never
 * call global `fetch` directly — the web target works, but native would
 * silently depend on the remote server sending permissive CORS headers
 * (MASTER-FIX-PLAN F-07).
 *
 * Injection follows the storage.ts port pattern: handlers import only these
 * functions; targets wire the implementation at boot.
 */
export type RemoteFetch = (url: string, init?: RequestInit) => Promise<Response>

let impl: RemoteFetch = (url, init) => fetch(url, init)

/** Install the target's outbound fetch (web: native fetch; hub worker: the native bridge). */
export function setRemoteFetch(next: RemoteFetch): void {
  impl = next
}

/** Outbound fetch for handlers — routes through the native bridge on Tauri. */
export function remoteFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  return impl(String(url), init)
}
