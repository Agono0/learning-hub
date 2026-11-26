import { describe, expect, it } from 'vitest'
import nextConfig, { securityHeaders } from '../next.config'

describe('web target security headers', () => {
  it('sets anti-sniffing, anti-framing and referrer headers on every route', async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const all = rules.find((r) => r.source === '/:path*')
    expect(all, 'catch-all header rule').toBeDefined()
    const map = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))
    expect(map['X-Content-Type-Options']).toBe('nosniff')
    expect(map['X-Frame-Options']).toBe('DENY')
    expect(map['Content-Security-Policy']).toBe("frame-ancestors 'none'")
    expect(map['Referrer-Policy']).toBeTruthy()
    expect(securityHeaders.length).toBeGreaterThanOrEqual(4)
  })

  it('never caches API responses and hides the framework banner', async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    const api = rules.find((r) => r.source === '/api/:path*')
    expect(api?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-store' })
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})
