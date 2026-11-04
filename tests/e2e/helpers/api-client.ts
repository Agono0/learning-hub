export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path?: string
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string | number>
  headers?: Record<string, string>
}

export interface ApiResponse<T = any> {
  status: number
  ok: boolean
  headers: Headers
  data: T
}

export async function callRoute<T = any>(
  handler: (req: Request, context?: any) => Promise<Response>,
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
  const context = options.params
    ? { params: Promise.resolve(options.params) }
    : undefined

  const res = await handler(req, context)
  const status = res.status
  const ok = res.ok
  const contentType = res.headers.get('content-type') || ''
  
  let data: any = null
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }

  return {
    status,
    ok,
    headers: res.headers,
    data,
  }
}
