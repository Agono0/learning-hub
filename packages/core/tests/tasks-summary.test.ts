/**
 * Daily summary builder (S3-79): deterministic share text from tasks, the
 * day's logs and the evaluation row — honest zero state, leaf-aware top
 * tasks, evaluation line only when present.
 */
import { describe, expect, it } from 'vitest'
import { dailySummaryText } from '../src/tasks/summary'
import type { TaskItem } from '../src/tasks'

const DAY = '2026-11-22'

function task(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 'Ship it',
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
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    ...over,
  } as TaskItem
}

const log = (
  taskId: number,
  sessionMs: number,
): { id: number; taskId: number; day: string; sessionMs: number } => ({
  id: taskId * 10,
  taskId,
  day: DAY,
  sessionMs,
})

describe('dailySummaryText', () => {
  it('is honest about an empty day', () => {
    const text = dailySummaryText(DAY, [task()], [])
    expect(text).toContain('No tracked time yet.')
    expect(text).not.toContain('Top tasks')
  })

  it('totals tracked time and lists leaf-aware top tasks', () => {
    const tasks = [
      task({ id: 1, title: 'Parent', isDone: true }),
      task({ id: 2, title: 'Actual work', parentId: 1 }),
      task({ id: 3, title: 'Second thing' }),
    ]
    const logs = [log(1, 20 * 60_000), log(2, 90 * 60_000), log(3, 30 * 60_000)]
    const text = dailySummaryText(DAY, tasks, logs)
    expect(text).toContain('Tracked: 2h 20m')
    expect(text).toContain('Top tasks:')
    expect(text).toContain('Actual work — 90m')
    expect(text).toContain('Second thing — 30m')
    // leaf-only: the parent's own rows fold away
    expect(text).not.toContain('Parent —')
    // other days never leak in
    expect(text).not.toContain('42m')
  })

  it('appends the evaluation line only when present', () => {
    const base = dailySummaryText(DAY, [task()], [])
    expect(base).not.toContain('Evaluation:')
    const withEval = dailySummaryText(DAY, [task()], [log(1, 60_000)], {
      impact: 3,
      energy: 2,
      reflection: 'Steady day.',
    })
    expect(withEval).toContain('Evaluation: impact 3/4, energy 2/3.')
    expect(withEval).toContain('Steady day.')
  })

  it('is deterministic for identical input', () => {
    const tasks = [task({ id: 1, title: 'A' }), task({ id: 2, title: 'B' })]
    const logs = [log(1, 60_000), log(2, 60_000)]
    expect(dailySummaryText(DAY, tasks, logs)).toBe(dailySummaryText(DAY, tasks, logs))
  })
})
