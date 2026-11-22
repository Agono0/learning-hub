'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { createPinVault, pinVaultSchema, type PinVault } from '@learning-hub/core'
import { apiSend } from '@/lib/transport'
import { Button, Callout, TextArea, TextField } from '@/ui'

/**
 * The subset of GET /api/focus/max's lock payload the gate needs. Kept
 * structural (not imported from the page) so tests and the extension bridge
 * can feed a lock object without dragging the page in.
 */
export interface MaxFocusExitGateLock {
  exitState: 'none' | 'locked' | 'cooldown' | 'can_confirm' | 'ended'
  cooldownRemainingSec: number
}

/**
 * Device-local PIN vault storage (M2-18 wiring of the M2-02 vault). The vault
 * never leaves the device that created it — consistent with the Max Focus
 * resume contract (`core/focus-lock/resume.ts`), where the session's secrets
 * live in webview storage; the exit handler verifies each confirm request
 * against the vault supplied with it (M2-04).
 */
export const MAX_FOCUS_PIN_VAULT_KEY = 'lh:max-focus-pin-vault'

/** Read + validate the device-held vault; any corruption reads as "no vault". */
export function readMaxFocusPinVault(): PinVault | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MAX_FOCUS_PIN_VAULT_KEY)
    if (!raw) return null
    const parsed = pinVaultSchema.safeParse(JSON.parse(raw) as unknown)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeMaxFocusPinVault(vault: PinVault): void {
  try {
    window.localStorage.setItem(MAX_FOCUS_PIN_VAULT_KEY, JSON.stringify(vault))
  } catch {
    /* storage unavailable — the gate falls back to per-session setup */
  }
}

/**
 * Early-exit flow for a running Max Focus session (M2-18): the mandatory
 * 60-second reflection cooldown, first-use PIN setup, PIN entry and a reason
 * of at least 20 characters — then POST /api/focus/max/exit, whose handler
 * re-verifies the PIN and appends the friction record.
 *
 * Rendered by the focus page inside the active-lock panel; it drives the
 * whole request → cooldown → confirm arc from the lock's `exitState` and
 * calls {@link MaxFocusExitGateProps.onChanged} after every successful POST
 * so the parent refetches the lock. Renders nothing without a lock (SSR-safe:
 * device-local storage is only touched in effects).
 */
export function MaxFocusExitGate({
  lock,
  onChanged,
  onExited,
}: {
  lock: MaxFocusExitGateLock | null
  /** Called after every POST (request / confirm / cancel) — the parent refetches the lock. */
  onChanged?: () => void
  /** Called ONLY after a confirmed exit succeeded — the parent releases native locks. */
  onExited?: () => void
}) {
  const [vault, setVault] = useState<PinVault | null>(null)
  const [vaultChecked, setVaultChecked] = useState(false)
  const [setupPin, setSetupPin] = useState('')
  const [setupPin2, setSetupPin2] = useState('')
  const [pin, setPin] = useState('')
  const [reflection, setReflection] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unmounted = useRef(false)

  useEffect(() => {
    unmounted.current = false
    setVault(readMaxFocusPinVault())
    setVaultChecked(true)
    return () => {
      unmounted.current = true
    }
  }, [])

  const send = useCallback(
    async (action: 'request' | 'confirm' | 'cancel', body?: Record<string, unknown>) => {
      setPending(true)
      setError(null)
      try {
        const res = await apiSend<{ ok: boolean; error?: string }>('/api/focus/max/exit', 'POST', {
          action,
          ...body,
        })
        if (!res.ok && res.error) setError(res.error)
        if (action === 'confirm' && res.ok) onExited?.()
        onChanged?.()
      } catch (err) {
        if (!unmounted.current) {
          setError(err instanceof Error ? err.message : 'The exit request failed — try again.')
        }
      } finally {
        if (!unmounted.current) setPending(false)
      }
    },
    [onChanged, onExited],
  )

  if (!lock || lock.exitState === 'none' || lock.exitState === 'ended') return null

  // ── Step 1: the locked session — only the request affordance shows. ──
  if (lock.exitState === 'locked') {
    return (
      <div className="pt-2">
        <Button
          variant="ghost"
          className="border border-rose-500/30 text-xs text-danger-text hover:bg-rose-500/10"
          disabled={pending}
          onClick={() => void send('request')}
        >
          Request early exit — starts a 60-second reflection
        </Button>
      </div>
    )
  }

  // ── Step 2: cooldown — the reflection timer, plus the resistance win. ──
  if (lock.exitState === 'cooldown') {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
        <div className="flex items-center gap-2 text-sm font-semibold text-status-warning-text">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Early exit cooldown: {lock.cooldownRemainingSec}s remaining
        </div>
        <p className="text-xs text-tertiary">
          Take a slow breath. Ulysses contracts separate sudden impulses from deliberate actions.
        </p>
        <Button
          variant="primary"
          className="w-full text-xs font-semibold"
          disabled={pending}
          onClick={() => void send('cancel')}
        >
          Resist impulse and return to focus
        </Button>
      </div>
    )
  }

  // ── Step 3a: first use — set the PIN that will gate this and future exits. ──
  if (!vault) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4 text-left">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <ShieldCheck className="h-4 w-4 text-status-success-text" />
          {vaultChecked ? 'Set your exit PIN (first use)' : 'Checking PIN setup…'}
        </div>
        {vaultChecked && (
          <>
            <p className="text-xs text-tertiary">
              Exiting early requires this PIN plus a written reason — stored only on this device.
            </p>
            <TextField
              label="Exit PIN (4–12 digits)"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={setupPin}
              onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            />
            <TextField
              label="Repeat the PIN"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={setupPin2}
              onChange={(e) => setSetupPin2(e.target.value.replace(/\D/g, '').slice(0, 12))}
              error={
                setupPin2.length > 0 && setupPin2 !== setupPin ? 'PINs do not match yet' : undefined
              }
            />
            <Button
              variant="primary"
              className="w-full text-xs font-semibold"
              disabled={pending || !/^\d{4,12}$/.test(setupPin) || setupPin !== setupPin2}
              onClick={() => {
                void (async () => {
                  setPending(true)
                  try {
                    const created = await createPinVault({ pin: setupPin })
                    writeMaxFocusPinVault(created)
                    setVault(created)
                    setSetupPin('')
                    setSetupPin2('')
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not set the PIN.')
                  } finally {
                    setPending(false)
                  }
                })()
              }}
            >
              Save PIN and continue
            </Button>
            {error && (
              <p className="text-xs text-danger-text" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Step 3b: cooldown complete — PIN + mandatory reason → logged exit. ──
  const reasonReady = reflection.trim().length >= 20
  const pinReady = /^\d{4,12}$/.test(pin)
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-left">
      <div className="flex items-center gap-2 text-sm font-semibold text-danger-text">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Cooldown complete — verify to end the session
      </div>
      <TextArea
        label="Why are you breaking focus? (minimum 20 characters)"
        placeholder="Name the impulse and what you will do instead — this is logged to your friction history."
        value={reflection}
        onChange={(e) => setReflection(e.target.value)}
        maxLength={500}
      />
      <TextField
        label="Exit PIN"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
      />
      {error && (
        <Callout tone="danger" title="Exit refused">
          {error}
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          className="flex-1 text-xs font-semibold"
          disabled={pending || !reasonReady || !pinReady}
          onClick={() =>
            void send('confirm', {
              reflection: reflection.trim(),
              pin,
              vault,
            })
          }
        >
          Confirm early exit
        </Button>
        <Button
          variant="ghost"
          className="text-xs"
          disabled={pending}
          onClick={() => {
            setPin('')
            setReflection('')
            void send('cancel')
          }}
        >
          Cancel and stay
        </Button>
      </div>
    </div>
  )
}

export default MaxFocusExitGate
