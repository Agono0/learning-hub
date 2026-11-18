'use client'

/**
 * PermissionGate — the reusable "this needs a capability" affordance.
 *
 * Wrap a feature that only works with an OS/browser permission. Renders
 * nothing when granted; otherwise shows one calm, honest line: a Grant
 * button while the OS can still prompt, or step-by-step guidance linked to
 * the Permission Center once denied. Kills the classic silent-failure bug
 * where a toggle flips but nothing ever delivers (fixed here at the call
 * sites in Settings → Reminders and Push).
 */
import Link from 'next/link'
import { useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { PERMISSION_CATALOG, isSettled, type PermissionId } from '@learning-hub/core/permissions'
import { Button } from '@/ui/Button'
import { usePermissionSnapshot, useRequestPermission } from '@/lib/use-permissions'

export function PermissionGate({
  permission,
  children,
  /** Extra context line (e.g. what the surrounding feature does). */
  reason,
}: {
  permission: PermissionId
  /** Rendered instead of the gate when the permission is granted/unsupported. */
  children?: React.ReactNode
  reason?: string
}) {
  const snapshot = usePermissionSnapshot()
  const requestPermission = useRequestPermission()
  const [busy, setBusy] = useState(false)
  const [grantedLocally, setGrantedLocally] = useState(false)

  const status = snapshot.data?.[permission]
  if (
    grantedLocally ||
    isSettled(status ?? 'undetermined') ||
    snapshot.isLoading ||
    snapshot.isError
  ) {
    return <>{children}</>
  }

  const def = PERMISSION_CATALOG[permission]

  const grant = async () => {
    setBusy(true)
    try {
      const result = await requestPermission(permission)
      if (result === 'granted') setGrantedLocally(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 sm:flex-row sm:items-center dark:text-status-warning-text"
    >
      <ShieldOff className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {def.title} needed for this to work{reason ? ` — ${reason}` : ''}.
        </p>
        <p className="mt-0.5 text-xs text-tertiary">
          {def.deniedImpact[0]} Manage this in{' '}
          <Link href="/permissions" className="underline underline-offset-2">
            Permissions
          </Link>
          .
        </p>
      </div>
      {status !== 'denied' && def.canRequest && (
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => void grant()}
          className="shrink-0"
        >
          Grant access
        </Button>
      )}
    </div>
  )
}
