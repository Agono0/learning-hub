'use client'

/**
 * useApiError — one hook for presenting request failures to the user.
 *
 * Bridges `@learning-hub/core/errors` classification to the kit's Toast +
 * Callout: hand it any thrown value (react-query's `error`, a caught fetch),
 * get a classified AppError back and an optional toast. One voice for every
 * failure; pages stop hand-rolling "Something went wrong" strings.
 */
import { useCallback, useState } from 'react'
import { classifyError, type AppError } from '@learning-hub/core/errors'
import { useToast } from '@/ui/Toast'

export interface UseApiErrorResult {
  /** The most recent classified error (null when none). */
  error: AppError | null
  /** Classify + remember; optionally toast immediately. */
  present: (err: unknown, options?: { toast?: boolean; context?: string }) => AppError
  clear: () => void
}

export function useApiError(): UseApiErrorResult {
  const { toast } = useToast()
  const [error, setError] = useState<AppError | null>(null)

  const present = useCallback(
    (err: unknown, options?: { toast?: boolean; context?: string }) => {
      const classified = classifyError(err, {
        online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      })
      setError(classified)
      if (options?.toast) {
        toast({
          title: options.context ? `${options.context}: ${classified.title}` : classified.title,
          description: classified.recovery,
          tone: 'danger',
        })
      }
      return classified
    },
    [toast],
  )

  const clear = useCallback(() => setError(null), [])

  return { error, present, clear }
}

/**
 * Extract the classified fields a request error carries when it came from
 * `apiGetRetry` (code/recovery/canRetry ride on the Error). Falls back to
 * fresh classification for raw errors.
 */
export function classifyRequestError(err: unknown): AppError {
  const e = err as {
    code?: string
    recovery?: string
    canRetry?: boolean
    detail?: unknown
    title?: string
  }
  if (e?.code && e?.recovery) {
    return {
      code: e.code as AppError['code'],
      title: typeof e.title === 'string' ? e.title : 'Request failed',
      recovery: e.recovery,
      canRetry: Boolean(e.canRetry),
      detail: e.detail,
    }
  }
  return classifyError(err, {
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  })
}
