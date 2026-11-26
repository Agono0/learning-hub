/**
 * Invite codes for remote leagues (INACTIVE GROUNDWORK).
 *
 * Privacy model: a member creates an invite by signing the SHA-256 digest of
 * a secret code they generated. The authority stores only digests, so its
 * state, its public views and its logs never contain a usable code. The
 * secret travels once, inside the invitee's signed join, and is digested
 * before the reducer sees it. A code is therefore a bearer secret: anyone who
 * has it can join until it expires, is revoked or is used up. It proves
 * "someone with the code asked to join", not who that person is.
 */

export const INVITE_MIN_TTL_MS = 60_000
export const INVITE_MAX_TTL_MS = 7 * 24 * 60 * 60_000
export const INVITE_MAX_USES = 20
export const MAX_ACTIVE_INVITES_PER_MEMBER = 5
/** Spent invites stay this long so a stale code is refused, not "unknown". */
export const INVITE_TOMBSTONE_MS = 7 * 24 * 60 * 60_000
/** Hard ceiling on stored invites, whatever their state. */
export const MAX_STORED_INVITES = 1000

const DIGEST_RE = /^[0-9a-f]{64}$/

export function isInviteDigest(value: string): boolean {
  return DIGEST_RE.test(value)
}

/** 24 random bytes as base64url: 32 characters, 192 bits. */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Lower-case hex SHA-256 of the code's UTF-8 bytes. */
export async function digestInviteCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code)
  const hash = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Most moderation entries a league keeps; older ones fall off. */
export const MAX_MOD_LOG = 50

/** Most handles a league will keep blocked. */
export const MAX_BLOCKED = 200
