import { describe, expect, it } from 'vitest'
import { parseStoredSubscriptions } from '../src/lib/channel-subscriptions-storage'

const good = { manifest: { id: 'a' }, localItems: [], localVersion: 2 }

describe('parseStoredSubscriptions', () => {
  it('returns valid records', () => {
    expect(parseStoredSubscriptions(JSON.stringify([good]))).toEqual([good])
  })
  it('returns [] for missing, corrupt or non-array values', () => {
    expect(parseStoredSubscriptions(null)).toEqual([])
    expect(parseStoredSubscriptions('')).toEqual([])
    expect(parseStoredSubscriptions('{oops')).toEqual([])
    expect(parseStoredSubscriptions('{}')).toEqual([])
    expect(parseStoredSubscriptions('"x"')).toEqual([])
    expect(parseStoredSubscriptions('null')).toEqual([])
  })
  it('drops malformed entries but keeps the good ones', () => {
    const raw = JSON.stringify([
      null,
      5,
      {},
      { manifest: {}, localVersion: 1 },
      good,
      { ...good, localVersion: 'x' },
    ])
    expect(parseStoredSubscriptions(raw)).toEqual([good])
  })
})
