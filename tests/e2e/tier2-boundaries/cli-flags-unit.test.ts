import { describe, it, expect } from 'vitest'
import { FlagError, limitFlag, numFlag } from '../../../apps/cli/src/flags'

describe('numFlag', () => {
  it('absent or blank gives the fallback', () => {
    expect(numFlag(undefined, '--x', 7)).toBe(7)
    expect(numFlag('', '--x', 7)).toBe(7)
    expect(numFlag('  ', '--x', 7)).toBe(7)
  })
  it('parses finite numbers', () => {
    expect(numFlag('3', '--x', 0)).toBe(3)
    expect(numFlag('-2.5', '--x', 0)).toBe(-2.5)
    expect(numFlag(' 1e2 ', '--x', 0)).toBe(100)
  })
  it.each(['abc', 'NaN', 'Infinity', '-Infinity', '0x10', '0b11', '1,5', '12px'])(
    'rejects %j',
    (v) => expect(() => numFlag(v, '--x', 0)).toThrow(FlagError),
  )
  it('enforces int and range with the flag name in the message', () => {
    expect(() => numFlag('1.5', '--n', 0, { int: true })).toThrow('--n must be an integer')
    expect(() => numFlag('0', '--n', 5, { min: 1, max: 9 })).toThrow('between 1 and 9')
    expect(() => numFlag('10', '--n', 5, { min: 1, max: 9 })).toThrow(FlagError)
    expect(numFlag('9', '--n', 5, { min: 1, max: 9 })).toBe(9)
  })
})

describe('limitFlag', () => {
  it('defaults and bounds', () => {
    expect(limitFlag(undefined, 20)).toBe(20)
    expect(limitFlag('0', 20)).toBe(0)
    expect(limitFlag('1', 20)).toBe(1)
    expect(limitFlag('500', 20)).toBe(500)
    expect(limitFlag('1000', 20)).toBe(1000)
    expect(limitFlag('2000', 20)).toBe(2000)
    expect(limitFlag('10000', 20)).toBe(10_000)
    expect(() => limitFlag('10001', 20)).toThrow(FlagError)
    expect(() => limitFlag('-1', 20)).toThrow(FlagError)
    expect(() => limitFlag('2.5', 20)).toThrow(FlagError)
    expect(() => limitFlag('abc', 20)).toThrow(FlagError)
  })
})
