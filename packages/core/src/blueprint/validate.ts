/**
 * Blueprint validation: zod shape first, then the semantic rules a schema
 * cannot express. Never throws; returns every problem at once so an author
 * can fix a blueprint in one pass.
 */
import {
  BLUEPRINT_LIMITS,
  blueprintSchema,
  type Blueprint,
  type BlueprintParam,
  type NumberOrParam,
} from './schema'

/** One validation problem with a JSON-path-ish location. */
export interface BlueprintIssue {
  path: string
  message: string
}

/** Result of {@link validateBlueprint}. `blueprint` is set only when `ok`. */
export type BlueprintValidation =
  | { ok: true; blueprint: Blueprint; warnings: BlueprintIssue[] }
  | { ok: false; issues: BlueprintIssue[] }

/** Resolved param values for one session. */
export type ParamValues = Record<string, number | string | boolean>

/** Read a literal or param-backed number. Returns null when it cannot be resolved. */
export function resolveNumber(value: NumberOrParam, params: ParamValues): number | null {
  if (typeof value === 'number') return value
  const v = params[value.param]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Defaults for every declared param. */
export function defaultParams(blueprint: Blueprint): ParamValues {
  const out: ParamValues = {}
  for (const [key, def] of Object.entries(blueprint.params)) out[key] = def.default
  return out
}

/**
 * Check user-supplied param values against the declared params and fill in
 * defaults. Unknown keys and out-of-range values are reported, not coerced.
 */
export function resolveParams(
  blueprint: Blueprint,
  overrides: Record<string, unknown> = {},
): { params: ParamValues; issues: BlueprintIssue[] } {
  const params = defaultParams(blueprint)
  const issues: BlueprintIssue[] = []
  for (const [key, raw] of Object.entries(overrides)) {
    const def: BlueprintParam | undefined = blueprint.params[key]
    if (!def) {
      issues.push({ path: `params.${key}`, message: 'unknown param' })
      continue
    }
    if (def.type === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        issues.push({ path: `params.${key}`, message: 'expected a number' })
      } else if (
        (def.min !== undefined && raw < def.min) ||
        (def.max !== undefined && raw > def.max)
      ) {
        issues.push({
          path: `params.${key}`,
          message: `must be between ${def.min ?? '-inf'} and ${def.max ?? 'inf'}`,
        })
      } else params[key] = raw
    } else if (def.type === 'choice') {
      if (typeof raw !== 'string' || !def.options.includes(raw))
        issues.push({ path: `params.${key}`, message: `must be one of ${def.options.join(', ')}` })
      else params[key] = raw
    } else if (typeof raw !== 'boolean') {
      issues.push({ path: `params.${key}`, message: 'expected true or false' })
    } else params[key] = raw
  }
  return { params, issues }
}

/** Parse + semantically validate an unknown value as a blueprint. */
export function validateBlueprint(input: unknown): BlueprintValidation {
  const parsed = blueprintSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.') || 'blueprint',
        message: i.message,
      })),
    }
  }
  const bp = parsed.data
  const issues: BlueprintIssue[] = []
  const warnings: BlueprintIssue[] = []

  if (Object.keys(bp.params).length > BLUEPRINT_LIMITS.maxParams)
    issues.push({ path: 'params', message: `at most ${BLUEPRINT_LIMITS.maxParams} params` })

  // params: defaults inside declared bounds
  for (const [key, def] of Object.entries(bp.params)) {
    if (def.type === 'number') {
      if (def.min !== undefined && def.max !== undefined && def.min > def.max)
        issues.push({ path: `params.${key}`, message: 'min is greater than max' })
      if (
        (def.min !== undefined && def.default < def.min) ||
        (def.max !== undefined && def.default > def.max)
      )
        issues.push({ path: `params.${key}.default`, message: 'default is outside min/max' })
    } else if (def.type === 'choice' && !def.options.includes(def.default)) {
      issues.push({ path: `params.${key}.default`, message: 'default is not one of options' })
    }
  }

  const ids = new Set<string>()
  bp.phases.forEach((p, i) => {
    if (ids.has(p.id))
      issues.push({ path: `phases.${i}.id`, message: `duplicate phase id "${p.id}"` })
    ids.add(p.id)
  })

  const checkNum = (v: NumberOrParam | undefined, path: string, min: number, max: number) => {
    if (v === undefined) return
    if (typeof v === 'number') {
      if (v < min || v > max) issues.push({ path, message: `must be between ${min} and ${max}` })
      return
    }
    const def = bp.params[v.param]
    if (!def) issues.push({ path, message: `unknown param "${v.param}"` })
    else if (def.type !== 'number')
      issues.push({ path, message: `param "${v.param}" is not a number` })
    else {
      const lo = def.min ?? def.default
      const hi = def.max ?? def.default
      if (lo < min || hi > max)
        issues.push({
          path,
          message: `param "${v.param}" can leave the allowed range ${min}-${max}; set its min and max`,
        })
    }
  }

  bp.phases.forEach((p, i) => {
    const at = `phases.${i}`
    checkNum(p.minutes, `${at}.minutes`, 0, BLUEPRINT_LIMITS.maxMinutes)
    checkNum(p.repeat, `${at}.repeat`, 1, BLUEPRINT_LIMITS.maxRepeat)
    if (p.next && !ids.has(p.next))
      issues.push({ path: `${at}.next`, message: `unknown phase "${p.next}"` })
    p.branches.forEach((b, j) => {
      if (!ids.has(b.goto))
        issues.push({ path: `${at}.branches.${j}.goto`, message: `unknown phase "${b.goto}"` })
      checkNum(b.when.value, `${at}.branches.${j}.when.value`, 0, 100)
      if (!p.scored && b.when.metric === 'score')
        issues.push({
          path: `${at}.branches.${j}.when`,
          message: 'a score branch needs "scored": true on this phase',
        })
    })
  })

  const counters = new Set<string>()
  bp.triggers.forEach((t, i) => {
    if (counters.has(t.counter))
      issues.push({ path: `triggers.${i}.counter`, message: `duplicate counter "${t.counter}"` })
    counters.add(t.counter)
  })

  if (issues.length > 0) return { ok: false, issues }

  // reachability + guaranteed exit (warnings, not errors)
  const reach = reachablePhases(bp)
  bp.phases.forEach((p, i) => {
    if (!reach.has(p.id))
      warnings.push({ path: `phases.${i}`, message: `phase "${p.id}" can never be reached` })
  })
  if (!canFinish(bp))
    warnings.push({
      path: 'phases',
      message: 'no path reaches the end; the session only stops at the step limit',
    })
  return { ok: true, blueprint: bp, warnings }
}

/** Where a phase can lead (every branch, explicit next, or the following phase). */
export function successors(bp: Blueprint, index: number): (string | null)[] {
  const p = bp.phases[index]
  if (!p) return []
  const out: (string | null)[] = p.branches.map((b) => b.goto)
  if (p.next) out.push(p.next)
  else out.push(bp.phases[index + 1]?.id ?? null)
  return out
}

/** Phase ids reachable from the first phase. */
export function reachablePhases(bp: Blueprint): Set<string> {
  const seen = new Set<string>()
  const stack = [bp.phases[0]!.id]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const idx = bp.phases.findIndex((p) => p.id === id)
    for (const s of successors(bp, idx)) if (s) stack.push(s)
  }
  return seen
}

/** True when some path from the first phase falls off the end (finishes). */
export function canFinish(bp: Blueprint): boolean {
  const seen = new Set<string>()
  const stack = [bp.phases[0]!.id]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const idx = bp.phases.findIndex((p) => p.id === id)
    for (const s of successors(bp, idx)) {
      if (s === null) return true
      stack.push(s)
    }
  }
  return false
}

/** Planned total minutes along the straight "no branch taken" path, with repeats. */
export function estimateMinutes(bp: Blueprint, params: ParamValues = defaultParams(bp)): number {
  let total = 0
  let idx = 0
  let guard = 0
  const visited = new Set<string>()
  while (idx >= 0 && idx < bp.phases.length && guard++ < BLUEPRINT_LIMITS.maxPhases) {
    const p = bp.phases[idx]!
    if (visited.has(p.id)) break
    visited.add(p.id)
    const mins = resolveNumber(p.minutes, params) ?? 0
    const reps = p.repeat === undefined ? 1 : (resolveNumber(p.repeat, params) ?? 1)
    total += mins * reps
    idx = p.next ? bp.phases.findIndex((q) => q.id === p.next) : idx + 1
  }
  return Math.round(total * 10) / 10
}
