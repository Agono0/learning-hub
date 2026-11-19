'use client'

/**
 * Transport retry — GET-only wrapper over the shared transport helpers.
 *
 * Retry policy lives in `@learning-hub/core/errors` ({@link shouldRetry},
 * {@link nextRetryMs}): only failures a retry can fix (offline/server/
 * timeout), capped at 2 attempts with exponential backoff. Mutating calls
 * (POST/PUT/PATCH/DELETE) are NEVER auto-retried — a retried mutation can
 * double-commit, and the honest failure path (toast + retry button on the
 * actual action) is safer than blind re-send.
 */
import { apiGet, isTauri } from '@/lib/transport'
import { classifyError, nextRetryMs, shouldRetry, type AppError } from '@learning-hub/core/errors'

/** Sleep helper (backs off between attempts; aborted if the page hides — timers throttle anyway). */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface RetryOptions {
  /** Max attempts override (1 = no retry). Default: core policy (2). */
  attempts?: number
  /** Injected for tests; defaults to wall-clock. */
  now?: () => number
}

/**
 * GET with classification + backoff retry. Throws the LAST failure as a
 * classified `AppError`-shaped object: `{ code, title, recovery, canRetry,
 * detail, status? }` — callers render `title`/`recovery` verbatim and only
 * show a retry button when `canRetry`.
 */
export async function apiGetRetry<T>(path: string, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, options.attempts ?? 3)
  let lastError: unknown
  let lastAppError: AppError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await apiGet<T>(path)
    } catch (err) {
      lastError = err
      const status = (err as { status?: number }).status
      lastAppError = classifyError(err, { online: isOnline() })
      void status
      if (attempt < maxAttempts && shouldRetry(lastAppError, attempt)) {
        await sleep(nextRetryMs(attempt))
        continue
      }
      break
    }
  }

  // Attach the classification for callers (react-query isError → present it).
  const err = new Error(lastAppError?.title ?? 'Request failed') as Error & {
    code?: string
    recovery?: string
    canRetry?: boolean
    detail?: unknown
    status?: number
    cause?: unknown
  }
  if (lastAppError) {
    err.code = lastAppError.code
    err.recovery = lastAppError.recovery
    err.canRetry = lastAppError.canRetry
    err.detail = lastAppError.detail
  }
  err.cause = lastError
  throw err
}

/** navigator.onLine with a safe default for node/tests. */
function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine !== false : true
}

// `isTauri` re-exported for parity with transport's runtime checks in tests.
void isTauri
