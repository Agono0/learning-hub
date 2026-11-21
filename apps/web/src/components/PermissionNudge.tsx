'use client'

/**
 * PermissionNudge — the calm, first-run ask.
 *
 * Mounted once in the AppShell. Shows at most ONE permission at a time
 * (highest catalog impact first), only while its status is `undetermined`,
 * and honors the user's decision record: "later" hides it for 3 days,
 * "never" hides it until they reset guidance in the Permission Center.
 * Self-determination theory (Deci & Ryan 1985) in practice: an explain-first
 * banner with a real choice beats a cold OS dialog every time.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import {
  PERMISSION_CATALOG,
  nextPermissionToAsk,
  shouldOfferPrompt,
  type PermissionId,
} from '@learning-hub/core/permissions'
import { Button, IconButton } from '@/ui'
import {
  usePermissionPrefs,
  usePermissionSnapshot,
  useRequestPermission,
} from '@/lib/use-permissions'

export function PermissionNudge() {
  const snapshot = usePermissionSnapshot()
  const { prefs, decide } = usePermissionPrefs()
  const requestPermission = useRequestPermission()
  const [dismissedThisSession, setDismissedThisSession] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Render only after mount — permission detection touches window APIs and
  // must never run (or differ) during SSR/hydration.
  useEffect(() => setMounted(true), [])

  const askId: PermissionId | null =
    mounted && !dismissedThisSession && snapshot.data
      ? nextPermissionToAsk(snapshot.data, prefs)
      : null

  if (!mounted || !askId) return null

  const def = PERMISSION_CATALOG[askId]
  const promptable = shouldOfferPrompt(askId, snapshot.data?.[askId] ?? 'undetermined', prefs)

  const grant = async () => {
    setBusy(true)
    try {
      decide(askId, 'ask_now')
      await requestPermission(askId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="region"
      aria-label="Permission suggestion"
      className="panel-elevated mx-4 mb-3 mt-1 flex flex-col gap-2 rounded-xl border border-neutral-200 px-3 py-3 text-sm sm:flex-row sm:items-center dark:border-(--hub-border)"
    >
      <BellRing className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {def.title} — {def.summary}
        </p>
        <p className="mt-0.5 text-xs text-tertiary">
          Without it: {def.deniedImpact[0]} You can change this anytime in{' '}
          <Link href="/permissions" className="underline underline-offset-2">
            Permissions
          </Link>
          .
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {promptable ? (
          <>
            <Button variant="primary" loading={busy} onClick={() => void grant()}>
              Allow
            </Button>
            <Button variant="ghost" onClick={() => decide(askId, 'later')}>
              Later
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => decide(askId, 'ask_now')}>
            Review
          </Button>
        )}
        <IconButton
          label={`Stop suggesting ${def.title}`}
          onClick={() => {
            decide(askId, 'never')
            setDismissedThisSession(true)
          }}
        >
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
    </div>
  )
}
