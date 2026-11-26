import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  constantTimeEqual,
  hmacSha256,
  sha256Hex,
  toHex,
  utf8,
} from '../src/crypto-sync'
import { issueInviteToken, verifyInviteToken, canSubscribe } from '../src/share-channels'

describe('sha256', () => {
  it('matches the NIST vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })
  it('agrees with node:crypto around block boundaries and on long input', () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1_000_000]) {
      expect(sha256Hex('a'.repeat(n))).toBe(posixHash(n))
    }
  })
})

function posixHash(n: number): string {
  // independent reference through node:crypto
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('node:crypto') as typeof import('node:crypto'))
    .createHash('sha256')
    .update('a'.repeat(n))
    .digest('hex')
}

describe('hmacSha256', () => {
  it('matches RFC 4231 case 1 and case 6 (long key)', () => {
    expect(toHex(hmacSha256(new Uint8Array(20).fill(0x0b), utf8('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    )
    expect(
      toHex(
        hmacSha256(
          new Uint8Array(131).fill(0xaa),
          utf8('Test Using Larger Than Block-Size Key - Hash Key First'),
        ),
      ),
    ).toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54')
  })
})

describe('constantTimeEqual', () => {
  it('compares equal, different and different-length strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })
})

describe('canonicalJson', () => {
  it('sorts keys at every depth and keeps nested content', () => {
    expect(canonicalJson({ b: { z: 1, a: [2, { d: 1, c: 2 }] }, a: 'x' })).toBe(
      '{"a":"x","b":{"a":[2,{"c":2,"d":1}],"z":1}}',
    )
  })
  it('distinguishes values that differ only below the top level', () => {
    expect(canonicalJson({ front: { text: 'a' } })).not.toBe(
      canonicalJson({ front: { text: 'b' } }),
    )
  })
  it('drops undefined and functions in objects, nulls them in arrays, rejects cycles', () => {
    expect(canonicalJson({ a: undefined, b: () => 1, c: 1 })).toBe('{"c":1}')
    expect(canonicalJson([undefined, 1])).toBe('[null,1]')
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    expect(() => canonicalJson(cyc)).toThrow(TypeError)
  })
})

describe('invite tokens', () => {
  const secret = 'correct horse battery'
  it('are 128-bit HMACs, deterministic, and bound to channel and secret', () => {
    const t = issueInviteToken('chan-1', secret)
    expect(t).toMatch(/^lh2\.[A-Za-z0-9_-]{22}$/)
    expect(issueInviteToken('chan-1', secret)).toBe(t)
    expect(issueInviteToken('chan-2', secret)).not.toBe(t)
    expect(issueInviteToken('chan-1', secret + 'x')).not.toBe(t)
    expect(verifyInviteToken('chan-1', secret, ` ${t} `)).toBe(true)
  })
  it('match a pinned golden value, so the format cannot drift silently', () => {
    // independently computed: HMAC-SHA-256(key=secret, msg="lh-invite/v2:<channel>"), first 16 bytes, base64url
    expect(issueInviteToken('golden-channel', 'golden-secret-1')).toBe('lh2.fXSffyW-pSUGbP_QrJJ7Og')
  })
  it('refuse empty or short creator secrets', () => {
    expect(() => issueInviteToken('chan-1', '')).toThrow(/at least 8/)
    expect(() => issueInviteToken('chan-1', 'short')).toThrow(/at least 8/)
    const valid = issueInviteToken('chan-1', 'long-enough-secret')
    expect(verifyInviteToken('chan-1', '', valid)).toBe(false)
    expect(verifyInviteToken('chan-1', 'short', valid)).toBe(false)
  })
  it('tell the holder of an old-format token to ask for a re-issue', () => {
    const manifest = { visibility: 'invite', channelId: 'chan-1' } as never
    for (const [token, holderSecret] of [
      ['0a1b2c3d', undefined],
      ['0a1b2c3d', secret],
      ['lh2.short', undefined],
    ] as const) {
      const gate = canSubscribe(manifest, token, holderSecret)
      expect(gate.allowed).toBe(false)
      expect(gate.reason).toMatch(/re-issue/)
    }
    expect(canSubscribe(manifest, issueInviteToken('chan-1', secret)).allowed).toBe(true)
    expect(
      canSubscribe(manifest, issueInviteToken('chan-1', secret), 'other-secret-xyz').reason,
    ).toMatch(/re-issue/)
  })
  it('reject legacy 32-bit checksum tokens and malformed input', () => {
    expect(verifyInviteToken('chan-1', secret, '0a1b2c3d')).toBe(false)
    expect(verifyInviteToken('chan-1', secret, '')).toBe(false)
    expect(verifyInviteToken('chan-1', secret, 'lh2.')).toBe(false)
  })
  it('gate canSubscribe for invite channels', () => {
    const manifest = { visibility: 'invite', channelId: 'chan-1' } as never
    expect(canSubscribe(manifest, issueInviteToken('chan-1', secret), secret).allowed).toBe(true)
    expect(canSubscribe(manifest, 'deadbeef', secret).allowed).toBe(false)
    expect(canSubscribe(manifest, undefined, secret).allowed).toBe(false)
  })
})
