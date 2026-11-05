/**
 * @learning-hub/ai-adapters — the single network seam for every provider.
 *
 * All outbound AI traffic goes through {@link networkFetch}. On Node it is the
 * global fetch. Runtimes where the global fetch is unsuitable (the Tauri hub
 * worker: webview CORS would block provider APIs) install their own with
 * {@link setNetworkFetch} before the first AI call — providers pick it up
 * lazily, so registration order does not matter.
 */
let impl: typeof fetch | null = null

/** Replace the fetch used by every AI provider (null restores the global fetch). */
export function setNetworkFetch(fn: typeof fetch | null): void {
  impl = fn
}

/** fetch-compatible function that always delegates to the current implementation. */
export const networkFetch: typeof fetch = (input, init) => (impl ?? globalThis.fetch)(input, init)
