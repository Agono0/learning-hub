/**
 * /api/push — web-push plumbing for the reminder engine.
 *
 * GET  → the VAPID public key (from $VAPID_PUBLIC_KEY; null when unset — the
 *        Settings panel then explains how to enable push).
 * POST → store/refresh this browser's subscription ({ endpoint, keys }).
 * DELETE (?endpoint=) → remove a subscription.
 */
import { z } from 'zod'
import { deletePushSubscription, savePushSubscription } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    supportedHint:
      'Push delivery runs from the headless server (apps/server) with VAPID_PRIVATE_KEY set.',
  })
})

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, subscribeSchema)
  savePushSubscription({ endpoint: body.endpoint, keys: body.keys })
  return Response.json({ ok: true })
})

export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const endpoint = url.searchParams.get('endpoint')
  if (!endpoint) {
    return Response.json({ ok: false, error: 'endpoint required' }, { status: 400 })
  }
  return Response.json({ ok: true, removed: deletePushSubscription(endpoint) })
})
