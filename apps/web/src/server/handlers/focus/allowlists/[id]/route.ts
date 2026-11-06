/**
 * /api/focus/allowlists/:id — Allowlist preset updates and deletion.
 */
import { focusAllowlistInputSchema } from '@learning-hub/core/focus-lock'
import { deleteFocusAllowlist, updateFocusAllowlist } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const PUT = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const numId = Number(id)
  if (!numId) return Response.json({ ok: false, error: 'Invalid id' }, { status: 400 })

  const body = await readJson(req, focusAllowlistInputSchema.partial())
  const updated = updateFocusAllowlist(numId, body)
  if (!updated) {
    return Response.json({ ok: false, error: 'Allowlist not found' }, { status: 404 })
  }
  return Response.json({ ok: true, allowlist: updated })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const numId = Number(id)
  if (!numId) return Response.json({ ok: false, error: 'Invalid id' }, { status: 400 })

  const deleted = deleteFocusAllowlist(numId)
  if (!deleted) {
    return Response.json({ ok: false, error: 'Allowlist not found' }, { status: 404 })
  }
  return Response.json({ ok: true })
})
