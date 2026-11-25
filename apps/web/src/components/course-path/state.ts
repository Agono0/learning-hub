/**
 * Browser-stored state for the course path page. Everything here is typed in by
 * the learner (mastery levels, done lessons); nothing is read from other pages.
 * Loading never throws: bad or oversized data falls back to defaults.
 */
import type { LessonStatus } from '@learning-hub/core/curriculum'

export const COURSE_PATH_STORAGE_KEY = 'learning-hub.course-path.v1'
export const MAX_SOURCE_CHARS = 1_000_000

/** Levels offered in the page, as BKT pKnown. Unlocking needs about 0.82. */
export const MASTERY_LEVELS = [
  { id: 'new', label: 'New to me', pKnown: 0 },
  { id: 'learning', label: 'Learning', pKnown: 0.6 },
  { id: 'solid', label: 'Solid', pKnown: 0.9 },
] as const
export type MasteryLevelId = (typeof MASTERY_LEVELS)[number]['id']

export interface PathPrefs {
  source: string
  /** skill slug to level id */
  levels: Record<string, MasteryLevelId>
  /** lesson slug to status */
  status: Record<string, LessonStatus>
  minutesPerDay: number
  /** weekdays off, 0 = Sunday */
  restWeekdays: number[]
  /** `YYYY-MM-DD` or empty */
  deadline: string
}

export const defaultPrefs = (): PathPrefs => ({
  source: '',
  levels: {},
  status: {},
  minutesPerDay: 45,
  restWeekdays: [],
  deadline: '',
})

export function pKnownFor(level: MasteryLevelId | undefined): number {
  return MASTERY_LEVELS.find((l) => l.id === level)?.pKnown ?? 0
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function readPrefs(raw: string | null): { prefs: PathPrefs; unreadable: boolean } {
  if (raw === null) return { prefs: defaultPrefs(), unreadable: false }
  if (raw.length > MAX_SOURCE_CHARS + 100_000) return { prefs: defaultPrefs(), unreadable: true }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { prefs: defaultPrefs(), unreadable: true }
  }
  if (!isRecord(data) || data.version !== 1) return { prefs: defaultPrefs(), unreadable: true }
  const base = defaultPrefs()
  const levelIds = new Set<string>(MASTERY_LEVELS.map((l) => l.id))
  const statuses = new Set(['not_started', 'in_progress', 'completed'])
  const levels: PathPrefs['levels'] = {}
  if (isRecord(data.levels)) {
    for (const [k, v] of Object.entries(data.levels).slice(0, 2000)) {
      if (typeof v === 'string' && levelIds.has(v)) levels[k] = v as MasteryLevelId
    }
  }
  const status: PathPrefs['status'] = {}
  if (isRecord(data.status)) {
    for (const [k, v] of Object.entries(data.status).slice(0, 5000)) {
      if (typeof v === 'string' && statuses.has(v)) status[k] = v as LessonStatus
    }
  }
  const minutes = Number(data.minutesPerDay)
  const rest = Array.isArray(data.restWeekdays)
    ? [
        ...new Set(
          data.restWeekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ]
    : []
  return {
    unreadable: false,
    prefs: {
      source:
        typeof data.source === 'string' && data.source.length <= MAX_SOURCE_CHARS
          ? data.source
          : base.source,
      levels,
      status,
      minutesPerDay:
        Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440
          ? Math.floor(minutes)
          : base.minutesPerDay,
      restWeekdays: rest,
      deadline:
        typeof data.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.deadline)
          ? data.deadline
          : '',
    },
  }
}

export function writePrefs(prefs: PathPrefs): string {
  return JSON.stringify({ version: 1, ...prefs })
}
