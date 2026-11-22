/**
 * Unit tests for the work context (S3-43): per-project/per-tag today-time
 * attribution (multi-tag tasks count toward each tag, inbox = null bucket,
 * other days excluded) and the tracked tab-title formatting matrix.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAB_TITLE,
  trackedTitle,
  workContextTotals,
  type WorkContextTask,
} from '../src/tasks/work-context'

const DAY = '2026-03-10'

function task(
  id: number,
  opts: {
    projectId?: number | null
    tagIds?: number[]
    ms?: number
    otherDayMs?: number
  } = {},
): WorkContextTask {
  return {
    id,
    projectId: opts.projectId ?? null,
    tagIds: opts.tagIds ?? [],
    timeSpentOnDay: {
      ...(opts.ms ? { [DAY]: opts.ms } : {}),
      ...(opts.otherDayMs ? { '2026-03-09': opts.otherDayMs } : {}),
    },
  }
}

describe('workContextTotals — per-context today-time', () => {
  it('buckets time per project with the inbox as the null key', () => {
    const totals = workContextTotals(
      [task(1, { projectId: null, ms: 60_000 }), task(2, { projectId: 7, ms: 30_000 })],
      DAY,
    )
    expect(totals.perProject.get(null)).toBe(60_000)
    expect(totals.perProject.get(7)).toBe(30_000)
    expect(totals.todayTotalMs).toBe(90_000)
  })

  it('attributes multi-tag tasks to every tag they carry', () => {
    const totals = workContextTotals(
      [task(1, { projectId: 7, tagIds: [3, 4], ms: 60_000 }), task(2, { tagIds: [4], ms: 30_000 })],
      DAY,
    )
    expect(totals.perTag.get(3)).toBe(60_000)
    expect(totals.perTag.get(4)).toBe(90_000) // both tasks carry tag 4
    expect(totals.todayTotalMs).toBe(90_000) // attribution ≠ double counting the total
  })

  it('only counts the requested day', () => {
    const totals = workContextTotals([task(1, { ms: 60_000, otherDayMs: 500_000 })], DAY)
    expect(totals.todayTotalMs).toBe(60_000)
    expect(totals.perProject.get(null)).toBe(60_000)
  })

  it('untagged/untracked tasks contribute nothing', () => {
    const totals = workContextTotals([task(1), task(2, { ms: 0 })], DAY)
    expect(totals.perProject.size).toBe(0)
    expect(totals.perTag.size).toBe(0)
    expect(totals.todayTotalMs).toBe(0)
  })

  it('completed/won\u2019t-do work still counts — tracked time is historical fact', () => {
    // The totals take the structural shape only; done/wontdo filtering is
    // deliberately absent (SP keeps tracked time on the contexts).
    const totals = workContextTotals([task(1, { projectId: 5, ms: 60_000 })], DAY)
    expect(totals.perProject.get(5)).toBe(60_000)
  })
})

describe('trackedTitle — the SP tab title', () => {
  it('shows the current task with its today-time while tracking', () => {
    expect(
      trackedTitle({
        currentTaskTitle: 'Write the spec',
        currentTaskMs: 720_000,
        todayTotalMs: 3_000_000,
      }),
    ).toBe('12m · Write the spec')
  })

  it('falls back to the day total when idle but time exists', () => {
    expect(
      trackedTitle({ currentTaskTitle: null, currentTaskMs: 0, todayTotalMs: 3_900_000 }),
    ).toBe('Today 1h 5m')
  })

  it('uses the app default on an empty day', () => {
    expect(trackedTitle({ currentTaskTitle: null, currentTaskMs: 0, todayTotalMs: 0 })).toBe(
      DEFAULT_TAB_TITLE,
    )
  })

  it('zero-time current task still names it (tracking just started)', () => {
    expect(trackedTitle({ currentTaskTitle: 'Warm-up', currentTaskMs: 0, todayTotalMs: 0 })).toBe(
      '0m · Warm-up',
    )
  })
})
