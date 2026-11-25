/**
 * Keyed documents: stable identity for the parts of a course.
 *
 * Diff, merge and refactors all need to say "this lesson" or "this exercise"
 * across two versions. Modules, lessons, skills, projects and stages carry
 * slugs. Exercises carry an optional `id`; when it is missing we fall back to a
 * content key and, for edited exercises, to a similarity match. This file holds
 * those identity rules plus tiny helpers that read and write by keyed path.
 */
import type { Exercise } from '../../practice/schema'
import { exerciseToText } from '../../practice/to-text'
import { hashString } from '../../math'
import { textSimilarity } from './terms'

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** Deep equality for JSON values. Key order does not matter. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    const ak = Object.keys(ao).filter((k) => ao[k] !== undefined)
    const bk = Object.keys(bo).filter((k) => bo[k] !== undefined)
    if (ak.length !== bk.length) return false
    for (const k of ak) if (!deepEqual(ao[k], bo[k])) return false
    return true
  }
  return false
}

/** JSON with sorted keys, for hashing. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Short stable hash of any JSON value. */
export function contentHash(value: unknown): string {
  // Four 32-bit hashes with different prefixes: 128 bits, enough to catch any
  // accidental change. It is a staleness check, not a defence against an attacker.
  const text = stableStringify(value)
  return ['a', 'b', 'c', 'd'].map((p) => hashString(`${p}:${text}`).toString(36)).join('')
}

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Identity of an exercise inside its list: its id, or a hash of its question and type. */
export function exerciseKey(e: Exercise): string {
  if (e.id) return `id:${e.id}`
  const front = exerciseToText(e).front.toLowerCase().replace(/\s+/g, ' ').trim()
  return `c:${e.type}:${contentHash(front)}`
}

/** Keys for a list of exercises; duplicates get `#2`, `#3`… so keys are unique. */
export function exerciseKeys(list: readonly Exercise[]): string[] {
  const seen = new Map<string, number>()
  return list.map((e) => {
    const k = exerciseKey(e)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return n === 1 ? k : `${k}#${n}`
  })
}

/** Why two exercises were paired by similarity instead of by id or exact content. */
export interface PairEvidence {
  score: number
  before: string
  after: string
  /** Another unmatched exercise scored within 0.1, so the pairing may be wrong. */
  ambiguous: boolean
}

export interface ExerciseMatch {
  /** For each item in `other`, the base key it corresponds to, or its own key if new. */
  keys: string[]
  /** Base keys that matched an edited exercise (not identical), by other index. */
  edited: Set<number>
  /** The paired texts and score for each similarity match, by other index. */
  evidence: Map<number, PairEvidence>
}

/**
 * Match `other` against `base`: same key first, then the closest unmatched
 * exercise of the same type whose question is at least 0.6 similar. The
 * second step is a guess, so callers surface it as "changed", never silently.
 */
export function matchExercises(
  base: readonly Exercise[],
  other: readonly Exercise[],
): ExerciseMatch {
  const baseKeys = exerciseKeys(base)
  const otherKeys = exerciseKeys(other)
  const baseByKey = new Map(baseKeys.map((k, i) => [k, i]))
  const taken = new Set<string>()
  const keys: string[] = new Array(other.length)
  const unmatched: number[] = []
  other.forEach((_, i) => {
    const k = otherKeys[i]!
    if (baseByKey.has(k)) {
      keys[i] = k
      taken.add(k)
    } else unmatched.push(i)
  })
  const edited = new Set<number>()
  const evidence = new Map<number, PairEvidence>()
  for (const i of unmatched) {
    const e = other[i]!
    const front = exerciseToText(e).front
    let best = -1
    let bestScore = 0.6
    let runnerUp = 0
    baseKeys.forEach((bk, bi) => {
      if (taken.has(bk) || base[bi]!.type !== e.type) return
      const score = textSimilarity(exerciseToText(base[bi]!).front, front)
      if (score > bestScore) {
        if (bestScore > 0.6) runnerUp = Math.max(runnerUp, bestScore)
        bestScore = score
        best = bi
      } else if (score > 0.6) runnerUp = Math.max(runnerUp, score)
    })
    if (best >= 0) {
      keys[i] = baseKeys[best]!
      taken.add(baseKeys[best]!)
      edited.add(i)
      evidence.set(i, {
        score: Math.round(bestScore * 100) / 100,
        before: exerciseToText(base[best]!).front,
        after: front,
        ambiguous: runnerUp > 0 && bestScore - runnerUp < 0.1,
      })
    } else keys[i] = otherKeys[i]!
  }
  return { keys, edited, evidence }
}

/**
 * Keyed paths: `modules[slug=basics].lessons[slug=intro].title`.
 * Segment `[slug=x]` finds an array element by its `slug`; `[id=x]`/`[key=x]`
 * use `id`/`key`; `[0]` is a plain index. Used so patches survive reordering.
 */
export type PathSegment = { prop: string } | { index: number } | { by: string; value: string }

export function parseKeyedPath(path: string): PathSegment[] {
  const out: PathSegment[] = []
  const re = /([^.[\]]+)|\[(\d+)\]|\[(\w+)=((?:[^\]\\]|\\.)*)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(path))) {
    if (m[1] !== undefined) out.push({ prop: m[1] })
    else if (m[2] !== undefined) out.push({ index: Number(m[2]) })
    else out.push({ by: m[3]!, value: m[4]!.replace(/\\(.)/g, '$1') })
  }
  return out
}

export function keyedSegment(by: string, value: string): string {
  return `[${by}=${value.replace(/[\\\]]/g, '\\$&')}]`
}

function step(node: unknown, seg: PathSegment): unknown {
  if ('prop' in seg) return isPlainObject(node) ? node[seg.prop] : undefined
  if (!Array.isArray(node)) return undefined
  if ('index' in seg) return node[seg.index]
  return node.find((x) => isPlainObject(x) && x[seg.by] === seg.value)
}

/** Read a value by keyed path. */
export function getAtPath(root: unknown, path: string): unknown {
  let node = root
  for (const seg of parseKeyedPath(path)) {
    node = step(node, seg)
    if (node === undefined) return undefined
  }
  return node
}

/** Write a value by keyed path. Returns false when the parent does not exist. */
export function setAtPath(root: unknown, path: string, value: unknown): boolean {
  const segs = parseKeyedPath(path)
  if (segs.length === 0) return false
  let node = root
  for (const seg of segs.slice(0, -1)) {
    node = step(node, seg)
    if (node === undefined) return false
  }
  const last = segs[segs.length - 1]!
  if ('prop' in last) {
    if (!isPlainObject(node)) return false
    if (value === undefined) delete node[last.prop]
    else node[last.prop] = value
    return true
  }
  if (!Array.isArray(node)) return false
  const idx =
    'index' in last
      ? last.index
      : node.findIndex((x) => isPlainObject(x) && x[last.by] === last.value)
  if (idx < 0) return false
  if (value === undefined) node.splice(idx, 1)
  else node[idx] = value
  return true
}
