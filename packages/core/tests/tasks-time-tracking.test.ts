/**
 * Unit tests for the time-tracking core (S3-10): session normalization,
 * per-day map merges, the break guard, deterministic recomputation and the
 * tick-indicator formatting.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import {
  addTimeToDay,
  applyTick,
  dayKeyOf,
  formatTracked,
  mergeTimeLogs,
  normalizeSession,
  recomputeTaskTime,
  SESSION_MAX_MS,
  TICK_MIN_MS,
  trackedOnDay,
  type TimeLog,
} from '../src/tasks/time-tracking'

const DAY = '2026-11-22'

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 't',
    notes: null,
    priority: 'none',
    estimateMs: null,
    timeSpentOnDay: {},
    due: null,
    dueWithTime: false,
    deadline: null,
    isDone: false,
    doneAt: null,
    wonthado: false,
    repeatCfgId: null,
    order: 0,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T08:00:00.000Z',
    ...overrides,
  })
}

function log(overrides: Partial<TimeLog> = {}): TimeLog {
  return {
    id: 1,
    taskId: 1,
    day: DAY,
    sessionMs: 600_000,
    startedAt: `${DAY}T09:00:00.000Z`,
    source: 'manual',
    createdAt: '2026-11-22T09:00:00.000Z',
    ...overrides,
  }
}

describe('normalizeSession', () => {
  it('keeps valid sessions and quantizes rounding', () => {
    const s = normalizeSession({
      taskId: 1,
      day: DAY,
      sessionMs: 1_500,
      startedAt: null,
      source: 'manual',
    })
    expect(s?.sessionMs).toBe(1_500)
    expect(s?.id).toBe(0)
  })

  it('drops sub-second ticks, over-cap sessions and bad days', () => {
    expect(
      normalizeSession({
        taskId: 1,
        day: DAY,
        sessionMs: TICK_MIN_MS - 1,
        startedAt: null,
        source: 'manual',
      }),
    ).toBeNull()
    expect(
      normalizeSession({
        taskId: 1,
        day: DAY,
        sessionMs: SESSION_MAX_MS + 1,
        startedAt: null,
        source: 'manual',
      }),
    ).toBeNull()
    expect(
      normalizeSession({
        taskId: 1,
        day: 'garbage',
        sessionMs: 5_000,
        startedAt: null,
        source: 'manual',
      }),
    ).toBeNull()
  })

  it('derives the day from startedAt when they disagree (startedAt wins)', () => {
    const s = normalizeSession({
      taskId: 1,
      day: DAY,
      sessionMs: 5_000,
      startedAt: '2026-11-23T23:59:00.000Z',
      source: 'focus',
    })
    expect(s?.day).toBe('2026-11-23')
  })
})

describe('per-day map ops', () => {
  it('addTimeToDay is pure, accumulates and ignores zero/junk', () => {
    const map = addTimeToDay({}, DAY, 600_000)
    expect(map).toEqual({ [DAY]: 600_000 })
    const again = addTimeToDay(map, DAY, 300_000)
    expect(again[DAY]).toBe(900_000)
    expect(map[DAY]).toBe(600_000)
    expect(addTimeToDay(map, DAY, 0)).toEqual(map)
    expect(addTimeToDay(map, DAY, Number.NaN)).toEqual(map)
  })

  it('trackedOnDay defaults to 0', () => {
    expect(trackedOnDay(task(), DAY)).toBe(0)
    expect(trackedOnDay(task({ timeSpentOnDay: { [DAY]: 5 } }), DAY)).toBe(5)
  })
})

describe('applyTick', () => {
  it('merges a focus tick into the task map without bumping updatedAt', () => {
    const t = task()
    const next = applyTick(t, { day: DAY, sessionMs: 600_000, startedAt: null, source: 'focus' })
    expect(next.timeSpentOnDay[DAY]).toBe(600_000)
    expect(next.updatedAt).toBe(t.updatedAt) // time ticks ≠ content edits
  })

  it('break ticks never count (S3-81 guard)', () => {
    const t = task({ timeSpentOnDay: { [DAY]: 100 } })
    const next = applyTick(
      t,
      { day: DAY, sessionMs: 600_000, startedAt: null, source: 'focus' },
      { isBreak: true },
    )
    expect(next.timeSpentOnDay[DAY]).toBe(100)
  })

  it('junk ticks are no-ops, not errors', () => {
    const t = task()
    expect(applyTick(t, { day: DAY, sessionMs: 500, startedAt: null, source: 'manual' })).toEqual(t)
  })
})

describe('mergeTimeLogs / recomputeTaskTime (the merge rule)', () => {
  it('recomputes the map deterministically regardless of log order', () => {
    const logs = [
      log({ id: 1, sessionMs: 600_000 }),
      log({ id: 2, sessionMs: 300_000, day: '2026-11-21' }),
    ]
    const a = mergeTimeLogs(logs)
    const b = mergeTimeLogs([...logs].reverse())
    expect(a).toEqual({ [DAY]: 600_000, '2026-11-21': 300_000 })
    expect(b).toEqual(a)
  })

  it('recomputeTaskTime keeps only the task\u2019s own rows', () => {
    const t = task({ timeSpentOnDay: { [DAY]: 999_999 } }) // stale hand-edit
    const logs = [log({ taskId: 1, sessionMs: 600_000 }), log({ taskId: 2, sessionMs: 777_777 })]
    const next = recomputeTaskTime(t, logs)
    expect(next.timeSpentOnDay).toEqual({ [DAY]: 600_000 })
  })
})

describe('helpers', () => {
  it('dayKeyOf extracts the UTC date part', () => {
    expect(dayKeyOf('2026-11-22T09:30:00.000Z')).toBe(DAY)
    expect(dayKeyOf('nonsense')).toBeNull()
  })

  it('formatTracked renders calm durations', () => {
    expect(formatTracked(0)).toBe('0m')
    expect(formatTracked(12 * 60_000)).toBe('12m')
    expect(formatTracked(3_600_000)).toBe('1h')
    expect(formatTracked(3_900_000)).toBe('1h 5m')
  })
})
