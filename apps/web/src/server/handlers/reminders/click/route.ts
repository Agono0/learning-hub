/**
 * /api/reminders/click — Append-only record of user interactions with reminders.
 */
import { z } from 'zod'
import { recordReminderClick } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const clickReminderSchema = z.object({
  reminderLogId: z.number().int().positive().optional(),
  kind: z.string().max(80).optional(),
  actionUrl: z.string().max(500).optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, clickReminderSchema)
  const row = recordReminderClick({
    reminderLogId: body.reminderLogId,
    kind: body.kind,
    actionUrl: body.actionUrl,
  })

  return Response.json({ ok: true, clicked: row })
})
