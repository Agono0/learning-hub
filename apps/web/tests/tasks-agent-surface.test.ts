/**
 * Tasks MCP tools + `tasks` CLI command (apps/mcp/src/tools/tasks.ts,
 * apps/cli/src/commands/tasks.ts): both call the shared repos/tasks functions.
 * Covers the writes, input validation and the error paths. It does NOT claim
 * parity with the whole /api/tasks* surface, and does not run the MCP stdio
 * server or the CLI entrypoint.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-tasks-surface-')), 't.db')

type Db = typeof import('@learning-hub/db')
let D: Db
let tools: typeof import('../../mcp/src/tools/tasks').taskTools
let tasksCommand: typeof import('../../cli/src/commands/tasks').tasksCommand
let projectId: number

beforeAll(async () => {
  D = await import('@learning-hub/db')
  tools = (await import('../../mcp/src/tools/tasks')).taskTools
  tasksCommand = (await import('../../cli/src/commands/tasks')).tasksCommand
  projectId = D.createTaskProjectRow({ title: 'Thesis' }).id
})

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
})

async function call(name: string, args: Record<string, unknown>) {
  const t = tools.find((x) => x.name === name)!
  // Mirror the SDK: args pass through the tool's zod shape before the handler.
  const { z } = await import('zod')
  const parsed = z.object(t.inputSchema as never).parse(args)
  const res = await t.handler(parsed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(res.content[0]!.text) as Record<string, any>
}

function runCli(args: string[]) {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')))
  tasksCommand(args)
  return { out: out.join('\n'), err: err.join('\n'), code: process.exitCode }
}

describe('MCP task tools', () => {
  it('exposes the five tools', () => {
    expect(tools.map((t) => t.name)).toEqual([
      'task_list',
      'task_add',
      'task_complete',
      'task_reopen',
      'task_track_time',
    ])
  })

  it('adds, lists, completes and reopens a task through the repo', async () => {
    const added = await call('task_add', { title: 'Draft intro', priority: 'high', projectId })
    expect(added.ok).toBe(true)
    const id = added.task.id as number
    expect(D.getTaskItem(id)).toMatchObject({ title: 'Draft intro', priority: 'high', projectId })

    const listed = await call('task_list', { projectId })
    expect(listed.tasks.map((t: { id: number }) => t.id)).toContain(id)

    const done = await call('task_complete', { id })
    expect(done.task.isDone).toBe(true)
    expect(D.getTaskItem(id)!.isDone).toBe(true)
    expect(
      (await call('task_list', { projectId })).tasks.map((t: { id: number }) => t.id),
    ).not.toContain(id)
    expect(
      (await call('task_list', { projectId, includeDone: true })).tasks.map(
        (t: { id: number }) => t.id,
      ),
    ).toContain(id)

    const reopened = await call('task_reopen', { id })
    expect(reopened.task.isDone).toBe(false)
  })

  it('task_list projectId=null is the inbox only', async () => {
    const inbox = await call('task_add', { title: 'Inbox thing' })
    const res = await call('task_list', { projectId: null })
    const ids = res.tasks.map((t: { id: number }) => t.id)
    expect(ids).toContain(inbox.task.id)
    expect(res.tasks.every((t: { projectId: number | null }) => t.projectId === null)).toBe(true)
  })

  it('task_add rejects invalid input without writing', async () => {
    const before = D.listTaskItems({ includeDone: true }).length
    const blank = await call('task_add', { title: '   ' })
    expect(blank.ok).toBe(false)
    const badDeadline = await call('task_add', { title: 'x', deadline: 'tomorrow' })
    expect(badDeadline.ok).toBe(false)
    const missingProject = await call('task_add', { title: 'x', projectId: 9999 })
    expect(missingProject).toMatchObject({ ok: false })
    expect(missingProject.error).toMatch(/not found/)
    expect(D.listTaskItems({ includeDone: true }).length).toBe(before)
  })

  it('reports unknown ids and domain errors instead of throwing', async () => {
    expect(await call('task_complete', { id: 987654 })).toMatchObject({ ok: false })
    expect(await call('task_reopen', { id: 987654 })).toMatchObject({ ok: false })
    expect(await call('task_track_time', { id: 987654, minutes: 5 })).toMatchObject({ ok: false })

    const t = await call('task_add', { title: 'Skip me' })
    D.db.update(D.taskItems).set({ wonthado: true }).where(eq(D.taskItems.id, t.task.id)).run()
    const res = await call('task_complete', { id: t.task.id })
    expect(res.ok).toBe(false)
    expect(res.code).toBeTruthy()
    expect(D.getTaskItem(t.task.id)!.isDone).toBe(false)
  })

  it('task_track_time logs minutes on the given day and rejects bad values', async () => {
    const t = await call('task_add', { title: 'Timed' })
    const res = await call('task_track_time', { id: t.task.id, minutes: 25, day: '2026-03-10' })
    expect(res.ok).toBe(true)
    expect(D.sumTimeLogs({ taskId: t.task.id })).toBe(25 * 60_000)
    expect(D.listTimeLogs({ taskId: t.task.id })[0]!.day).toBe('2026-03-10')
    await expect(call('task_track_time', { id: t.task.id, minutes: 0 })).rejects.toThrow()
    await expect(call('task_track_time', { id: t.task.id, minutes: 5000 })).rejects.toThrow()
    await expect(
      call('task_track_time', { id: t.task.id, minutes: 5, day: '10/03/2026' }),
    ).rejects.toThrow()
    for (const day of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-04-31']) {
      await expect(
        call('task_track_time', { id: t.task.id, minutes: 5, day }),
        day,
      ).rejects.toThrow(/real calendar date/)
    }
    expect(D.sumTimeLogs({ taskId: t.task.id })).toBe(25 * 60_000)
    // a real leap day is accepted
    expect(
      (await call('task_track_time', { id: t.task.id, minutes: 1, day: '2028-02-29' })).ok,
    ).toBe(true)
    expect(D.sumTimeLogs({ taskId: t.task.id })).toBe(26 * 60_000)
  })
})

describe('tasks CLI command', () => {
  it('add / list / done / reopen / track', () => {
    const added = runCli([
      'add',
      'Write abstract',
      '--priority',
      'low',
      '--project',
      String(projectId),
    ])
    expect(added.out).toMatch(/Created task #\d+: Write abstract/)
    const id = Number(/#(\d+)/.exec(added.out)![1])
    expect(D.getTaskItem(id)).toMatchObject({ title: 'Write abstract', priority: 'low', projectId })

    expect(runCli(['list', '--project', String(projectId)]).out).toContain(`#${id}`)
    expect(runCli(['done', String(id)]).out).toMatch(/completed/)
    expect(D.getTaskItem(id)!.isDone).toBe(true)
    expect(runCli(['list', '--project', String(projectId)]).out).not.toContain(`#${id}`)
    expect(runCli(['list', '--project', String(projectId), '--all']).out).toContain(`#${id}`)
    expect(runCli(['reopen', String(id)]).out).toMatch(/reopened/)
    expect(D.getTaskItem(id)!.isDone).toBe(false)

    expect(runCli(['track', String(id), '10']).out).toMatch(/Logged 10 min/)
    expect(D.sumTimeLogs({ taskId: id })).toBe(10 * 60_000)
  })

  it('does not take a flag as the title or as a flag value', () => {
    const before = D.listTaskItems({ includeDone: true }).length
    for (const args of [
      ['add', '--project'],
      ['add', '--project', String(projectId), 'Late title'],
      ['add', 'x', '--priority', '--due'],
      ['add', 'x', '--project', '--priority', 'low'],
      ['add', 'x', '--due'],
      ['list', '--limit', '--all'],
      ['list', '--project'],
    ]) {
      const r = runCli(args)
      expect(r.code, args.join(' ')).toBe(1)
      expect(r.err, args.join(' ')).not.toBe('')
      process.exitCode = undefined
      vi.restoreAllMocks()
    }
    expect(D.listTaskItems({ includeDone: true }).length).toBe(before)
    // a normal call with flags after the title still works
    expect(
      runCli(['add', 'Flags last', '--priority', 'medium', '--due', '2026-05-01']).code,
    ).toBeUndefined()
  })

  it('rejects bad input with exit code 1 and writes nothing', () => {
    const before = D.listTaskItems({ includeDone: true }).length
    for (const args of [
      ['add', ''],
      ['add', 'x', '--priority', 'urgent'],
      ['add', 'x', '--project', 'abc'],
      ['add', 'x', '--project', '9999'],
      ['add', 'x', '--due', 'x'.repeat(50)],
      ['done', 'abc'],
      ['done', '987654'],
      ['reopen', '987654'],
      ['track', '1', '0'],
      ['track', '987654', '5'],
      ['list', '--limit', '0'],
      ['list', '--project', '-3'],
      ['bogus'],
    ]) {
      const r = runCli(args)
      expect(r.code, args.join(' ')).toBe(1)
      expect(r.err, args.join(' ')).not.toBe('')
      process.exitCode = undefined
      vi.restoreAllMocks()
    }
    expect(D.listTaskItems({ includeDone: true }).length).toBe(before)
  })
})
