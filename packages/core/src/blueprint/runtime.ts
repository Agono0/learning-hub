/**
 * Blueprint runtime: a pure, serializable state machine.
 *
 * `startSession` -> `completePhase` (repeat) -> finished. No clock, no I/O and
 * no randomness: every function takes the state and returns a new one, so a
 * session can be stored as JSON, replayed in a test, or driven from the web
 * UI, the CLI or an MCP tool alike. Branch conditions are structured data
 * (never evaluated code).
 */
import { BLUEPRINT_LIMITS, type Blueprint, type BlueprintCondition, type Metric } from './schema'
import { resolveNumber, resolveParams, type BlueprintIssue, type ParamValues } from './validate'

/** Lifecycle of one session. */
export type SessionStatus = 'running' | 'finished' | 'aborted'

/** One finished phase in the session log. */
export interface PhaseRecord {
  phaseId: string
  /** 1-based repeat round of that phase. */
  round: number
  score?: number
  confidence?: number
  /** Phase the machine moved to, or null when the session finished. */
  next: string | null
  /** ISO timestamp supplied by the caller, if any. */
  at?: string
  skipped?: boolean
}

/** Complete, JSON-safe session state. */
export interface BlueprintSession {
  blueprintId: string
  blueprintVersion: string
  params: ParamValues
  status: SessionStatus
  /** Current phase id; the last phase id once finished. */
  phaseId: string
  /** 1-based repeat round for the current phase. */
  round: number
  /** Completed phase count (the loop guard). */
  steps: number
  history: PhaseRecord[]
  counters: Record<string, number>
  /** Why the session ended early, when it did. */
  endReason?: 'finished' | 'aborted' | 'step-limit'
}

/** What the learner reports when finishing a phase. */
export interface PhaseResult {
  /** 0-100, required when the phase is `scored` and not skipped. */
  score?: number
  /** 0-100 self-rated confidence, optional. */
  confidence?: number
  at?: string
  skipped?: boolean
}

/** Outcome of {@link completePhase}: new state, or a problem with the input. */
export type CompleteOutcome =
  { ok: true; session: BlueprintSession } | { ok: false; issues: BlueprintIssue[] }

/** Start a session at the first phase. Rejects invalid param overrides. */
export function startSession(
  blueprint: Blueprint,
  overrides: Record<string, unknown> = {},
): { ok: true; session: BlueprintSession } | { ok: false; issues: BlueprintIssue[] } {
  const { params, issues } = resolveParams(blueprint, overrides)
  if (issues.length > 0) return { ok: false, issues }
  const counters: Record<string, number> = {}
  for (const t of blueprint.triggers) counters[t.counter] = 0
  return {
    ok: true,
    session: {
      blueprintId: blueprint.id,
      blueprintVersion: blueprint.version,
      params,
      status: 'running',
      phaseId: blueprint.phases[0]!.id,
      round: 1,
      steps: 0,
      history: [],
      counters,
    },
  }
}

/** Evaluate one structured condition. Missing metrics never match. */
export function conditionHolds(
  cond: BlueprintCondition,
  metrics: Partial<Record<Metric, number>>,
  params: ParamValues,
): boolean {
  const actual = metrics[cond.metric]
  const target = resolveNumber(cond.value, params)
  if (actual === undefined || target === null) return false
  switch (cond.op) {
    case '<':
      return actual < target
    case '<=':
      return actual <= target
    case '>':
      return actual > target
    case '>=':
      return actual >= target
    case '==':
      return actual === target
  }
}

/** The phase definition the session is currently on. */
export function currentPhase(blueprint: Blueprint, session: BlueprintSession) {
  return blueprint.phases.find((p) => p.id === session.phaseId)
}

/** How many rounds the current phase runs for in this session. */
export function roundsFor(
  blueprint: Blueprint,
  session: BlueprintSession,
  phaseId: string,
): number {
  const p = blueprint.phases.find((q) => q.id === phaseId)
  if (!p || p.repeat === undefined) return 1
  const n = resolveNumber(p.repeat, session.params)
  return n === null ? 1 : Math.max(1, Math.min(BLUEPRINT_LIMITS.maxRepeat, Math.floor(n)))
}

/**
 * Finish the current phase. Repeats come first (the phase runs again until its
 * round count is met), then branches in order, then `next`, then the following
 * phase. Falling off the end finishes the session. The step limit ends a
 * runaway loop instead of hanging a host.
 */
export function completePhase(
  blueprint: Blueprint,
  session: BlueprintSession,
  result: PhaseResult = {},
): CompleteOutcome {
  if (session.status !== 'running')
    return { ok: false, issues: [{ path: 'session', message: `session is ${session.status}` }] }
  const idx = blueprint.phases.findIndex((p) => p.id === session.phaseId)
  const phase = blueprint.phases[idx]
  if (!phase)
    return { ok: false, issues: [{ path: 'session.phaseId', message: 'phase not in blueprint' }] }

  const issues: BlueprintIssue[] = []
  const inRange = (v: number | undefined, key: string) => {
    if (v === undefined) return
    if (!Number.isFinite(v) || v < 0 || v > 100)
      issues.push({ path: key, message: 'must be 0-100' })
  }
  inRange(result.score, 'score')
  inRange(result.confidence, 'confidence')
  if (phase.scored && !result.skipped && result.score === undefined)
    issues.push({ path: 'score', message: `phase "${phase.id}" needs a score` })
  if (issues.length > 0) return { ok: false, issues }

  const steps = session.steps + 1
  const record: PhaseRecord = {
    phaseId: phase.id,
    round: session.round,
    next: null,
    ...(result.score !== undefined ? { score: result.score } : {}),
    ...(result.confidence !== undefined ? { confidence: result.confidence } : {}),
    ...(result.at ? { at: result.at } : {}),
    ...(result.skipped ? { skipped: true } : {}),
  }

  const finish = (reason: BlueprintSession['endReason']): CompleteOutcome => ({
    ok: true,
    session: {
      ...session,
      status: 'finished',
      steps,
      history: [...session.history, record],
      endReason: reason,
    },
  })

  if (steps >= BLUEPRINT_LIMITS.maxSteps) return finish('step-limit')

  const goTo = (phaseId: string, round: number): CompleteOutcome => ({
    ok: true,
    session: {
      ...session,
      phaseId,
      round,
      steps,
      history: [...session.history, { ...record, next: phaseId }],
    },
  })

  // 1. repeat the same phase
  if (!result.skipped && session.round < roundsFor(blueprint, session, phase.id))
    return goTo(phase.id, session.round + 1)

  // 2. branches (skipped phases take no branch)
  if (!result.skipped) {
    const metrics: Partial<Record<Metric, number>> = {}
    if (result.score !== undefined) metrics.score = result.score
    if (result.confidence !== undefined) metrics.confidence = result.confidence
    for (const b of phase.branches)
      if (conditionHolds(b.when, metrics, session.params)) return goTo(b.goto, 1)
  }

  // 3. explicit next, else the following phase, else done
  const nextId = phase.next ?? blueprint.phases[idx + 1]?.id
  if (!nextId) return finish('finished')
  return goTo(nextId, 1)
}

/** End a running session early. */
export function abortSession(session: BlueprintSession): BlueprintSession {
  if (session.status !== 'running') return session
  return { ...session, status: 'aborted', endReason: 'aborted' }
}

/** Count a platform event against the blueprint's triggers. */
export function recordEvent(
  blueprint: Blueprint,
  session: BlueprintSession,
  event: string,
): BlueprintSession {
  const hits = blueprint.triggers.filter((t) => t.event === event)
  if (hits.length === 0 || session.status !== 'running') return session
  const counters = { ...session.counters }
  for (const t of hits) counters[t.counter] = (counters[t.counter] ?? 0) + 1
  return { ...session, counters }
}

/** Summary numbers for a (finished or running) session. */
export function summarizeSession(session: BlueprintSession): {
  steps: number
  scoreAverage: number | null
  scoreCount: number
  skipped: number
} {
  const scores = session.history.flatMap((h) => (h.score !== undefined ? [h.score] : []))
  return {
    steps: session.steps,
    scoreAverage:
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
    scoreCount: scores.length,
    skipped: session.history.filter((h) => h.skipped).length,
  }
}
