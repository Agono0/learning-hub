/** Most cards one explicit `cardIds` request may name (keeps the URL short and the queue reviewable). */
export const MAX_EXPLICIT_CARD_IDS = 100

type ParsedCardIds = { ok: true; ids: number[] | null } | { ok: false; error: string }

/**
 * Parse the optional `cardIds` list: a comma-separated run of positive integers.
 * Absent means "no explicit list" (the ordinary queue). Present but empty,
 * malformed, duplicated or too long is an error, never silently trimmed.
 */
export function parseCardIds(raw: string | null): ParsedCardIds {
  if (raw === null) return { ok: true, ids: null }
  const parts = raw.split(',').map((x) => x.trim())
  if (parts.length === 0 || parts.some((x) => !/^[1-9]\d{0,14}$/.test(x)))
    return { ok: false, error: 'cardIds must be a comma-separated list of positive integers' }
  if (parts.length > MAX_EXPLICIT_CARD_IDS)
    return { ok: false, error: `cardIds takes at most ${MAX_EXPLICIT_CARD_IDS} cards` }
  const ids = parts.map(Number)
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'cardIds has duplicate ids' }
  return { ok: true, ids }
}
