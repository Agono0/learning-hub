'use client'

/**
 * MaxFocusReportCard — the post-session report for sessions that ended by
 * CAP (timer) or BATTERY — the endings the user did not choose (M2-34).
 *
 * Data sources (both feed the same internal state, first-wins until
 * dismissal):
 * - the native bridge event `max-focus://released` (M2-23, Tauri shells);
 * - a window CustomEvent `lh:max-focus-report` (detail:
 *   {@link MaxFocusReportData}) for web hosts and the future server-side
 *   session history handler (M2-04) — the component stays the single
 *   presentation point.
 *
 * Calm by law: a quiet card, no confetti (that is the session-complete
 * moment, a different event), honest reason copy, one dismiss action. User
 * exits (reason `pin`) never show a report card — the exit flow (M2-18) is
 * already the closure.
 */
import { useEffect, useState } from 'react'
import { BatteryLow, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/ui'

/** One ended-session report. */
export interface MaxFocusReportData {
  /** Why the session ended: `timer` (cap/planned end) or `battery`. */
  reason: 'timer' | 'battery'
  /** Session id for correlation with history (M2-25). */
  sessionId?: string
  /** Wall-clock session start (epoch ms) — duration is derived. */
  startedAtMs?: number
  /** Wall-clock session end (epoch ms). */
  endedAtMs?: number
  /** Planned session minutes, when known. */
  plannedMinutes?: number
}

export const MAX_FOCUS_REPORT_EVENT = 'lh:max-focus-report'

/** Minutes between start and end, when both are present and sane. */
export function reportDurationMinutes(data: MaxFocusReportData): number | null {
  if (data.startedAtMs === undefined || data.endedAtMs === undefined) return null
  const ms = data.endedAtMs - data.startedAtMs
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.round(ms / 60_000)
}

export function MaxFocusReportCard() {
  const [report, setReport] = useState<MaxFocusReportData | null>(null)

  useEffect(() => {
    let disposed = false
    const onWindowEvent = (event: Event) => {
      if (disposed) return
      const detail = (event as CustomEvent<MaxFocusReportData>).detail
      if (detail && (detail.reason === 'timer' || detail.reason === 'battery')) {
        setReport(detail)
      }
    }
    window.addEventListener(MAX_FOCUS_REPORT_EVENT, onWindowEvent)

    // Native bridge: the Rust layer emits max-focus://released on session end.
    let unlisten: (() => void) | undefined
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        if (disposed) return
        unlisten = await listen<{ reason?: string; sessionId?: string }>(
          'max-focus://released',
          (event) => {
            const reason = event.payload?.reason
            if (reason === 'timer' || reason === 'battery') {
              setReport({ reason, sessionId: event.payload?.sessionId })
            }
          },
        )
      } catch {
        // Non-Tauri host — the window event path covers it.
      }
    })()

    return () => {
      disposed = true
      window.removeEventListener(MAX_FOCUS_REPORT_EVENT, onWindowEvent)
      unlisten?.()
    }
  }, [])

  if (!report) return null

  const minutes = reportDurationMinutes(report)
  const byBattery = report.reason === 'battery'

  return (
    <section
      role="status"
      aria-label="Max Focus session ended"
      className="relative rounded-xl border border-neutral-200 bg-white p-4 pr-10 dark:border-(--hub-border) dark:bg-(--hub-panel)"
    >
      <div className="flex items-start gap-3">
        {byBattery ? (
          <BatteryLow
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-status-warning-text"
            aria-hidden
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-status-success-text"
            aria-hidden
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong">
            {byBattery ? 'Session ended early — low battery' : 'Session complete'}
          </p>
          <p className="mt-1 text-sm text-secondary">
            {byBattery
              ? 'The battery was running low, so Max Focus let go to protect your device. Your progress is saved — you can start again any time.'
              : minutes !== null
                ? `You stayed for the full ${minutes} minute${minutes === 1 ? '' : 's'}. Deep work banked — pick your next move when ready.`
                : 'You stayed for the whole session. Deep work banked — pick your next move when ready.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setReport(null)}
        aria-label="Dismiss session report"
        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-neutral-100 hover:text-strong focus-visible:ring-2 focus-visible:ring-(--ac-strong) dark:hover:bg-(--hub-panel-2) [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      {/* Keep the dismiss action reachable as a button too (law: ≥44px touch). */}
      <div className="mt-3">
        <Button variant="ghost" onClick={() => setReport(null)}>
          Done
        </Button>
      </div>
    </section>
  )
}
