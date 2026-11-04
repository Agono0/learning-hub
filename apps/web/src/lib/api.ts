/**
 * Server-side API route helpers: zod body parsing, tagged errors, and a
 * wrapper that maps every thrown error to a consistent JSON response.
 *
 * SERVER-only — importing @learning-hub/db drags better-sqlite3 in.
 * A route opts in by `export const POST = withRoute(async (req) => { ... })`.
 */
import { z } from 'zod'
import { CardNotFoundError, ValidationError } from '@learning-hub/db'

/**
 * Timezone offset in `Date#getTimezoneOffset()` semantics — the client sends
 * `new Date().getTimezoneOffset()`: minutes to ADD to local time to get UTC
 * (negative east of UTC, e.g. -120 for UTC+2). Optional in bodies with 0 =
 * the UTC default; day-bucketing routes pass it straight to `dayKey`.
 */
export const tzOffsetSchema = z
  .number()
  .int()
  .min(-720) // UTC-12
  .max(840) // UTC+14
  .optional()
  .default(0)

/**
 * Read `tzOffset` from the query string of a GET request (same semantics as
 * {@link tzOffsetSchema}). Missing or invalid → 0 (the UTC default), so a
 * malformed query can never crash a GET.
 */
export function tzOffsetFromQuery(req: Request, param = 'tzOffset'): number {
  const raw = new URL(req.url).searchParams.get(param)
  if (raw === null || raw === '') return 0
  const parsed = z.coerce.number().int().min(-720).max(840).safeParse(raw)
  return parsed.success ? parsed.data : 0
}

/**
 * Map a thrown AI/provider error to a client-safe response. Provider error
 * messages leak base URLs, model ids and upstream statuses, so the client only
 * ever sees a generic message; the real error is logged server-side. The
 * not-configured case keeps the historical 400 + `needsSetup` contract.
 */
export function aiErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('not configured') || message.includes('Settings')) {
    return Response.json(
      { ok: false, error: 'AI is not configured — pick a provider and model in Settings.', needsSetup: true },
      { status: 400 },
    )
  }
  console.error('[api] AI provider failure:', err)
  return Response.json(
    { ok: false, error: 'AI request failed', detail: err instanceof Error ? err.name : 'unknown' },
    { status: 502 },
  )
}

/** HTTP-tagged error: routes throw it, `withRoute` turns it into a JSON response. */
export class ApiError extends Error {
  status: number
  detail?: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/**
 * Parse a request body as JSON and validate it with the given zod schema.
 * Throws ApiError(400) with flattened issues as `detail` on any failure.
 */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      400,
      'Invalid request body',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }
  return parsed.data
}

/** JSON error response with a consistent `{ error, detail? }` shape. */
export function jsonError(status: number, message: string, detail?: unknown): Response {
  return Response.json(
    detail !== undefined ? { error: message, detail } : { error: message },
    { status },
  )
}

/**
 * Wrap a Next.js route handler: ApiError → its status, CardNotFoundError → 404,
 * ValidationError → 400, everything else → sanitized 500 (`{error:"Internal error"}`)
 * with the real error logged via console.error.
 */
export function withRoute<C = unknown>(
  handler: (req: Request, context: C) => Promise<Response>,
): (req: Request, context: C) => Promise<Response> {
  return async (req, context) => {
    try {
      return await handler(req, context)
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err.status, err.message, err.detail)
      if (err instanceof CardNotFoundError) return jsonError(404, err.message)
      if (err instanceof ValidationError) return jsonError(400, err.message)
      console.error('[api] unhandled route error:', err)
      return jsonError(500, 'Internal error')
    }
  }
}
