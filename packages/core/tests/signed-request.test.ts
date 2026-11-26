import { describe, expect, it } from 'vitest'
import {
  generateIdentityKeyPair,
  joinAssertionPayload,
  requestSigningPayload,
  digestHex,
  signIdentityPayload,
  verifyIdentityPayload,
} from '../src/identity-crypto'

describe('signed request payloads', () => {
  it('hashes known vectors', async () => {
    expect(await digestHex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(await digestHex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('binds every field of the request payload', async () => {
    const base = {
      method: 'post',
      host: 'w.example',
      pathAndQuery: '/a?x=1',
      timestamp: 5,
      bodySha256: 'ab',
    }
    const p = requestSigningPayload(base)
    expect(p).toBe('lh-req:v1|POST|w.example|/a?x=1|5|ab')
    for (const k of Object.keys(base) as (keyof typeof base)[]) {
      const changed = { ...base, [k]: k === 'timestamp' ? 6 : `${base[k]}x` }
      expect(requestSigningPayload(changed)).not.toBe(p)
    }
  })

  it('round-trips with the existing sign/verify functions and rejects other payloads', async () => {
    const pair = await generateIdentityKeyPair()
    const payload = joinAssertionPayload({ host: 'w.example', room: 'ABC123', exp: 10, jti: 'j1' })
    const sig = await signIdentityPayload(pair.privateKey, payload)
    expect(await verifyIdentityPayload(pair.publicKey, payload, sig)).toBe(true)
    const other = joinAssertionPayload({ host: 'w.example', room: 'ABC124', exp: 10, jti: 'j1' })
    expect(await verifyIdentityPayload(pair.publicKey, other, sig)).toBe(false)
    expect(payload.startsWith('lh-join:v1|')).toBe(true)
  })
})
