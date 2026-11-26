/**
 * Prototype & Exemplar repository — the append-only session ledger shared by
 * every host (web handler, headless server, CLI). One definition, every host:
 * the save/list/stats queries live here so the web History section, the
 * dashboard widget and the hosts agree on the same facts.
 *
 * The table is APPEND-ONLY (rule 8, guarded by packages/db/tests/
 * rules-guard.test.ts): a completed session is a completed event — there is
 * no update, no delete and no resume path. "Start new" is the only forward
 * action, exactly like the engine's own session model.
 */
import { rowLimit } from '../limits'
import { desc, sql } from 'drizzle-orm'
import {
  categorizationEvaluationSchema,
  categorizationSubmissionSchema,
  dayKey,
  type CategorizationEvaluation,
  type CategorizationSubmission,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { prototypeExemplarSessions } from '../schema'

/** Input for one append (validated at the boundary; JSON columns typed in core). */
export interface SavePrototypeExemplarSessionInput {
  /** Canonical category set id. */
  setId: string
  /** The learner's raw ratings + classifications (stored as `trials_json`). */
  submission: CategorizationSubmission
  /** The engine's evaluation telemetry (stored as `metrics_json`). */
  evaluation: CategorizationEvaluation
  /** Override the timestamp (tests / backfill); defaults to now (ISO, UTC). */
  createdAt?: string
}

/** One stored session, JSON columns re-parsed into typed shapes. */
export interface StoredPrototypeExemplarSession {
  id: number
  setId: string
  phase: string
  trials: CategorizationSubmission
  metrics: CategorizationEvaluation
  accuracy: number
  createdAt: string
}

/** Append one completed session row (append-only; rule 8). */
export function saveSession(
  input: SavePrototypeExemplarSessionInput,
  database?: LearningHubDB,
): StoredPrototypeExemplarSession {
  const conn = database ?? getDb()
  const submission = categorizationSubmissionSchema.parse(input.submission)
  const evaluation = categorizationEvaluationSchema.parse(input.evaluation)
  const createdAt = input.createdAt ?? new Date().toISOString()
  const [row] = conn
    .insert(prototypeExemplarSessions)
    .values({
      setId: input.setId,
      phase: 'complete',
      trialsJson: JSON.stringify(submission),
      metricsJson: JSON.stringify(evaluation),
      accuracy: evaluation.overallAccuracy,
      createdAt,
    })
    .returning()
    .all()
  return {
    id: row!.id,
    setId: row!.setId,
    phase: row!.phase,
    trials: submission,
    metrics: evaluation,
    accuracy: row!.accuracy,
    createdAt: row!.createdAt,
  }
}

function parseStoredRow(row: {
  id: number
  setId: string
  phase: string
  trialsJson: string
  metricsJson: string
  accuracy: number
  createdAt: string
}): StoredPrototypeExemplarSession | null {
  try {
    const trials = categorizationSubmissionSchema.parse(JSON.parse(row.trialsJson))
    const metrics = categorizationEvaluationSchema.parse(JSON.parse(row.metricsJson))
    return {
      id: row.id,
      setId: row.setId,
      phase: row.phase,
      trials,
      metrics,
      accuracy: row.accuracy,
      createdAt: row.createdAt,
    }
  } catch {
    // A corrupt legacy row is skipped, never guessed — the history stays honest.
    return null
  }
}

/** Recent sessions, newest first (capped for calm; the History section shows ~10). */
export function listSessions(
  options: { limit?: number; database?: LearningHubDB } = {},
): StoredPrototypeExemplarSession[] {
  const conn = options.database ?? getDb()
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 100)
  const rows = conn
    .select()
    .from(prototypeExemplarSessions)
    .orderBy(desc(prototypeExemplarSessions.createdAt), desc(prototypeExemplarSessions.id))
    .limit(rowLimit(limit))
    .all()
  return rows.map(parseStoredRow).filter((s): s is StoredPrototypeExemplarSession => s !== null)
}

/** Newest stored session, or null when the learner has never completed one. */
export function getLastSession(database?: LearningHubDB): StoredPrototypeExemplarSession | null {
  return listSessions({ limit: 1, database })[0] ?? null
}

/** Per-UTC-day aggregates over the last `days` day buckets (0-filled). */
export interface PrototypeExemplarDayStats {
  /** Day key `YYYY-MM-DD` (UTC bucket — the repo-wide `dayKey` convention). */
  day: string
  /** Completed sessions that day. */
  sessions: number
  /** Mean accuracy 0-100 across that day's sessions (null when none). */
  meanAccuracy: number | null
  /** Best accuracy 0-100 that day (null when none). */
  bestAccuracy: number | null
}

/**
 * Day-bucketed session stats for the last `days` UTC days ending at `now`
 * (defaults: 7 days, now). Days without sessions are reported honestly as 0 /
 * null rather than omitted, so widgets render truthful gaps.
 */
export function statsByDay(
  options: { days?: number; now?: Date; database?: LearningHubDB } = {},
): PrototypeExemplarDayStats[] {
  const conn = options.database ?? getDb()
  const now = options.now ?? new Date()
  const dayCount = Math.min(Math.max(options.days ?? 7, 1), 30)
  const rows = conn.all<{
    day: string
    sessions: number
    mean_accuracy: number | null
    best_accuracy: number | null
  }>(sql`
    SELECT substr(created_at, 1, 10) AS day,
           count(*) AS sessions,
           round(avg(accuracy), 1) AS mean_accuracy,
           round(max(accuracy), 1) AS best_accuracy
    FROM prototype_exemplar_sessions
    GROUP BY substr(created_at, 1, 10)
  `)
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const stats: PrototypeExemplarDayStats[] = []
  for (let i = dayCount - 1; i >= 0; i--) {
    const day = dayKey(new Date(now.getTime() - i * 86_400_000))
    const row = byDay.get(day)
    stats.push({
      day,
      sessions: Number(row?.sessions ?? 0),
      meanAccuracy: row?.mean_accuracy ?? null,
      bestAccuracy: row?.best_accuracy ?? null,
    })
  }
  return stats
}

/** Total completed sessions (the History header's honest count). */
export function countSessions(database?: LearningHubDB): number {
  const conn = database ?? getDb()
  const [row] = conn
    .select({ count: sql<number>`count(*)` })
    .from(prototypeExemplarSessions)
    .all()
  return Number(row?.count ?? 0)
}

/**
 * Map stored sessions onto the study planner's session shape (the planner is
 * persistence-agnostic; this is the one shared translation for web, MCP, CLI
 * and the headless server). Invalid rows are skipped — the plan never lies.
 */
export function toStudyPlanSessions(sessions: StoredPrototypeExemplarSession[]): Array<{
  setId: string
  completedAt: string
  accuracy: number
  transferAccuracy: number
  tsc: number
  cri: number
  maturityBand: CategorizationEvaluation['maturityBand']
}> {
  return sessions.map((s) => ({
    setId: s.setId,
    completedAt: s.createdAt,
    accuracy: s.metrics.overallAccuracy,
    transferAccuracy: s.metrics.transferAccuracy,
    tsc: s.metrics.tsc,
    cri: s.metrics.cri,
    maturityBand: s.metrics.maturityBand,
  }))
}
