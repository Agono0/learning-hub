/**
 * /api/focus/max — Max Focus Mode session activation and lock status.
 *
 * GET: returns the current lock state, active allowlist, and cooldown info.
 * POST: initiates a deep commitment lock with a frozen allowlist snapshot.
 */
import { maxFocusStartSchema } from '@learning-hub/core/focus-lock'
import { getActiveFocusLock, startMaxFocusSession } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async () => {
  const lock = getActiveFocusLock()
  return Response.json({
    ok: true,
    ...lock,
    lock,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, maxFocusStartSchema)
  try {
    const result = startMaxFocusSession(body)
    return Response.json(
      {
        ok: true,
        session: result.session,
        lock: result.lock,
      },
      { status: 201 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isConflict = message.includes('already in progress')
    return Response.json({ ok: false, error: message }, { status: isConflict ? 409 : 400 })
  }
})
