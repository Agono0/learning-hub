'use client'

/**
 * Permission Center — one calm screen that answers: "which capabilities does
 * Learning HUB have, what breaks without each, and how do I grant one?"
 *
 * Every card derives its copy from `PERMISSION_CATALOG` (single source of
 * truth), its live status from `usePermissionSnapshot`, and its actions from
 * the user's device-local decision record. Denied is a supported state, never
 * an error: manual capabilities get numbered OS-settings steps in a Sheet.
 *
 * Accessibility: status changes are announced via an aria-live region,
 * every control is ≥ 44px on coarse pointers, status is never conveyed by
 * color alone (icon + text on every badge).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  CircleHelp,
  Clock,
  ExternalLink,
  ShieldCheck,
  ShieldOff,
  XCircle,
} from 'lucide-react'
import {
  PERMISSION_CATALOG,
  PERMISSION_IDS,
  isActionable,
  isSettled,
  permissionReadiness,
  permissionSummaryLine,
  type PermissionId,
  type PermissionStatus,
} from '@learning-hub/core/permissions'
import { Badge, Button, Callout, ProgressBar, Sheet } from '@/ui'
import { useRequestPermission, usePermissionPrefs, usePermissionSnapshot } from '@/lib/use-permissions'
import { currentPlatform, sendTestNotification } from '@/platform/permissions'

/** Status → badge tone, icon and text (icon+text so color is never the only signal). Exported for the wiring-contract test. */
export const STATUS_PRESENTATION: Record<
  PermissionStatus,
  { tone: 'success' | 'danger' | 'accent' | 'neutral' | 'warning'; icon: LucideIcon; label: string }
> = {
  granted: { tone: 'success', icon: CheckCircle2, label: 'Granted' },
  denied: { tone: 'danger', icon: XCircle, label: 'Denied' },
  undetermined: { tone: 'accent', icon: CircleHelp, label: 'Not asked yet' },
  manual: { tone: 'warning', icon: ShieldOff, label: 'Check in OS settings' },
  unsupported: { tone: 'neutral', icon: CircleHelp, label: 'Not on this platform' },
}

export function PermissionCenter() {
  const snapshot = usePermissionSnapshot()
  const { prefs, decide, reset } = usePermissionPrefs()
  const requestPermission = useRequestPermission()

  const [pendingId, setPendingId] = useState<PermissionId | null>(null)
  const [stepsFor, setStepsFor] = useState<PermissionId | null>(null)
  const [announce, setAnnounce] = useState('')
  const [testing, setTesting] = useState(false)
  /** Permissions whose status changed since the last render — drives the live region. */
  const prevStatuses = useRef<Partial<Record<PermissionId, PermissionStatus>>>({})

  const platform = useMemo(() => currentPlatform(), [])
  const readiness = useMemo(
    () => (snapshot.data ? permissionReadiness(snapshot.data) : null),
    [snapshot.data],
  )

  // Announce status transitions politely (e.g. after returning from OS settings).
  useEffect(() => {
    if (!snapshot.data) return
    for (const id of PERMISSION_IDS) {
      const next = snapshot.data[id]
      const prev = prevStatuses.current[id]
      if (next && prev && prev !== next) {
        setAnnounce(
          next === 'granted'
            ? `${PERMISSION_CATALOG[id].title} granted.`
            : `${PERMISSION_CATALOG[id].title} is now ${STATUS_PRESENTATION[next].label.toLowerCase()}.`,
        )
      }
      prevStatuses.current[id] = next
    }
  }, [snapshot.data])

  const grant = async (id: PermissionId) => {
    setPendingId(id)
    try {
      decide(id, 'ask_now')
      const status = await requestPermission(id)
      setAnnounce(
        status === 'granted'
          ? `${PERMISSION_CATALOG[id].title} granted.`
          : status === 'denied'
            ? `${PERMISSION_CATALOG[id].title} was not granted — you can allow it in your system settings.`
            : `${PERMISSION_CATALOG[id].title} needs to be granted in your system settings.`,
      )
    } finally {
      setPendingId(null)
    }
  }

  const runTestNotification = async () => {
    setTesting(true)
    try {
      const ok = await sendTestNotification()
      setAnnounce(ok ? 'Test notification sent.' : 'Could not deliver the test notification.')
    } finally {
      setTesting(false)
    }
  }

  if (snapshot.isError) {
    return (
      <Callout tone="danger" title="Couldn't read device permissions">
        Your browser or webview blocked the permission query. Reload the page to try again —
        your data is unaffected.
      </Callout>
    )
  }

  return (
    <div className="space-y-4">
      {/* Screen-reader announcements for status transitions / action results. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announce}
      </p>

      {/* Readiness summary */}
      <div className="panel">
        {readiness ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Device readiness</h2>
                <p className="mt-0.5 text-xs text-tertiary" suppressHydrationWarning>
                  {permissionSummaryLine(snapshot.data!)}
                </p>
              </div>
              <ShieldCheck
                className={`h-6 w-6 shrink-0 ${readiness.grantedCount === readiness.applicableCount ? 'text-emerald-600' : 'text-tertiary'}`}
                aria-hidden
              />
            </div>
            <ProgressBar
              value={readiness.applicableCount > 0 ? readiness.grantedCount / readiness.applicableCount : 1}
              className="mt-3"
              label={`${readiness.grantedCount} of ${readiness.applicableCount} permissions granted`}
            />
            {readiness.blockedFeatures.length > 0 && (
              <p className="mt-2 text-xs text-tertiary">
                Currently limited: {readiness.blockedFeatures.join(', ')}.
              </p>
            )}
          </>
        ) : (
          <div aria-hidden className="animate-pulse space-y-2">
            <div className="h-4 w-32 rounded bg-neutral-200/80 dark:bg-(--hub-panel-2)" />
            <div className="h-2 w-full rounded bg-neutral-200/80 dark:bg-(--hub-panel-2)" />
          </div>
        )}
      </div>

      {/* One card per catalog permission */}
      {PERMISSION_IDS.map((id) => {
        const def = PERMISSION_CATALOG[id]
        const status = snapshot.data?.[id] ?? 'undetermined'
        const presentation = STATUS_PRESENTATION[status]
        const busy = pendingId === id
        const decision = prefs.decisions[id]

        return (
          <section key={id} className="panel" aria-labelledby={`perm-${id}-title`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 id={`perm-${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
                  {def.title}
                  <Badge
                    tone={presentation.tone}
                    icon={<presentation.icon className="h-3.5 w-3.5" aria-hidden />}
                  >
                    {presentation.label}
                  </Badge>
                </h3>
                <p className="mt-1 text-sm text-body">{def.summary}</p>
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-secondary dark:bg-(--hub-sunken) dark:text-secondary">
              <span className="font-medium">Without it:</span> {def.deniedImpact.join(' · ')}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {status === 'undetermined' && def.canRequest && (
                <Button variant="primary" loading={busy} onClick={() => void grant(id)}>
                  Grant access
                </Button>
              )}
              {status === 'granted' && id === 'notifications' && (
                <Button variant="secondary" loading={testing} onClick={() => void runTestNotification()}>
                  Send test notification
                </Button>
              )}
              {isActionable(id, status) && (
                <Button variant="secondary" onClick={() => setStepsFor(id)} icon={<ExternalLink aria-hidden />}>
                  How to allow
                </Button>
              )}
              {status === 'undetermined' && def.canRequest && !decision && (
                <Button variant="ghost" onClick={() => decide(id, 'later')} icon={<Clock aria-hidden />}>
                  Ask me later
                </Button>
              )}
              {status === 'undetermined' && !def.canRequest && (
                <Button variant="secondary" onClick={() => setStepsFor(id)} icon={<ExternalLink aria-hidden />}>
                  Open OS settings
                </Button>
              )}
              {status === 'unsupported' && (
                <span className="text-xs text-tertiary">
                  Not available on {platform === 'web' ? 'this browser' : platform}.
                </span>
              )}
            </div>

            {decision === 'never' && isActionable(id, status) && (
              <p className="mt-2 text-xs text-tertiary">
                You asked not to be prompted for this. Nothing will nag you — grant it anytime from here.
              </p>
            )}
          </section>
        )
      })}

      {/* Reset guidance (visible only when any decision exists) */}
      {PERMISSION_IDS.some((id) => prefs.decisions[id]) && (
        <Button variant="ghost" onClick={reset}>
          Reset all guidance (allow prompts again)
        </Button>
      )}

      {/* Manual grant steps */}
      <Sheet
        open={stepsFor !== null}
        onClose={() => setStepsFor(null)}
        title={stepsFor ? `Allow ${PERMISSION_CATALOG[stepsFor].title}` : ''}
        footer={
          <Button variant="primary" onClick={() => setStepsFor(null)}>
            Done
          </Button>
        }
      >
        {stepsFor && (
          <div className="space-y-3">
            <Callout tone="accent">
              This permission can&apos;t be requested from inside the app — it lives in your
              device settings. {isSettled(snapshot.data?.[stepsFor] ?? 'undetermined') ? '' : 'Status refreshes automatically when you return.'}
            </Callout>
            <ol className="space-y-2">
              {(PERMISSION_CATALOG[stepsFor].grantSteps[platform] ??
                PERMISSION_CATALOG[stepsFor].grantSteps.web ??
                []).map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white"
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Sheet>
    </div>
  )
}
