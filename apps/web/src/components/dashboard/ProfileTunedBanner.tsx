'use client'

/**
 * ProfileTunedBanner — the dashboard's one-click undo for the learner profile.
 *
 * Reads localStorage['lh-profile-applied'] (written by OnboardingWizard's
 * finish step and by Settings "Switch preset"; the writers own the shape —
 * keep the two in sync). Shows the named archetype plus one line per knob
 * change ("sessionMinutes 25 → 15 — …") and offers Undo, which PUTs the
 * captured pre-apply values back (sessionMinutes / desiredRetention — the two
 * settings-writable knobs), then clears the record and hides itself.
 *
 * Honest empty state: when the key is absent (never applied, already undone,
 * or dismissed) this renders nothing. Hydration-safe: the localStorage read
 * happens after mount, so the first render matches the server (nothing).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { describeChanges, type ProfileKnobChange } from '@learning-hub/core/learner-profile'
import { apiSend } from '@/lib/transport'
import { Button, Callout, IconButton, useToast } from '@/ui'
import { queryKeys } from '@/lib/query-keys'

/** Shape written by OnboardingWizard (finish) and the Settings preset switch. */
interface ProfileAppliedRecord {
  changes: ProfileKnobChange[]
  archetypeLabel: string
  previous: { sessionMinutes: number; desiredRetention: number }
}

const PROFILE_APPLIED_KEY = 'lh-profile-applied'

/** Parse + validate the stored record; anything malformed counts as absent. */
function readAppliedRecord(): ProfileAppliedRecord | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_APPLIED_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const r = parsed as Partial<ProfileAppliedRecord>
    if (!Array.isArray(r.changes) || typeof r.archetypeLabel !== 'string') return null
    if (
      !r.previous ||
      typeof r.previous.sessionMinutes !== 'number' ||
      typeof r.previous.desiredRetention !== 'number'
    ) {
      return null
    }
    return { changes: r.changes, archetypeLabel: r.archetypeLabel, previous: r.previous }
  } catch {
    return null
  }
}

export function ProfileTunedBanner() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [record, setRecord] = useState<ProfileAppliedRecord | null>(null)

  useEffect(() => {
    setRecord(readAppliedRecord())
  }, [])

  const clearRecord = () => {
    try {
      window.localStorage.removeItem(PROFILE_APPLIED_KEY)
    } catch {
      // ignore — nothing to clean up if storage is unavailable
    }
    setRecord(null)
  }

  const undoMutation = useMutation({
    mutationFn: (prev: ProfileAppliedRecord) =>
      apiSend('/api/settings', 'PUT', {
        sessionMinutes: prev.previous.sessionMinutes,
        desiredRetention: prev.previous.desiredRetention,
      }),
    onSuccess: () => {
      clearRecord()
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
    },
    onError: (e: Error) => {
      toast({ title: 'Undo failed', description: e.message, tone: 'danger' })
    },
  })

  if (!record) return null
  const lines = describeChanges(record.changes)

  return (
    <div className="relative">
      <Callout tone="accent" title={`Tuned for ${record.archetypeLabel}`}>
        {lines.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-0.5 text-xs">
            Your settings already matched this profile — nothing was changed.
          </p>
        )}
        <div className="mt-2">
          <Button
            variant="secondary"
            loading={undoMutation.isPending}
            onClick={() => undoMutation.mutate(record)}
          >
            Undo
          </Button>
        </div>
      </Callout>
      <IconButton
        label="Dismiss tuning summary"
        size="sm"
        className="absolute right-1 top-1"
        onClick={clearRecord}
      >
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  )
}
