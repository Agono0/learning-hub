/**
 * /api/focus/max/extend — extend a running Max Focus session (M2-04).
 *
 * POST { extraMinutes } — pushes the planned end out, clamped to the absolute
 * hard cap (4h, the locked Phase-1 decision). Refused while an early-exit is
 * pending: extending mid-reflection would let a session outrun its own gate.
 * The math lives in the repo (`extendMaxFocusSession`) so the web handler,
 * MCP and CLI share one extension rule.
 */
import { maxSessionExtendSchema } from '@learning-hub/core/focus-lock'
import { extendMaxFocusSession } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, maxSessionExtendSchema)
  try {
    const result = extendMaxFocusSession(body.extraMinutes)
    return Response.json({
      ok: true,
      session: result.session,
      lock: result.lock,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isConflict = /No active Max Focus|exit is pending/.test(message)
    return Response.json({ ok: false, error: message }, { status: isConflict ? 409 : 400 })
  }
})
