import { describe, expect, it, vi } from 'vitest'

const apiGet = vi.fn()
vi.mock('@/lib/transport', () => ({ apiGet: (p: string) => apiGet(p), isTauri: () => false }))

import { apiGetRetry } from '../src/lib/transport-retry'

describe('apiGetRetry', () => {
  it('keeps the HTTP status on the thrown error so callers can branch on 404/403', async () => {
    apiGet.mockReset()
    apiGet.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }))
    const err = (await apiGetRetry('/api/x', { attempts: 1 }).catch((e: unknown) => e)) as {
      status?: number
    }
    expect(err.status).toBe(404)
    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('returns the value on success', async () => {
    apiGet.mockReset()
    apiGet.mockResolvedValue({ ok: 1 })
    await expect(apiGetRetry('/api/x')).resolves.toEqual({ ok: 1 })
  })
})
