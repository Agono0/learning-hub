/**
 * Input bounds for the BossRaid socket and the raid-create route.
 *
 * Where the numbers come from:
 * - alias: the identity route validates `alias` as 1..40 (apps/web identity handler), and
 *   the stats endpoint in validation.ts uses the same 40.
 * - id: the web client sends `identity.userId`. That is `usr_` + 32 hex (identity-id.ts), the
 *   older `usr_` + base36 default from getOnlineIdentity, or the literal 'usr_self'. All are
 *   under 64 characters. No character set is enforced because the callers do not guarantee
 *   one; the id must be a non-empty string without control characters.
 * - bossKey: the web raid route validates 1..40.
 * - roster: ROOM_MAX_PARTICIPANTS (50), the same limit study rooms use.
 *
 * Lengths are UTF-16 code units (JS string length), the unit zod's .max() counts. The frame
 * limit is in UTF-8 bytes of the raw message.
 */
import { ROOM_MAX_PARTICIPANTS, type Validated } from './validation'

export const RAID_LIMITS = {
  idMax: 64,
  aliasMax: 40,
  bossKeyMax: 40,
  maxMembers: ROOM_MAX_PARTICIPANTS,
  /** Worst legitimate join is measured in the tests; this leaves room above it. */
  maxFrameBytes: 1024,
  combatLogEntries: 25,
} as const

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

const encoder = new TextEncoder()

/** UTF-8 byte length of a raw socket message (string or binary). */
export function frameByteLength(message: string | ArrayBuffer): number {
  return typeof message === 'string' ? encoder.encode(message).byteLength : message.byteLength
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > max || CONTROL.test(v)) return null
  return v
}

export interface RaidJoin {
  id: string
  alias: string
}

/** Validates the `member` object of a join frame. Returns a refusal code, never throws. */
export function parseRaidJoin(data: unknown): Validated<RaidJoin> {
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid_join' }
  const member = (data as Record<string, unknown>).member
  if (!member || typeof member !== 'object' || Array.isArray(member)) {
    return { ok: false, error: 'invalid_join' }
  }
  const m = member as Record<string, unknown>
  const id = cleanText(m.id, RAID_LIMITS.idMax)
  if (id === null) return { ok: false, error: 'invalid_join' }
  const alias = cleanText(m.alias, RAID_LIMITS.aliasMax)
  if (alias === null || alias.trim().length === 0) return { ok: false, error: 'invalid_join' }
  return { ok: true, value: { id, alias } }
}

/** A boss key must be an own key of the roster; `__proto__`, `toString` and the like are not. */
export function isOwnBossKey(roster: object, key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length >= 1 &&
    key.length <= RAID_LIMITS.bossKeyMax &&
    Object.hasOwn(roster, key)
  )
}
