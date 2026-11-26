/**
 * Next 16 proxy (formerly middleware): refuses requests whose Host or Origin this server does not
 * serve. Logic and limits live in src/lib/host-guard.ts. Only runs for the Node web target; the
 * Tauri static export has no server (`pageExtensions: ['tsx']` also drops this file there).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { checkRequest, readGuardConfig } from './src/lib/host-guard'

const guardConfig = readGuardConfig(process.env)

export function proxy(request: NextRequest) {
  const verdict = checkRequest(
    {
      method: request.method,
      pathname: request.nextUrl.pathname,
      protocol: request.nextUrl.protocol,
      host: request.headers.get('host'),
      forwardedHost: request.headers.get('x-forwarded-host'),
      origin: request.headers.get('origin'),
      secFetchSite: request.headers.get('sec-fetch-site'),
    },
    guardConfig,
  )
  if (verdict.ok) return NextResponse.next()
  return NextResponse.json(
    { ok: false, error: 'Request refused: host or origin not allowed', code: verdict.reason },
    { status: verdict.status },
  )
}

export const config = { matcher: ['/api/:path*'] }
