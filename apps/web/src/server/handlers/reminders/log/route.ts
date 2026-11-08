/**
 * /api/reminders/log — Append-only audit trail of dispatched reminders.
 */
import { z } from 'zod'
import { listRecentReminderLogs, logReminderSent, reminderEngagement } from '@learning-hub/db'
import { REMINDER_KINDS, type ReminderKind } from '@learning-hub/core/reminders'
import { readJson, withRoute } from '@/lib/api'

const logReminderSchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  actionUrl: z.string().max(500).optional(),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const logs = listRecentReminderLogs(limit)
  // Engagement (F-08④): clicks vs sends over the trailing week — both tables
  // are append-only, so this is a pure read.
  const engagement = reminderEngagement(7)
  return Response.json({ ok: true, logs, engagement })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, logReminderSchema)
  const row = logReminderSent({
    kind: body.kind as ReminderKind,
    title: body.title,
    body: body.body,
    actionUrl: body.actionUrl,
  })

  return Response.json({ ok: true, logged: row })
})
