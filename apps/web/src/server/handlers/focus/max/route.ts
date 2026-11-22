/**
 * /api/focus/max — Max Focus Mode session activation and lock status.
 *
 * GET: returns the current lock state, active allowlist, cooldown info and the
 * persisted M2-03 lock columns (state / tier / hardCapAt).
 * POST: initiates a deep commitment lock with a frozen allowlist snapshot and
 * the machine's starting phase — the row is stamped `state: 'locked'`, the
 * absolute 4h hard cap and, when the platform layer already knows it, the
 * enforcement tier (M2-03).
 */
import { z } from 'zod'
import { FOCUS_TIERS, maxFocusStartSchema } from '@learning-hub/core/focus-lock'
import { getActiveFocusLock, startMaxFocusSession } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

/** Start boundary — the core schema plus the optional enforcement tier. */
const startSchema = maxFocusStartSchema.extend({
  tier: z.enum(FOCUS_TIERS).optional(),
})

export const GET = withRoute(async () => {
  const lock = getActiveFocusLock()
  return Response.json({
    ok: true,
    ...lock,
    lock,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, startSchema)
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
