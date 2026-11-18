/**
 * Learning HUB — Error taxonomy (pure, runtime-neutral).
 *
 * Every failure a user can hit is classified ONCE into a small, honest
 * taxonomy with user-facing copy, so the UI (boundaries, toasts, banners,
 * route error pages) speaks with one voice instead of leaking raw stack
 * traces or inventing ad-hoc messages per page.
 *
 * Principles (Why):
 * 1. **Honest, specific, actionable.** "You're offline — showing saved data"
 *    beats "Something went wrong" (Nielsen heuristics: help users recognize,
 *    recover, and diagnose). Every class carries `canRetry` so retry buttons
 *    only appear where a retry can actually work.
 * 2. **No raw internals.** Server details go to `detail` (console/log), never
 *    into the headline the user reads.
 * 3. **Retry only what can succeed.** Retrying a 400 validation error cannot
 *    fix the payload; retrying an offline GET can. `shouldRetry` encodes this
 *    and is the single decision point for any backoff loop.
 */

import { z } from 'zod'

export const APP_ERROR_CODES = [
  'offline',
  'server',
  'not_found',
  'validation',
  'unauthorized',
  'timeout',
  'storage',
  'unknown',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

/** Shape the UI renders (Callout/Toast/Boundary fallback). */
export interface AppError {
  code: AppErrorCode
  /** Short title — one calm sentence, second person. */
  title: string
  /** What the user can do about it, concretely. */
  recovery: string
  /** Whether "Try again" can plausibly fix it. */
  canRetry: boolean
  /** Server-provided detail (for logs / the copy-details affordance). */
  detail?: unknown
}

export const appErrorSchema = z.object({
  code: z.enum(APP_ERROR_CODES),
  title: z.string().min(1),
  recovery: z.string().min(1),
  canRetry: z.boolean(),
  detail: z.unknown().optional(),
})

/** Minimal structural probe so the taxonomy can live in core (no DOM). */
export interface ClassifiableError {
  name?: string
  message?: string
  status?: number
  detail?: unknown
}

/** Copy per code — the single source of user-facing error language. */
const COPY: Record<AppErrorCode, { title: string; recovery: string; canRetry: boolean }> = {
  offline: {
    title: "You're offline",
    recovery: 'Showing what was already loaded. Reconnect and retry — nothing was lost.',
    canRetry: true,
  },
  server: {
    title: 'The server hit a problem',
    recovery:
      'Wait a moment and try again. If it keeps failing, it usually fixes itself within minutes.',
    canRetry: true,
  },
  not_found: {
    title: "That item doesn't exist (or was deleted)",
    recovery: 'Go back and refresh the list — the link may be outdated.',
    canRetry: false,
  },
  validation: {
    title: 'That input needs a small fix',
    recovery: 'Check the highlighted fields and try again.',
    canRetry: false,
  },
  unauthorized: {
    title: 'You need to sign in for this',
    recovery: 'Sign in again, then continue where you left off.',
    canRetry: false,
  },
  timeout: {
    title: 'This took too long',
    recovery: 'Try again — a retry is usually faster than the first attempt.',
    canRetry: true,
  },
  storage: {
    title: "Couldn't save to this device",
    recovery:
      'Free up storage or close other tabs, then try again. Your work in the current session is safe.',
    canRetry: true,
  },
  unknown: {
    title: 'Something unexpected happened',
    recovery: 'Try again. If it repeats, copy the details below and report it.',
    canRetry: true,
  },
}

/**
 * Classify any thrown value into the user-facing taxonomy.
 *
 * `context.online` comes from the caller (navigator.onLine in the web app;
 * tests pass it explicitly). Precedence: offline wins over everything (an
 * offline fetch surfaces as a TypeError, not a status); then HTTP status;
 * then known JS error names (timeout/abort, storage quota); then unknown.
 */
export function classifyError(err: unknown, context: { online?: boolean } = {}): AppError {
  const online = context.online ?? true
  const e = (err ?? {}) as ClassifiableError
  const message = typeof e.message === 'string' ? e.message : ''

  if (!online) return withDetail('offline', e.detail)

  if (typeof e.status === 'number') {
    if (e.status === 404) return withDetail('not_found', e.detail)
    if (e.status === 401 || e.status === 403) return withDetail('unauthorized', e.detail)
    if (e.status === 422 || e.status === 400) return withDetail('validation', e.detail)
    if (e.status >= 500) return withDetail('server', e.detail)
    if (e.status === 408) return withDetail('timeout', e.detail)
  }

  const name = typeof e.name === 'string' ? e.name : ''
  if (/abort|timeout|timed?\s?out/i.test(name) || /timed?\s?out/i.test(message)) {
    return withDetail('timeout', e.detail)
  }
  if (/quota|storage|persist/i.test(name) || /quota/i.test(message)) {
    return withDetail('storage', e.detail)
  }
  if (
    /fetch|network|networkerror|failed to fetch/i.test(name) ||
    /networkerror|failed to fetch/i.test(message)
  ) {
    // A network failure while "online" usually means the connection just
    // dropped — the offline copy is the honest one.
    return withDetail('offline', e.detail)
  }

  return withDetail('unknown', e.detail ?? (typeof e.message === 'string' ? e.message : undefined))
}

function withDetail(code: AppErrorCode, detail: unknown): AppError {
  return { code, ...COPY[code], detail }
}

/** Build an AppError directly (server envelopes that already know the code). */
export function appError(
  code: AppErrorCode,
  overrides: Partial<Pick<AppError, 'title' | 'recovery' | 'canRetry' | 'detail'>> = {},
): AppError {
  return { code, ...COPY[code], ...overrides }
}

/* ------------------------------------------------------------------ */
/* Retry policy — the single decision point for backoff loops.         */
/* ------------------------------------------------------------------ */

export const RETRY_MAX_ATTEMPTS = 2
export const RETRY_BASE_MS = 800
export const RETRY_CAP_MS = 15_000

/**
 * Whether a failed request should be retried: only errors where a retry can
 * succeed (offline/server/timeout/unknown), and never past
 * {@link RETRY_MAX_ATTEMPTS}. Validation/not-found/unauthorized are final —
 * retrying them just multiplies the same failure.
 */
export function shouldRetry(error: AppError, attempt: number): boolean {
  if (attempt >= RETRY_MAX_ATTEMPTS) return false
  return error.canRetry
}

/** Exponential backoff with a cap: 800ms → 1600ms → (capped) 15s. */
export function nextRetryMs(attempt: number): number {
  const ms = RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))
  return Math.min(RETRY_CAP_MS, ms)
}

/** Parse + harden a UiError from untrusted storage (e.g. persisted logs). */
export function parseAppError(raw: unknown): AppError | null {
  const parsed = appErrorSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
