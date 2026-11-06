/**
 * /api/focus/allowlists — Allowlist presets for Max Focus mode.
 */
import { focusAllowlistInputSchema } from '@learning-hub/core/focus-lock'
import { createFocusAllowlist, listFocusAllowlists } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async () => {
  const allowlists = listFocusAllowlists()
  return Response.json({ ok: true, allowlists })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, focusAllowlistInputSchema)
  try {
    const created = createFocusAllowlist(body)
    return Response.json({ ok: true, allowlist: created }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 400 })
  }
})
