'use client'

import { useEffect, useState } from 'react'
import type { CardCoverage } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, Callout } from '@/ui'
import { APPLIED_KEY, pct, type AppliedRecord } from './types'

interface SettingsRes {
  settings: { desiredRetention: number }
}

async function currentGlobal(): Promise<number> {
  const res = await apiGet<SettingsRes>('/api/settings')
  return res.settings.desiredRetention
}

/**
 * Applies a desired retention to the global setting through the existing
 * settings endpoint, only after an explicit confirm. No reschedule, no weights.
 */
export function ApplyPanel({
  candidate,
  coverage,
  baseline,
  fingerprint,
}: {
  candidate: number | null
  coverage: CardCoverage
  /** Retention the model run started from. */
  baseline: number
  /** Fingerprint of the inputs the run read. */
  fingerprint: string
}) {
  const [now, setNow] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null)
  const [record, setRecord] = useState<AppliedRecord | null>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(APPLIED_KEY)
      if (raw) setRecord(JSON.parse(raw) as AppliedRecord)
    } catch {
      /* ignore corrupt record */
    }
    currentGlobal()
      .then(setNow)
      .catch(() => setNow(null))
  }, [])

  async function apply() {
    if (candidate === null) return
    setBusy(true)
    setMessage(null)
    try {
      const before = await currentGlobal()
      if (Math.abs(before - baseline) > 1e-9) {
        setNow(before)
        setConfirming(false)
        setMessage({
          tone: 'danger',
          text: `The setting is now ${pct(before)}, but this model started from ${pct(baseline)}. Nothing was changed. Run the model again.`,
        })
        return
      }
      const check = await apiSend<{ fingerprint: string }>('/api/retention-planner', 'POST', {
        fingerprintOnly: true,
      })
      if (check.fingerprint !== fingerprint) {
        setConfirming(false)
        setMessage({
          tone: 'danger',
          text: 'Your cards, weights or retention changed since this model ran. Nothing was changed. Run the model again.',
        })
        return
      }
      await apiSend('/api/settings', 'PUT', { desiredRetention: candidate })
      const rec: AppliedRecord = {
        applied: candidate,
        previous: before,
        at: new Date().toISOString(),
      }
      window.localStorage.setItem(APPLIED_KEY, JSON.stringify(rec))
      setRecord(rec)
      setNow(candidate)
      setConfirming(false)
      setMessage({
        tone: 'accent',
        text: `Global retention is now ${pct(candidate)}. You can restore the previous value.`,
      })
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not apply.' })
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    if (!record) return
    setBusy(true)
    setMessage(null)
    try {
      const live = await currentGlobal()
      if (Math.abs(live - record.applied) > 1e-9) {
        setMessage({
          tone: 'danger',
          text: `Not restored: the setting is now ${pct(live)}, not the ${pct(record.applied)} this planner applied. Something else changed it, so nothing was overwritten.`,
        })
        return
      }
      await apiSend('/api/settings', 'PUT', { desiredRetention: record.previous })
      window.localStorage.removeItem(APPLIED_KEY)
      setRecord(null)
      setNow(record.previous)
      setMessage({ tone: 'accent', text: `Restored global retention to ${pct(record.previous)}.` })
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not restore.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="rp-apply" className="space-y-3 text-sm" data-testid="rp-apply">
      <h2 id="rp-apply" className="text-base font-semibold">
        Apply (optional)
      </h2>
      <p className="text-tertiary">
        Changes the global desired retention only, which affects how future intervals are
        calculated. Cards already scheduled keep their due dates until their next review. A deck
        with its own override keeps that override. A learner-profile preset can set this value again
        later, and its saved snapshot will not match. Nothing here reschedules cards or touches
        weights.
      </p>
      <p data-testid="rp-apply-scope">
        This is a global setting only. Cards in decks that have their own retention or weights are
        left out of the model ({coverage.excludedOwnSettings.toLocaleString()} cards), because the
        global setting does not govern them and this change will not touch those decks. The number
        is based on {coverage.eligible.toLocaleString()} Review-state cards;{' '}
        {coverage.excludedNew.toLocaleString()} new, {coverage.excludedLearning.toLocaleString()}{' '}
        learning, {coverage.excludedRelearning.toLocaleString()} relearning and{' '}
        {coverage.excludedSuspended.toLocaleString()} suspended cards are not in it.
      </p>
      <p>
        Global retention now: <strong>{now === null ? 'unknown' : pct(now)}</strong>
      </p>
      {candidate !== null && now !== null && Math.abs(now - baseline) > 1e-9 ? (
        <Callout tone="warning">
          The live setting ({pct(now)}) differs from the {pct(baseline)} this model started from.
          Run the model again before applying.
        </Callout>
      ) : null}
      {candidate !== null && !confirming ? (
        <Button
          variant="secondary"
          onClick={() => setConfirming(true)}
          disabled={busy || now === candidate || (now !== null && Math.abs(now - baseline) > 1e-9)}
        >
          Review change to {pct(candidate)}
        </Button>
      ) : null}
      {candidate !== null && confirming ? (
        <div role="group" aria-label="Confirm change" className="space-y-2">
          <p>
            Change global desired retention from{' '}
            <strong>{now === null ? 'its current value' : pct(now)}</strong> to{' '}
            <strong>{pct(candidate)}</strong>?
          </p>
          <div className="flex gap-2">
            <Button onClick={apply} disabled={busy}>
              Confirm and apply
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {record ? (
        <div className="space-y-2" data-testid="rp-restore">
          <p>
            Applied {pct(record.applied)} on {new Date(record.at).toLocaleString()}. Previous value
            was {pct(record.previous)}.
          </p>
          <Button variant="secondary" onClick={restore} disabled={busy}>
            Restore {pct(record.previous)}
          </Button>
        </div>
      ) : null}
      {message ? (
        <Callout tone={message.tone === 'danger' ? 'danger' : 'accent'}>{message.text}</Callout>
      ) : null}
    </section>
  )
}
