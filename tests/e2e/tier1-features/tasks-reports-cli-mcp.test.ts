import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCli } from '../helpers/cli-runner'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'

interface Res {
  ok?: boolean
  error?: string
  [k: string]: unknown
}

describe('Tier 1: task views, worklog, metrics and finish-day over CLI and MCP', () => {
  let client: McpTestClient
  beforeAll(async () => {
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 40000)
  afterAll(() => client?.stop())

  const cli = (...a: string[]) => runCli(a, getActiveDbPath())

  it('CLI views: add, list, rm, bad input', async () => {
    const add = await cli('task-views', 'add', 'Focus', '--kind', 'kanban')
    expect(add.exitCode).toBe(0)
    const id = /#(\d+)/.exec(add.stdout)![1]!
    expect((await cli('task-views', 'list')).stdout).toContain('Focus [kanban]')
    expect((await cli('task-views', 'rm', id)).exitCode).toBe(0)
    expect((await cli('task-views', 'rm', id)).exitCode).toBe(1)
    expect((await cli('task-views', 'add', 'X', '--kind', 'bogus')).exitCode).toBe(2)
    expect((await cli('task-views', 'add', '')).exitCode).toBe(2)
    expect((await cli('task-views', 'rm', 'abc')).exitCode).toBe(2)
  })

  it('CLI worklog, metrics and finish-day validate dates and ranges', async () => {
    expect((await cli('worklog')).exitCode).toBe(0)
    expect((await cli('worklog', '--from', '2026-03-05', '--to', '2026-03-01')).exitCode).toBe(2)
    expect((await cli('worklog', '--from', '2026-02-30')).exitCode).toBe(2)
    expect((await cli('worklog', '--to')).exitCode).toBe(2)

    const set = await cli(
      'task-metrics',
      'set',
      '2026-03-01',
      '--impact',
      '3',
      '--energy',
      '2',
      '--note',
      'good day',
    )
    expect(set.exitCode).toBe(0)
    expect((await cli('task-metrics', 'list')).stdout).toContain('2026-03-01  impact 3  energy 2')
    expect((await cli('task-metrics', 'set', '2026-03-01', '--impact', '9')).exitCode).toBe(2)
    expect((await cli('task-metrics', 'set', '2026-03-01', '--energy', '0')).exitCode).toBe(2)
    expect((await cli('task-metrics', 'set', 'nope')).exitCode).toBe(2)

    const fin = await cli('finish-day', '2026-03-01')
    expect(fin.exitCode).toBe(0)
    expect(fin.stdout).toContain('FINISH DAY 2026-03-01')
    expect((await cli('finish-day', '2026-13-45')).exitCode).toBe(2)
  })

  it('MCP views, worklog, metrics and finish-day', async () => {
    const names = (await client.listTools()).map((t) => t.name)
    for (const n of ['task_view_create', 'task_worklog', 'task_metrics_set', 'task_finish_day']) {
      expect(names).toContain(n)
    }
    const view = await client.callTool<Res & { view: { id: number } }>('task_view_create', {
      name: 'V',
    })
    expect(view.ok).toBe(true)
    expect((await client.callTool<Res>('task_view_delete', { id: view.view.id })).ok).toBe(true)
    expect((await client.callTool<Res>('task_view_delete', { id: view.view.id })).ok).toBe(false)

    const task = await client.callTool<Res & { task: { id: number } }>('task_add', {
      title: 'tracked',
    })
    await client.callTool('task_track_time', { id: task.task.id, minutes: 30, day: '2026-03-03' })
    const wl = await client.callTool<
      Res & { totalMs: number; perDay: { day: string }[]; logCount: number }
    >('task_worklog', {
      from: '2026-03-03',
      to: '2026-03-03',
    })
    expect(wl.totalMs).toBe(30 * 60_000)
    expect(wl.perDay[0]!.day).toBe('2026-03-03')
    expect(
      (await client.callTool<Res>('task_worklog', { from: '2026-03-05', to: '2026-03-01' })).ok,
    ).toBe(false)

    const m = await client.callTool<Res>('task_metrics_set', {
      day: '2026-03-03',
      impact: 2,
      metrics: { done: 2 },
    })
    expect(m.ok).toBe(true)
    const m2 = await client.callTool<Res & { day: { metrics: Record<string, number> } }>(
      'task_metrics_set',
      {
        day: '2026-03-03',
        metrics: { done: 3 },
      },
    )
    expect(m2.day.metrics['done']).toBe(5)
    const list = await client.callTool<Res & { count: number }>('task_metrics_list', {
      from: '2026-03-03',
      to: '2026-03-03',
    })
    expect(list.count).toBe(1)

    const fin = await client.callTool<Res & { trackedMs: number }>('task_finish_day', {
      day: '2026-03-03',
    })
    expect(fin.ok).toBe(true)
    expect(fin.trackedMs).toBe(30 * 60_000)
  })
})
