'use client'

/**
 * React hooks over the platform permission adapter (`src/platform/permissions.ts`).
 *
 * All ask/ask-not decision logic is pure code in `@learning-hub/core/permissions`
 * (unit-tested); these hooks only bind it to react-query + localStorage.
 */
import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PERMISSION_IDS,
  nextPermissionToAsk,
  shouldOfferPrompt,
  type PermissionId,
  type PermissionPromptPrefs,
  type PermissionPromptDecision,
  type PermissionSnapshot,
} from '@learning-hub/core/permissions'
import {
  detectPermissions,
  getPermissionPrefs,
  onPermissionsMaybeChanged,
  recordPermissionDecision,
  requestPermission,
  resetPermissionPrefs,
} from '@/platform/permissions'

/** react-query key for the device permission snapshot. */
export const PERMISSION_SNAPSHOT_KEY = ['permissions', 'snapshot'] as const

/**
 * Live device permission snapshot. Re-detects automatically when the window
 * regains focus (the user may have flipped the switch in OS settings while we
 * were backgrounded).
 */
export function usePermissionSnapshot() {
  const query = useQuery({
    queryKey: PERMISSION_SNAPSHOT_KEY,
    queryFn: detectPermissions,
    staleTime: 60_000,
    gcTime: Infinity,
  })

  useEffect(() => onPermissionsMaybeChanged(() => void query.refetch()), [query])

  return query
}

/** Device-local ask preferences (localStorage-backed, re-read on focus). */
export function usePermissionPrefs(): {
  prefs: PermissionPromptPrefs
  /** Record the user's decision for one permission and persist it. */
  decide: (id: PermissionId, decision: PermissionPromptDecision) => void
  /** Clear all decisions/last-asked stamps (the Permission Center reset). */
  reset: () => void
} {
  const queryClient = useQueryClient()
  const [prefs, setPrefs] = useState<PermissionPromptPrefs>({ decisions: {}, lastAskedAt: {} })

  useEffect(() => {
    setPrefs(getPermissionPrefs())
  }, [])

  const decide = useCallback((id: PermissionId, decision: PermissionPromptDecision) => {
    setPrefs(recordPermissionDecision(id, decision))
  }, [])

  const reset = useCallback(() => {
    setPrefs(resetPermissionPrefs())
    void queryClient.invalidateQueries({ queryKey: PERMISSION_SNAPSHOT_KEY })
  }, [queryClient])

  return { prefs, decide, reset }
}

/**
 * The one permission the calm nudge should offer right now (or null). The
 * catalog's impact order + the 3-day throttle + the user's decisions decide;
 * there is never more than one ask on screen at a time.
 */
export function useNextPermissionToAsk(snapshot: PermissionSnapshot | undefined): PermissionId | null {
  const { prefs } = usePermissionPrefs()
  if (!snapshot) return null
  return nextPermissionToAsk(snapshot, prefs)
}

/**
 * Run a permission request and refresh the snapshot with the result. Returns
 * the resulting status so callers can toast honestly (granted vs denied).
 */
export function useRequestPermission(): (
  id: PermissionId,
) => Promise<PermissionSnapshot[PermissionId]> {
  const queryClient = useQueryClient()
  return useCallback(
    async (id: PermissionId) => {
      const status = await requestPermission(id)
      const next = { ...(queryClient.getQueryData<PermissionSnapshot>(PERMISSION_SNAPSHOT_KEY) ?? {}) }
      for (const key of PERMISSION_IDS) if (next[key] === undefined) next[key] = 'undetermined'
      next[id] = status
      queryClient.setQueryData(PERMISSION_SNAPSHOT_KEY, next)
      void queryClient.invalidateQueries({ queryKey: PERMISSION_SNAPSHOT_KEY })
      return status
    },
    [queryClient],
  )
}

export { shouldOfferPrompt }
