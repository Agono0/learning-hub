/**
 * Client crash reporting and telemetry service.
 *
 * Collects runtime crashes (window errors, unhandled promise rejections, and
 * React Error Boundary crashes), sanitizes error messages and stack traces to
 * strip secrets/passwords, enforces a 60-second in-memory deduplication window
 * so repeated failures don't flood the network, and dispatches crash reports to
 * the Cloudflare Worker telemetry proxy (`POST /api/v1/telemetry/crash`) via
 * `remoteFetch` (CORS-free native bridge on Tauri, standard fetch on web).
 */
import { remoteFetch } from '@/server/net'
import { getDeviceIdentity } from '@/lib/device'

/** Shape of the payload submitted to POST /api/v1/telemetry/crash. */
export interface CrashReportPayload {
  errorName: string
  errorMessage: string
  stack?: string
  component?: string
  appVersion: string
  platform: 'android' | 'windows' | 'web' | 'other'
  deviceAbi?: string
  breadcrumbs?: Array<Record<string, unknown>>
  timestamp: number
}

/** In-memory deduplication cache: fingerprint -> timestamp (ms). */
const dedupeCache = new Map<string, number>()
const DEDUPE_WINDOW_MS = 60_000

/** Current telemetry crash endpoint (defaults to /api/v1/telemetry/crash). */
let currentEndpoint = '/api/v1/telemetry/crash'

/** Cached device ABI on Android shells to avoid repeated IPC lookups. */
let cachedAbi: string | undefined

/**
 * Configure the destination endpoint for crash reports.
 * Used in tests or when pointing to an explicit worker host.
 */
export function setTelemetryEndpoint(url: string): void {
  currentEndpoint = url
}

/** Returns the active destination endpoint for crash reports. */
export function getTelemetryEndpoint(): string {
  return currentEndpoint
}

/** Clears the 60s in-memory deduplication cache (useful for tests). */
export function clearTelemetryCache(): void {
  dedupeCache.clear()
}

/**
 * Strip sensitive credentials (tokens, passwords, user home paths) from
 * strings before sending diagnostics over the wire.
 */
export function sanitizeString(text: string): string {
  if (!text) return text
  return (
    text
      // GitHub tokens (classic, fine-grained, OAuth)
      .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, '[REDACTED_GH_TOKEN]')
      .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GH_TOKEN]')
      // Bearer / authorization headers
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
      // Passwords in URLs (e.g. https://user:secret@host)
      .replace(/(https?:\/\/[^\/\s:@]+):[^\/\s@]+@/g, '$1:[REDACTED]@')
      // Key-value credentials (e.g. password=..., apiKey=..., auth_token: ...)
      .replace(
        /(password|passwd|secret[_\w]*|api_?key|access_?token|auth_?token)\s*([:=])\s*["']?[^\s,"']+["']?/gi,
        '$1$2[REDACTED]',
      )
      // Local filesystem user paths (protect privacy on Windows, Linux, macOS)
      .replace(/[A-Za-z]:\\Users\\[^\\]+\\/gi, 'C:\\Users\\[USER]\\')
      .replace(/\/home\/[^\/]+\//gi, '/home/[USER]/')
      .replace(/\/Users\/[^\/]+\//gi, '/Users/[USER]/')
  )
}

/** Recursively sanitize values within an object. */
export function sanitizeContext(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'string') {
      sanitized[key] = sanitizeString(val)
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = sanitizeContext(val as Record<string, unknown>)
    } else {
      sanitized[key] = val
    }
  }
  return sanitized
}

/** Resolve device ABI asynchronously on Android if available. */
async function resolveAbi(contextAbi?: unknown): Promise<string | undefined> {
  if (typeof contextAbi === 'string') return contextAbi
  if (cachedAbi !== undefined) return cachedAbi

  try {
    const { sideloadSupported, androidDeviceInfo } = await import('@/platform/sideload')
    if (sideloadSupported()) {
      const info = await androidDeviceInfo()
      if (info?.abi) {
        cachedAbi = info.abi
        return cachedAbi
      }
    }
  } catch {
    // Sideload or native device info unavailable
  }
  return undefined
}

/**
 * Report an application error to the telemetry service.
 *
 * Sanitizes the stack trace and message, adds host platform and device metadata,
 * checks the 60-second in-memory deduplication cache, and POSTs the payload
 * via `remoteFetch`.
 *
 * Resolves to `true` if dispatched, or `false` if deduplicated or failed.
 * Never throws — crash reporting must never crash the caller.
 */
export async function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<boolean> {
  try {
    let rawName = 'Error'
    let rawMessage = ''
    let rawStack: string | undefined

    if (error instanceof Error) {
      rawName = error.name || 'Error'
      rawMessage = error.message || ''
      rawStack = error.stack
    } else if (typeof error === 'string') {
      rawName = 'Error'
      rawMessage = error
    } else if (error && typeof error === 'object') {
      const rec = error as Record<string, unknown>
      rawName = typeof rec.name === 'string' ? rec.name : 'UnhandledObject'
      rawMessage = typeof rec.message === 'string' ? rec.message : JSON.stringify(rec)
      rawStack = typeof rec.stack === 'string' ? rec.stack : undefined
    } else {
      rawName = 'UnknownError'
      rawMessage = String(error)
    }

    const errorName = sanitizeString(rawName)
    const errorMessage = sanitizeString(rawMessage)
    const stack = rawStack ? sanitizeString(rawStack) : undefined

    const component =
      typeof context?.component === 'string'
        ? context.component
        : typeof context?.action === 'string'
          ? context.action
          : undefined

    // 60-second in-memory deduplication check
    const now = Date.now()
    const dedupeKey = `${errorName}::${errorMessage}::${component ?? ''}`
    const lastReported = dedupeCache.get(dedupeKey)
    if (lastReported !== undefined && now - lastReported < DEDUPE_WINDOW_MS) {
      return false
    }
    dedupeCache.set(dedupeKey, now)

    // Cleanup dedupeCache when it grows large
    if (dedupeCache.size > 200) {
      for (const [key, ts] of dedupeCache.entries()) {
        if (now - ts >= DEDUPE_WINDOW_MS) {
          dedupeCache.delete(key)
        }
      }
    }

    const hostPlatform =
      typeof context?.platform === 'string'
        ? (context.platform as CrashReportPayload['platform'])
        : getDeviceIdentity().platform

    const appVersion =
      typeof context?.appVersion === 'string'
        ? context.appVersion
        : process.env.LH_APP_VERSION || '0.1.0'

    const deviceAbi = await resolveAbi(context?.deviceAbi)

    const breadcrumbs: Array<Record<string, unknown>> = []
    if (Array.isArray(context?.breadcrumbs)) {
      for (const b of context.breadcrumbs) {
        if (b && typeof b === 'object') {
          breadcrumbs.push(sanitizeContext(b as Record<string, unknown>))
        }
      }
    } else if (context) {
      breadcrumbs.push(sanitizeContext({ timestamp: now, ...context }))
    }

    const payload: CrashReportPayload = {
      errorName,
      errorMessage,
      stack,
      component,
      appVersion,
      platform: hostPlatform,
      deviceAbi,
      breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
      timestamp: now,
    }

    const res = await remoteFetch(currentEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    return res.ok
  } catch {
    // Crash reporting must never bubble errors into calling code
    return false
  }
}

let handlersInstalled = false
let removeHandlersFn: (() => void) | null = null

/**
 * Register global unhandled error and promise rejection listeners.
 * Safe to call in browser environments; returns an unsubscribe function.
 */
export function initGlobalErrorHandlers(): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }

  if (handlersInstalled && removeHandlersFn) {
    return removeHandlersFn
  }

  const onError = (event: ErrorEvent) => {
    void reportError(event.error ?? event.message, {
      component: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  }

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    void reportError(event.reason, {
      component: 'unhandledrejection',
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  handlersInstalled = true

  removeHandlersFn = () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    handlersInstalled = false
    removeHandlersFn = null
  }

  return removeHandlersFn
}
