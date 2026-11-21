/**
 * Slug helpers — stable kebab-case ids are LHCF's upsert keys, so the same
 * title must always produce the same slug.
 */
import { hashString } from '../../math'

/** "Intro to SQL: Joins!" → "intro-to-sql-joins". Non-Latin text keeps its letters. */
export function slugify(input: string, max = 60): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  // LHCF slugs are ASCII; transliterate-less scripts fall back to a stable hash.
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : `s-${hash(input)}`
}

/** Small stable string hash (FNV-1a, base36) for non-ASCII titles. */
function hash(input: string): string {
  return hashString(input).toString(36)
}

/**
 * Returns a function that hands out unique slugs within one scope:
 * "basics", "basics-2", "basics-3"…
 */
export function uniqueSlugger(): (wanted: string) => string {
  const used = new Set<string>()
  return (wanted) => {
    let candidate = wanted
    for (let n = 2; used.has(candidate); n++) candidate = `${wanted}-${n}`
    used.add(candidate)
    return candidate
  }
}
