/**
 * Learning HUB headless server — SYSTEM routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveDbPath } from '@learning-hub/db'
import { listPlugins } from '@learning-hub/core'
import { sendJson } from '../http'
import type { Route } from './shared'

/** GET /health — liveness + resolved DB path. */
async function health(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    ok: true,
    name: 'learning-hub-server',
    version: '0.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    db: resolveDbPath(),
  })
}

/** GET /decks — decks with card/due/new counts (same query as the web app). */
/** GET /plugins — names + versions of the plugins loaded at boot (core registry). */
async function plugins(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    ok: true,
    plugins: listPlugins().map((entry) => ({
      name: entry.plugin.name,
      version: entry.plugin.version,
      description: entry.plugin.description ?? null,
      source: entry.source,
    })),
  })
}

/** POST /cognitive/generation/challenge — creates a 4-tier generation challenge. */

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const systemRoutes: Route[] = [
  {
    method: 'GET',
    path: '/health',
    summary: 'liveness + resolved DB path',
    handler: health,
  },
  {
    method: 'GET',
    path: '/plugins',
    summary: 'loaded plugin names + versions',
    handler: plugins,
  },
]
