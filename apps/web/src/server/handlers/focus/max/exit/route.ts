/**
 * /api/focus/max/exit — Early exit state machine for Max Focus sessions.
 *
 * Implements a strict 60-second reflection delay and friction event logging.
 * POST { action: 'request' }  — triggers the 60s cooldown.
 * POST { action: 'confirm', reflection } — confirms after cooldown completes.
 * POST { action: 'cancel' }   — aborts exit request, logging a resistance win.
 */
import { focusExitActionSchema } from '@learning-hub/core/focus-lock'
import {
  cancelMaxFocusEarlyExit,
  confirmMaxFocusEarlyExit,
  requestMaxFocusEarlyExit,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, focusExitActionSchema)

  try {
    if (body.action === 'request') {
      const res = requestMaxFocusEarlyExit()
      return Response.json({ ok: true, lock: res.lock })
    }

    if (body.action === 'confirm') {
      const res = confirmMaxFocusEarlyExit(body.reflection)
      return Response.json({
        ok: true,
        session: res.session,
        lock: res.lock,
      })
    }

    if (body.action === 'cancel') {
      const res = cancelMaxFocusEarlyExit()
      return Response.json({ ok: true, lock: res.lock })
    }

    return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 400 })
  }
})
