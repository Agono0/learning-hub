export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path?: string
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string | number>
  headers?: Record<string, string>
}

export interface ApiResponse<T = unknown> {
  status: number
  ok: boolean
  headers: Headers
  data: T
}

/**
 * A Next.js route handler with any context shape. `context: never` makes every
 * handler assignable (parameters are contravariant); callRoute builds the
 * context itself from `options.params`.
 */
export type RouteHandler = (req: Request, context: never) => Promise<Response>

/**
 * Invokes a route handler like Next.js would. `T` is the caller's expected
 * JSON body. Dynamic segments come from `options.params`, passed as
 * `{ params: Promise<params> }` (the App Router's async-params shape).
 */
export async function callRoute<T = unknown>(
  handler: RouteHandler,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET'
  let url = `http://localhost:3000${options.path ?? '/'}`

  if (options.query) {
    const searchParams = new URLSearchParams()
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) {
        searchParams.set(k, String(v))
      }
    }
    const qStr = searchParams.toString()
    if (qStr) {
      url += (url.includes('?') ? '&' : '?') + qStr
    }
  }

  const reqHeaders = new Headers(options.headers)
  let bodyStr: string | undefined = undefined

  if (options.body !== undefined && method !== 'GET') {
    if (typeof options.body === 'string') {
      bodyStr = options.body
    } else {
      bodyStr = JSON.stringify(options.body)
      if (!reqHeaders.has('content-type')) {
        reqHeaders.set('content-type', 'application/json')
      }
    }
  }

  const req = new Request(url, {
    method,
    headers: reqHeaders,
    body: bodyStr,
  })

  // Next.js App Router context with async params compatibility
  const context = options.params ? { params: Promise.resolve(options.params) } : undefined

  const res = await handler(req, context as never)
  const status = res.status
  const ok = res.ok
  const contentType = res.headers.get('content-type') || ''

  // JSON bodies are the caller's declared T; non-JSON bodies arrive as text.
  const data = (contentType.includes('application/json') ? await res.json() : await res.text()) as T

  return {
    status,
    ok,
    headers: res.headers,
    data,
  }
}
