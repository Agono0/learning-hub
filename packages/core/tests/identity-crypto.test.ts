import { describe, expect, it } from 'vitest'
import {
  generateIdentityKeyPair,
  identityChallenge,
  signIdentityPayload,
  verifyIdentityPayload,
} from '../src/identity-crypto'

describe('device identity crypto (ECDSA P-256 over WebCrypto)', () => {
  it('round-trips a signature for the matching key pair', async () => {
    const pair = await generateIdentityKeyPair()
    const challenge = identityChallenge('usr_test123', 1730000000000)
    const signature = await signIdentityPayload(pair.privateKey, challenge)
    expect(signature.length).toBeGreaterThan(40)
    await expect(verifyIdentityPayload(pair.publicKey, challenge, signature)).resolves.toBe(true)
  })

  it('rejects a signature over tampered payload', async () => {
    const pair = await generateIdentityKeyPair()
    const signature = await signIdentityPayload(pair.privateKey, 'payload A')
    await expect(verifyIdentityPayload(pair.publicKey, 'payload B', signature)).resolves.toBe(false)
  })

  it('rejects a signature from a different key pair', async () => {
    const [a, b] = await Promise.all([generateIdentityKeyPair(), generateIdentityKeyPair()])
    const signature = await signIdentityPayload(a.privateKey, 'challenge')
    await expect(verifyIdentityPayload(b.publicKey, 'challenge', signature)).resolves.toBe(false)
  })

  it('produces distinct key pairs and never repeats', async () => {
    const [a, b] = await Promise.all([generateIdentityKeyPair(), generateIdentityKeyPair()])
    expect(a.publicKey).not.toBe(b.publicKey)
    expect(a.privateKey).not.toBe(b.privateKey)
  })
})
