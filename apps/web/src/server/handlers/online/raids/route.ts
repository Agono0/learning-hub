/**
 * /api/online/raids — party boss raids against the REAL Cloudflare worker
 * (Durable Object). Mirrors the rooms route: proxy create → worker, return the
 * DO WebSocket URL, and fall back to an explicit offline flag so the UI can
 * label its local simulation honestly.
 */
import { z } from 'zod'
import { getDefaultOnlineServer, getOnlineIdentity } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { remoteFetch } from '@/server/net'

const createRaidSchema = z.object({
  bossKey: z.string().min(1).max(40).optional().default('chronos'),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createRaidSchema)
  const server = getDefaultOnlineServer()
  const identity = getOnlineIdentity()

  try {
    // remoteFetch → native HTTP bridge under Tauri (webview CORS-free).
    const res = await remoteFetch(`${server}/api/v1/raids/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bossKey: body.bossKey }),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; raidId: string; raid?: unknown }
      return Response.json({
        ok: true,
        offline: false,
        raidId: data.raidId,
        raid: data.raid ?? null,
        wsUrl: `${server.replace(/^http/, 'ws')}/api/v1/raids/${data.raidId}/ws`,
        userId: identity.userId,
        alias: identity.alias,
      })
    }
  } catch {
    // Worker unreachable — fall through to the honest offline response.
  }

  return Response.json({
    ok: true,
    offline: true,
    reason: 'worker-unreachable',
    alias: identity.alias,
  })
})
