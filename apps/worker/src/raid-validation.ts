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

export const RAID_INIT_LIMITS = { hpMax: 100_000, nameMax: 60 } as const
const INIT_STATUSES = ['waiting', 'fighting', 'victory', 'defeat'] as const
const INIT_KEYS = [
  'id',
  'bossKey',
  'bossName',
  'bossHp',
  'bossMaxHp',
  'partyHp',
  'partyMaxHp',
  'status',
] as const

export interface RaidInit {
  id: string
  bossKey: string
  bossName: string
  bossHp: number
  bossMaxHp: number
  partyHp: number
  partyMaxHp: number
  status: (typeof INIT_STATUSES)[number]
}

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

/**
 * Validates the body of the DO `/init` call. Every field the create route sends is required
 * and nothing else is accepted, so a body cannot inject `members` or `combatLog`. Hit points
 * are finite integers (NaN, Infinity, null and strings fail `Number.isInteger`).
 */
export function parseRaidInit(raw: unknown, roster: object): Validated<RaidInit> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_init' }
  }
  const b = raw as Record<string, unknown>
  if (Object.keys(b).some((k) => !(INIT_KEYS as readonly string[]).includes(k))) {
    return { ok: false, error: 'invalid_init' }
  }
  const id = cleanText(b.id, RAID_LIMITS.idMax)
  const bossName = cleanText(b.bossName, RAID_INIT_LIMITS.nameMax)
  const bossMaxHp = intIn(b.bossMaxHp, 1, RAID_INIT_LIMITS.hpMax)
  const partyMaxHp = intIn(b.partyMaxHp, 1, RAID_INIT_LIMITS.hpMax)
  const bossHp = bossMaxHp === null ? null : intIn(b.bossHp, 0, bossMaxHp)
  const partyHp = partyMaxHp === null ? null : intIn(b.partyHp, 0, partyMaxHp)
  const status = INIT_STATUSES.find((s) => s === b.status)
  if (
    id === null ||
    bossName === null ||
    !isOwnBossKey(roster, b.bossKey) ||
    bossMaxHp === null ||
    partyMaxHp === null ||
    bossHp === null ||
    partyHp === null ||
    status === undefined
  ) {
    return { ok: false, error: 'invalid_init' }
  }
  return {
    ok: true,
    value: { id, bossKey: b.bossKey, bossName, bossHp, bossMaxHp, partyHp, partyMaxHp, status },
  }
}
