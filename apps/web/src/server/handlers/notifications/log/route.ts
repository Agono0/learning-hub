/**
 * /api/notifications/log — append-only delivery ledger.
 *
 * GET: history feed for the Notification Center (delivered AND suppressed,
 * newest first). POST: record one delivery decision (the pure policy in
 * `@learning-hub/core/notification-center` decided; the client reports the
 * outcome). The ledger is append-only — there is no update/delete path.
 */
import { queryLimit } from '@/lib/query-params'
import { notificationLogEntrySchema } from '@learning-hub/core/notification-center'
import { listNotificationLog, logNotification } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = queryLimit(url.searchParams, 50, 200)
  const entries = listNotificationLog(limit)
  return Response.json({ ok: true, entries })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, notificationLogEntrySchema)
  logNotification(body)
  return Response.json({ ok: true })
})
