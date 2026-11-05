import { describe, expect, it } from 'vitest'
import { decryptSyncPayload, encryptSyncPayload, isEncryptedSyncEnvelope } from '../src/sync-crypto'

describe('sync-crypto (AES-256-GCM + PBKDF2-SHA256 E2EE)', () => {
  it('round-trips UTF-8 JSON payloads and validates envelope shape', async () => {
    const sample = JSON.stringify({
      version: 1,
      exportedAt: '2026-11-05T12:00:00.000Z',
      tables: {
        notes: [{ id: 1, title: '日本語 & Arabic مرحبا & Emoji 🧠', content: 'Active recall' }],
      },
    })

    const env1 = await encryptSyncPayload(sample, 'correct horse battery staple', {
      iterations: 10_000,
    })
    const env2 = await encryptSyncPayload(sample, 'correct horse battery staple', {
      iterations: 10_000,
    })

    expect(isEncryptedSyncEnvelope(env1)).toBe(true)
    expect(isEncryptedSyncEnvelope({ tables: {} })).toBe(false)
    // Fresh CSPRNG salt and IV on every encryption
    expect(env1.salt).not.toBe(env2.salt)
    expect(env1.iv).not.toBe(env2.iv)

    const decrypted = await decryptSyncPayload(env1, 'correct horse battery staple')
    expect(decrypted).toBe(sample)
  })

  it('rejects wrong passphrases and tampered ciphertext cleanly', async () => {
    const env = await encryptSyncPayload('{"hello":"world"}', 'my-secret-pass', {
      iterations: 10_000,
    })

    await expect(decryptSyncPayload(env, 'wrong-passphrase')).rejects.toThrow(/Decryption failed/)

    // Flip a character inside the base64 ciphertext
    const flipped = (env.ciphertext[0] === 'A' ? 'B' : 'A') + env.ciphertext.slice(1)
    await expect(
      decryptSyncPayload({ ...env, ciphertext: flipped }, 'my-secret-pass'),
    ).rejects.toThrow(/Decryption failed/)
  })
})
