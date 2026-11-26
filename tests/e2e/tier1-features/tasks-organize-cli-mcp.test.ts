import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCli } from '../helpers/cli-runner'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'

interface Ok {
  ok: boolean
  error?: string
  [k: string]: unknown
}

describe('Tier 1: task tags, projects, sections and counters over CLI and MCP', () => {
  let client: McpTestClient
  beforeAll(async () => {
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 40000)
  afterAll(() => client?.stop())

  const cli = (...a: string[]) => runCli(a, getActiveDbPath())

  it('CLI tags: add, list, duplicate, set on a task, rm, and bad input', async () => {
    const add = await cli('task-tags', 'add', 'urgent-cli', '--color', 'red')
    expect(add.exitCode).toBe(0)
    expect(add.stdout).toContain('Created tag')
    const dup = await cli('task-tags', 'add', 'urgent-cli')
    expect(dup.exitCode).toBe(1)
    expect(dup.stderr).toContain('already exists')
    expect((await cli('task-tags', 'list')).stdout).toContain('urgent-cli')

    const task = await cli('tasks', 'add', 'tag me')
    const taskId = /#(\d+)/.exec(task.stdout)![1]!
    const tagId = /#(\d+) urgent-cli/.exec((await cli('task-tags', 'list')).stdout)![1]!
    // The same id twice used to hit the (item, tag) primary key.
    const set = await cli('task-tags', 'set', taskId, tagId, tagId)
    expect(set.exitCode).toBe(0)
    expect(set.stdout).toContain('1 tag')

    expect((await cli('task-tags', 'set', '99999', tagId)).exitCode).toBe(1)
    expect((await cli('task-tags', 'set', taskId, '99999')).exitCode).toBe(1)
    expect((await cli('task-tags', 'rm', tagId)).exitCode).toBe(0)
    expect((await cli('task-tags', 'rm', tagId)).exitCode).toBe(1)
    expect((await cli('task-tags', 'rm', 'abc')).exitCode).toBe(2)
    expect((await cli('task-tags', 'add', '')).exitCode).toBe(2)
    expect((await cli('task-tags', 'bogus')).exitCode).toBe(2)
  })

  it('CLI projects and sections', async () => {
    const add = await cli('task-projects', 'add', 'Thesis', '--backlog')
    expect(add.exitCode).toBe(0)
    const id = /#(\d+)/.exec(add.stdout)![1]!
    expect((await cli('task-projects', 'archive', id)).exitCode).toBe(0)
    expect((await cli('task-projects', 'list')).stdout).toContain('[archived]')
    expect((await cli('task-projects', 'restore', id)).exitCode).toBe(0)
    expect((await cli('task-projects', 'archive', '99999')).exitCode).toBe(1)
    expect((await cli('task-projects', 'rm', id)).exitCode).toBe(0)

    const sec = await cli('task-sections', 'add', 'Morning')
    const sid = /#(\d+)/.exec(sec.stdout)![1]!
    const task = await cli('tasks', 'add', 'sectioned')
    const tid = /#(\d+)/.exec(task.stdout)![1]!
    expect((await cli('task-sections', 'set', tid, sid)).exitCode).toBe(0)
    expect((await cli('task-sections', 'set', tid, 'none')).exitCode).toBe(0)
    expect((await cli('task-sections', 'set', tid, 'x')).exitCode).toBe(2)
    expect((await cli('task-sections', 'rm', sid)).exitCode).toBe(0)
    expect((await cli('task-sections', 'rm', sid)).exitCode).toBe(1)
  })

  it('CLI counters: tap accumulates and rejects bad --by and --day', async () => {
    const add = await cli('counters', 'add', 'water')
    const id = /#(\d+)/.exec(add.stdout)![1]!
    await cli('counters', 'tap', id, '--day', '2026-03-01')
    const again = await cli('counters', 'tap', id, '--by', '4', '--day', '2026-03-01')
    expect(again.stdout).toContain('is at 5 for 2026-03-01')
    for (const bad of [
      ['--by', '0'],
      ['--by', 'abc'],
      ['--by', '1.5'],
      ['--by', '1001'],
      ['--day', '2026-02-30'],
      ['--day', 'nope'],
    ]) {
      const res = await cli('counters', 'tap', id, ...bad)
      expect(res.exitCode).toBe(2)
      expect(res.stderr).not.toContain('    at ')
    }
    expect((await cli('counters', 'tap', '99999')).exitCode).toBe(1)
    expect((await cli('counters', 'archive', id)).exitCode).toBe(0)
    expect((await cli('counters', 'list')).stdout).not.toContain('water')
    expect((await cli('counters', 'list', '--all')).stdout).toContain('[archived]')
  })

  it('MCP exposes the new tools', async () => {
    const names = (await client.listTools()).map((t) => t.name)
    for (const n of [
      'task_tag_list',
      'task_tag_create',
      'task_set_tags',
      'task_project_create',
      'task_section_create',
      'task_set_section',
      'counter_increment',
      'counter_archive',
    ]) {
      expect(names).toContain(n)
    }
  })

  it('MCP tags, sections and counters', async () => {
    const tag = await client.callTool<Ok & { tag: { id: number } }>('task_tag_create', {
      name: 'mcp-tag',
    })
    expect(tag.ok).toBe(true)
    const dup = await client.callTool<Ok>('task_tag_create', { name: 'mcp-tag' })
    expect(dup.ok).toBe(false)
    const task = await client.callTool<Ok & { task: { id: number } }>('task_add', {
      title: 'mcp task',
    })
    const set = await client.callTool<Ok>('task_set_tags', {
      taskId: task.task.id,
      tagIds: [tag.tag.id, tag.tag.id],
    })
    expect(set.ok).toBe(true)
    expect((await client.callTool<Ok>('task_set_tags', { taskId: 99999, tagIds: [] })).ok).toBe(
      false,
    )
    expect(
      (await client.callTool<Ok>('task_set_tags', { taskId: task.task.id, tagIds: [99999] })).ok,
    ).toBe(false)

    const sec = await client.callTool<Ok & { section: { id: number } }>('task_section_create', {
      name: 'S',
    })
    expect(
      (
        await client.callTool<Ok>('task_set_section', {
          taskId: task.task.id,
          sectionId: sec.section.id,
        })
      ).ok,
    ).toBe(true)
    expect(
      (await client.callTool<Ok>('task_set_section', { taskId: task.task.id, sectionId: null })).ok,
    ).toBe(true)
    expect((await client.callTool<Ok>('task_section_delete', { id: 99999 })).ok).toBe(false)

    const counter = await client.callTool<Ok & { counter: { id: number } }>('counter_create', {
      label: 'reps',
    })
    await client.callTool('counter_increment', { id: counter.counter.id, day: '2026-03-02' })
    // A day that is not on the calendar is rejected by the input schema, so there is no ok:true.
    const inc = await client.callTool<Ok & { log: { count: number } }>('counter_increment', {
      id: counter.counter.id,
      day: '2026-03-02',
      by: 3,
    })
    expect(inc.log.count).toBe(4)
    expect(
      (
        await client.callTool<Ok>('counter_increment', {
          id: counter.counter.id,
          day: '2026-02-30',
        })
      ).ok,
    ).toBeFalsy()
    expect((await client.callTool<Ok>('counter_increment', { id: 99999 })).ok).toBe(false)
    const proj = await client.callTool<Ok & { project: { id: number } }>('task_project_create', {
      title: 'P',
    })
    expect((await client.callTool<Ok>('task_project_archive', { id: proj.project.id })).ok).toBe(
      true,
    )
    expect((await client.callTool<Ok>('task_project_delete', { id: 99999 })).ok).toBe(false)
  })
})
