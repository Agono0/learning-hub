/**
 * Learning HUB server — HTTP helpers: zod body/query parsing and the error
 * envelope shared with the web app (`{ error, detail? }` + 400/404/500 mapping).
 *
 * These are a minimal copy of apps/web/src/lib/api.ts semantics (ApiError /
 * CardNotFoundError → 404 / ValidationError → 400 / everything else → sanitized
 * 500), adapted to node:http primitives — deliberately NOT imported from
 * apps/web so this package stays Next-free.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { CardNotFoundError, ValidationError } from '@learning-hub/db'

/** Maximum accepted JSON body size (1 MiB — generous for review batches). */
const MAX_BODY_BYTES = 1024 * 1024

/** HTTP-tagged error: handlers throw it; {@link sendError} turns it into a JSON response. */
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

/** Serialize and send a JSON response with the right content type. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** JSON error response with the consistent `{ error, detail? }` envelope shape. */
export function jsonError(
  res: ServerResponse,
  status: number,
  message: string,
  detail?: unknown,
): void {
  sendJson(res, status, detail !== undefined ? { error: message, detail } : { error: message })
}

/**
 * Read the request body as JSON and validate it with the given zod schema.
 * Throws ApiError(400) with flattened issues as `detail` on a malformed or invalid body, and
 * ApiError(413) when the body is over the byte limit (1 MiB unless `opts.maxBytes` raises it).
 */
export async function readJson<T>(
  req: IncomingMessage,
  schema: z.ZodType<T>,
  opts: { maxBytes?: number } = {},
): Promise<T> {
  const limit = opts.maxBytes ?? MAX_BODY_BYTES
  // Refuse on the declared length before reading a byte; the streamed count below still applies
  // because the header can be absent (chunked) or wrong.
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    throw new ApiError(413, 'Request body too large')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) {
      throw new ApiError(413, 'Request body too large')
    }
    chunks.push(chunk as Buffer)
  }
  let raw: unknown
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
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

/**
 * Validate a URL's query string with the given zod schema (zod-coerced
 * primitives; query values are always strings). Throws ApiError(400) on failure.
 */
export function readQuery<T>(url: URL, schema: z.ZodType<T>): T {
  const raw = Object.fromEntries(url.searchParams.entries())
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      400,
      'Invalid query parameters',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }
  return parsed.data
}

/**
 * Map a thrown error to the error envelope: ApiError → its status,
 * CardNotFoundError → 404, ValidationError → 400, everything else → sanitized
 * 500 (`{error:"Internal error"}`) with the real error logged via console.error.
 * Never throws — webhook/handler failures must not take the server down.
 */
export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof ApiError) return jsonError(res, err.status, err.message, err.detail)
  if (err instanceof CardNotFoundError) return jsonError(res, 404, err.message)
  if (err instanceof ValidationError) return jsonError(res, 400, err.message)
  console.error('[server] unhandled route error:', err)
  jsonError(res, 500, 'Internal error')
}
