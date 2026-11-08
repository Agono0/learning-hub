/**
 * /api/online/buddies — Accountability buddies & inbox notifications.
 */
import { z } from 'zod'
import {
  addInboxMessage,
  getOnlineIdentity,
  listInboxMessages,
  markInboxRead,
} from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const buddyActionSchema = z.object({
  action: z.enum(['nudge', 'invite', 'mark_read']),
  id: z.number().int().optional(),
  targetAlias: z.string().min(1).max(40).optional(),
  message: z.string().max(280).optional(),
})

export const GET = withRoute(async () => {
  const messages = listInboxMessages(30)
  return Response.json({ ok: true, messages })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, buddyActionSchema)
  const identity = getOnlineIdentity()

  if (body.action === 'mark_read') {
    if (!body.id) throw new ApiError(400, 'id required to mark read')
    if (!markInboxRead(body.id)) throw new ApiError(404, 'message not found')
    return Response.json({ ok: true })
  }

  const defaultMsg =
    body.action === 'nudge'
      ? `${identity.alias} sent you a study nudge! Keep your streak alive today.`
      : `${identity.alias} invited you to join a collaborative study room.`

  const created = addInboxMessage({
    kind: body.action,
    senderAlias: identity.alias,
    content: body.message || defaultMsg,
    meta: { targetAlias: body.targetAlias },
  })

  return Response.json({ ok: true, message: created })
})
