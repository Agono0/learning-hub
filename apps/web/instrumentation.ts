/**
 * Next.js instrumentation hook. On the Node server runtime only, register the connect-time
 * pinned fetch for bounded URL fetches (calendar import, article ingest). The dynamic import
 * keeps `node:` modules out of the edge, browser and Tauri static-export bundles.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const [{ setPinnedFetch }, { createPinnedNodeFetch }] = await Promise.all([
    import('./src/server/bounded-fetch'),
    import('./src/server/pinned-fetch-node'),
  ])
  setPinnedFetch(createPinnedNodeFetch())
}
