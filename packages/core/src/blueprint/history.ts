/**
 * Session history: a bounded archive of finished or stopped sessions.
 *
 * Every score here was typed in by the learner, so each step carries a
 * `source` of "self-reported". The field exists so a future graded source
 * (a review, a quiz) can be told apart from typed-in numbers instead of being
 * averaged together silently. Pure functions, JSON in and out, no clock: the
 * caller supplies timestamps and ids.
 */
import { z } from 'zod'
import { BLUEPRINT_LIMITS, type Blueprint } from './schema'
import { roundsFor, summarizeSession, type BlueprintSession } from './runtime'

/** Most entries a history keeps (oldest are dropped first). */
export const MAX_HISTORY_ENTRIES = 200

/** Where a score came from. Only learner-typed scores exist today. */
export const SCORE_SOURCES = ['self-reported'] as const
/** One of {@link SCORE_SOURCES}. */
export type ScoreSource = (typeof SCORE_SOURCES)[number]

const pct = z.number().min(0).max(100)

/** One archived step (a phase round). */
export const historyStepSchema = z
  .object({
    phaseId: z.string().min(1).max(48),
    title: z.string().min(1).max(80),
    round: z.number().int().min(1).max(BLUEPRINT_LIMITS.maxRepeat),
    rounds: z.number().int().min(1).max(BLUEPRINT_LIMITS.maxRepeat),
    score: pct.optional(),
    confidence: pct.optional(),
    skipped: z.boolean().optional(),
    at: z.string().max(40).optional(),
    /** Present on every step that has a score. */
    source: z.enum(SCORE_SOURCES).optional(),
  })
  .strict()
/** One archived step. */
export type HistoryStep = z.infer<typeof historyStepSchema>

/** One archived session. */
export const historyEntrySchema = z
  .object({
    id: z.string().min(1).max(64),
    blueprintId: z.string().min(1).max(48),
    blueprintVersion: z.string().min(1).max(20),
    blueprintName: z.string().min(1).max(60),
    endedAt: z.string().min(1).max(40),
    status: z.enum(['finished', 'aborted']),
    endReason: z.enum(['finished', 'aborted', 'step-limit']),
    params: z
      .record(z.string().max(48), z.union([z.number().finite(), z.string().max(60), z.boolean()]))
      .refine((p) => Object.keys(p).length <= BLUEPRINT_LIMITS.maxParams, 'too many params'),
    steps: z.array(historyStepSchema).max(BLUEPRINT_LIMITS.maxSteps),
    scoreAverage: pct.nullable(),
    scoreCount: z.number().int().min(0),
    skipped: z.number().int().min(0),
  })
  .strict()
/** One archived session. */
export type HistoryEntry = z.infer<typeof historyEntrySchema>

/**
 * Archive a session that is no longer running. Returns null while it still
 * runs. `id` and `now` come from the caller (no hidden clock or randomness).
 */
export function entryFromSession(
  blueprint: Blueprint,
  session: BlueprintSession,
  meta: { id: string; now: string },
): HistoryEntry | null {
  if (session.status === 'running') return null
  const sum = summarizeSession(session)
  return {
    id: meta.id,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    blueprintName: blueprint.name,
    endedAt: meta.now,
    status: session.status,
    endReason: session.endReason ?? (session.status === 'aborted' ? 'aborted' : 'finished'),
    params: { ...session.params },
    steps: session.history.map((h) => ({
      phaseId: h.phaseId,
      title: blueprint.phases.find((p) => p.id === h.phaseId)?.title ?? h.phaseId,
      round: h.round,
      rounds: roundsFor(blueprint, session, h.phaseId),
      ...(h.score !== undefined ? { score: h.score, source: 'self-reported' as const } : {}),
      ...(h.confidence !== undefined ? { confidence: h.confidence } : {}),
      ...(h.skipped ? { skipped: true } : {}),
      ...(h.at ? { at: h.at } : {}),
    })),
    scoreAverage: sum.scoreAverage,
    scoreCount: sum.scoreCount,
    skipped: sum.skipped,
  }
}

/** Newest first, no duplicate ids, capped at {@link MAX_HISTORY_ENTRIES}. */
export function addToHistory(
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  return [entry, ...history.filter((h) => h.id !== entry.id)].slice(0, MAX_HISTORY_ENTRIES)
}

/** Read an untrusted value as a history list. Invalid entries are dropped and counted. */
export function readHistory(data: unknown): { history: HistoryEntry[]; dropped: number } {
  if (!Array.isArray(data)) return { history: [], dropped: data === undefined ? 0 : 1 }
  const history: HistoryEntry[] = []
  let dropped = 0
  const seen = new Set<string>()
  for (const item of data) {
    const res = historyEntrySchema.safeParse(item)
    if (!res.success || seen.has(res.data.id)) {
      dropped++
      continue
    }
    if (history.length >= MAX_HISTORY_ENTRIES) {
      dropped++
      continue
    }
    seen.add(res.data.id)
    history.push(res.data)
  }
  return { history, dropped }
}
