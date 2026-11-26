/**
 * Learning HUB — headless REST server (Node 22+ native http, no web framework).
 *
 * Exposes the same brain as the web app and MCP server (packages/core +
 * packages/db) over plain JSON REST:
 *
 *   GET  /health          liveness + resolved DB path
 *   GET  /decks           decks with card/due/new counts
 *   GET  /cards           browse cards (?deckId=&due=1&limit=)
 *   POST /review          grade one card (executeReview)
 *   POST /review/batch    grade many cards atomically (executeBatchReview)
 *   GET  /today           due/new counts, today tallies, streak
 *   GET  /stats           retention, today tallies, 30-day forecast
 *   GET  /plugins         loaded plugin names + versions
 *
 * Config: LEARNING_HUB_PORT (default 3300), LEARNING_HUB_DB (packages/db
 * paths.ts), --host flag / LEARNING_HUB_HOST (default 127.0.0.1 — no auth, so
 * stay local), LEARNING_HUB_WEBHOOKS="event=url,…" (core event bus → HTTP POST).
 *
 * Run: npm run serve   (tsx apps/server/src/index.ts)
 */
import { createServer } from 'node:http'
import { loadPlugins } from '@learning-hub/core'
import { loadConfig } from './config'
import { isLoopbackBind, readGuardConfig, withGuard } from './guard'
import { dispatch, routes } from './routes'
import { setupWebhooks } from './webhooks'

/** Boot the server: load plugins, wire webhooks, then listen. */
async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2))

  // Importing @learning-hub/db creates the shared drizzle client and applies
  // the idempotent schema/views (LEARNING_HUB_DB is honored by paths.ts).
  const { resolveDbPath } = await import('@learning-hub/db')
  console.log(`[server] db: ${resolveDbPath()}`)

  // Load plugins exactly like the other hosts do — core's loader scans the
  // repo-root plugins/ dir, isolates failures, never rejects.
  await loadPlugins(['plugins'])

  const webhooks = setupWebhooks(process.env.LEARNING_HUB_WEBHOOKS)

  const guard = { ...readGuardConfig(process.env), exposed: !isLoopbackBind(config.host) }
  if (guard.exposed && !guard.token) {
    console.warn(
      guard.allowUnauthenticated
        ? '[server] WARNING: listening beyond loopback with no LEARNING_HUB_API_TOKEN and ' +
            'LEARNING_HUB_ALLOW_UNAUTHENTICATED set: anyone who can reach this port can read and write your data.'
        : '[server] listening beyond loopback with no LEARNING_HUB_API_TOKEN: requests without an Origin ' +
            'header (curl, scripts) are refused with 401. Set a token (see docs/api-server.md).',
    )
  }

  const server = createServer(
    withGuard((req, res) => {
      dispatch(req, res).catch((err) => {
        console.error('[server] dispatch crashed:', err)
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'Internal error' }))
        }
      })
    }, guard),
  )

  server.on('error', (err) => {
    console.error('[server] fatal:', err)
    process.exit(1)
  })

  server.listen(config.port, config.host, () => {
    console.log(
      `[server] learning-hub REST API on http://${config.host}:${config.port} (${routes.length} routes, ${webhooks.subscribed} webhook(s))`,
    )
  })

  const shutdown = (signal: string) => {
    console.log(`\n[server] ${signal} received — closing`)
    server.close(() => process.exit(0))
    // Force-exit if open keep-alives block a clean close.
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[server] fatal:', err)
  process.exit(1)
})
