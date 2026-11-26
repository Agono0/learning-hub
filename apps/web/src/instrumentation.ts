/**
 * Next.js instrumentation hook. On the Node server runtime only, register the connect-time
 * pinned fetch for bounded URL fetches (calendar import, article ingest). The dynamic import
 * keeps `node:` modules out of the edge, browser and Tauri static-export bundles.
 *
 * Lives in `src/` because the app uses a src directory (Next ignores a root-level file then).
 * bounded-fetch ALSO fails closed on any Node runtime with no pinned fetch registered, so a
 * missing or failed registration cannot silently fall back to the global fetch.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const [{ setPinnedFetch }, { createPinnedNodeFetch }] = await Promise.all([
    import('./server/bounded-fetch'),
    import('./server/pinned-fetch-node'),
  ])
  setPinnedFetch(createPinnedNodeFetch())
}
