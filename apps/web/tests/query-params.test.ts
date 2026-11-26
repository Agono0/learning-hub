import { describe, expect, it } from 'vitest'
import { parseIntStrict, queryId, queryIdList, queryInt, queryLimit } from '../src/lib/query-params'

const sp = (q: string) => new URLSearchParams(q)

describe('parseIntStrict', () => {
  it.each([
    ['5', 5],
    [' 7 ', 7],
    ['-3', -3],
    ['+4', 4],
    ['0', 0],
  ])('%j -> %j', (raw, want) => expect(parseIntStrict(raw)).toBe(want))
  it.each([
    '',
    ' ',
    '1.5',
    '1e3',
    '0x10',
    'Infinity',
    '-Infinity',
    'NaN',
    'abc',
    '12abc',
    '9'.repeat(30),
  ])('rejects %j', (raw) => expect(parseIntStrict(raw)).toBeNull())
  it('null/undefined', () => {
    expect(parseIntStrict(null)).toBeNull()
    expect(parseIntStrict(undefined)).toBeNull()
  })
})

describe('queryLimit', () => {
  it('default when missing', () => expect(queryLimit(sp(''), 20, 100)).toBe(20))
  it('clamps high', () => expect(queryLimit(sp('limit=9999'), 20, 100)).toBe(100))
  it.each(['-1', '-999', '0'])('never below 1: %s', (v) =>
    expect(queryLimit(sp(`limit=${v}`), 20, 100)).toBe(1),
  )
  it.each(['NaN', 'abc', '', '1.5', 'Infinity', '1e9'])('junk %j -> default', (v) =>
    expect(queryLimit(sp(`limit=${v}`), 20, 100)).toBe(20),
  )
  it('custom name', () => expect(queryLimit(sp('n=3'), 20, 100, 'n')).toBe(3))
})

describe('queryInt', () => {
  it('clamps into range', () => {
    expect(queryInt(sp('m=500'), 'm', { fallback: 10, min: 1, max: 60 })).toBe(60)
    expect(queryInt(sp('m=-5'), 'm', { fallback: 10, min: 1, max: 60 })).toBe(1)
    expect(queryInt(sp('m=x'), 'm', { fallback: 10, min: 1, max: 60 })).toBe(10)
  })
  it('clamps the fallback too', () => {
    expect(queryInt(sp(''), 'm', { fallback: 0, min: 5, max: 20 })).toBe(5)
  })
})

describe('queryId', () => {
  it('accepts positive ints', () => expect(queryId(sp('id=42'), 'id')).toBe(42))
  it.each(['0', '-1', '1.5', 'x', '', 'Infinity', '99999999999999999999'])('rejects %j', (v) =>
    expect(queryId(sp(`id=${v}`), 'id')).toBeNull(),
  )
  it('missing', () => expect(queryId(sp(''), 'id')).toBeNull())
})

describe('queryIdList', () => {
  it('parses, dedupes, drops junk', () =>
    expect(queryIdList(sp('ids=1,2,2,x,-3,4.5, 6'), 'ids')).toEqual([1, 2, 6]))
  it('caps', () => expect(queryIdList(sp('ids=1,2,3,4'), 'ids', 2)).toEqual([1, 2]))
  it('empty', () => expect(queryIdList(sp(''), 'ids')).toEqual([]))
})
