/**
 * /api/focus/max/exit — Early exit state machine for Max Focus sessions.
 *
 * Implements a strict 60-second reflection delay, PIN verification (M2-02
 * vault, M2-04 handler) and friction event logging:
 * POST { action: 'request' }  — triggers the 60s cooldown.
 * POST { action: 'confirm', reflection, pin, vault } — confirms after the
 *   cooldown completes; the PIN is verified against the vault record with the
 *   core PBKDF2 `verifyPin`, so a reflection alone can never break the lock.
 *   Vault + PIN arrive per request — the vault is device-local by design
 *   (created once client-side via core `createPinVault`, kept in webview
 *   storage; M2-02's brief stores it outside the synced settings row).
 * POST { action: 'cancel' }   — aborts exit request, logging a resistance win.
 *
 * Failed PIN attempts are rate-limited in-memory per session (5 within 5
 * minutes → 429): pin.ts documents the handler as the rate-limit owner. This
 * is friction, not adversary resistance — the honest threat model lives in
 * docs/LIMITATIONS.md; the append-only friction log is the durable record.
 */
import { focusExitActionSchema, verifyPin } from '@learning-hub/core/focus-lock'
import {
  cancelMaxFocusEarlyExit,
  confirmMaxFocusEarlyExit,
  getActiveFocusLock,
  requestMaxFocusEarlyExit,
} from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** Failed PIN attempts allowed per session inside the window before 429. */
const MAX_PIN_ATTEMPTS = 5

/** Rolling window for the failed-attempt counter (ms). */
const PIN_ATTEMPT_WINDOW_MS = 5 * 60_000

/** sessionId → { count, windowStart } — process-local; a restart clears it. */
const failedPinAttempts = new Map<number, { count: number; windowStart: number }>()

function pinLockInfo(sessionId: number): { lockedOut: boolean; retryAfterSec: number } {
  const entry = failedPinAttempts.get(sessionId)
  if (!entry) return { lockedOut: false, retryAfterSec: 0 }
  if (Date.now() - entry.windowStart > PIN_ATTEMPT_WINDOW_MS) {
    failedPinAttempts.delete(sessionId)
    return { lockedOut: false, retryAfterSec: 0 }
  }
  return {
    lockedOut: entry.count >= MAX_PIN_ATTEMPTS,
    retryAfterSec: Math.ceil((entry.windowStart + PIN_ATTEMPT_WINDOW_MS - Date.now()) / 1000),
  }
}

function recordPinFailure(sessionId: number): void {
  const now = Date.now()
  const entry = failedPinAttempts.get(sessionId)
  if (!entry || now - entry.windowStart > PIN_ATTEMPT_WINDOW_MS) {
    failedPinAttempts.set(sessionId, { count: 1, windowStart: now })
    return
  }
  entry.count += 1
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, focusExitActionSchema)

  try {
    if (body.action === 'request') {
      const res = requestMaxFocusEarlyExit()
      return Response.json({ ok: true, lock: res.lock })
    }

    if (body.action === 'confirm') {
      // The PIN gate is mandatory: the exit handler owns verification; the
      // vault record itself stays on the device that created it.
      if (!body.pin || !body.vault) {
        throw new ApiError(400, 'PIN verification is required to confirm an early exit.')
      }
      const sessionId = getActiveFocusLock().sessionId ?? 0
      const lockInfo = pinLockInfo(sessionId)
      if (lockInfo.lockedOut) {
        return Response.json(
          {
            ok: false,
            error: `Too many failed PIN attempts — try again in ${lockInfo.retryAfterSec}s.`,
          },
          { status: 429, headers: { 'retry-after': String(lockInfo.retryAfterSec) } },
        )
      }

      const verified = await verifyPin(body.vault, body.pin)
      if (!verified) {
        recordPinFailure(sessionId)
        throw new ApiError(401, 'Incorrect PIN — the exit stays locked.')
      }
      failedPinAttempts.clear()

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
    if (err instanceof ApiError) throw err
    const message = err instanceof Error ? err.message : String(err)
    // The repo's reflection-gate refusal is a conflict, not a malformed body.
    const isConflict = message.includes('cooldown') || message.includes('Invalid early exit state')
    return Response.json({ ok: false, error: message }, { status: isConflict ? 409 : 400 })
  }
})
