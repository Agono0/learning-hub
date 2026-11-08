/**
 * Tier 1: curriculum v2 through the agent surfaces — the MCP server an AI
 * assistant talks to, and the CLI. Same repositories as the web app.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { McpTestClient } from '../helpers/mcp-client'
import { runCli } from '../helpers/cli-runner'
import { getActiveDbPath } from '../helpers/setup'

const examples = resolve(__dirname, '../../../curricula/examples')

describe('Tier 1: curriculum via MCP', () => {
  let client: McpTestClient

  beforeAll(async () => {
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 15000)

  afterAll(() => {
    client?.stop()
  })

  it('registers the curriculum tools', async () => {
    const names = (await client.listTools()).map((t) => t.name)
    for (const t of [
      'curriculum_prompt',
      'curriculum_import',
      'curriculum_list',
      'curriculum_course',
      'curriculum_next',
      'curriculum_export',
    ]) {
      expect(names).toContain(t)
    }
  })

  it('designs, validates, imports and tutors a course', async () => {
    const { prompt } = await client.callTool<{ prompt: string }>('curriculum_prompt', {
      topic: 'Photosynthesis',
      weeks: 2,
      hoursPerWeek: 2,
    })
    expect(prompt).toContain('Photosynthesis')

    const text = readFileSync(resolve(examples, 'learning-how-to-learn.md'), 'utf8')
    const dry = await client.callTool('curriculum_import', {
      text,
      filename: 'course.md',
      dryRun: true,
    })
    expect(dry).toMatchObject({ ok: true, dryRun: true, slug: 'learning-how-to-learn' })

    const done = await client.callTool<{ report: { created: boolean; courseId: number } }>(
      'curriculum_import',
      { text, filename: 'course.md' },
    )
    expect(done.report.created).toBe(true)

    const next = await client.callTool<{
      lesson: { lesson: { title: string }; exercises: unknown[] }
    }>('curriculum_next', { courseId: done.report.courseId })
    expect(next.lesson.lesson.title).toBe('The testing effect')
    expect(next.lesson.exercises.length).toBeGreaterThan(0)

    const exported = await client.callTool<{ slug: string }>('curriculum_export', {
      courseId: done.report.courseId,
    })
    expect(exported.slug).toBe('learning-how-to-learn')
  })

  it('returns path-addressed errors for an invalid course', async () => {
    const bad = await client.callTool<{ ok: boolean; errors: Array<{ path: string }> }>(
      'curriculum_import',
      { text: '{"title":"x","modules":[]}' },
    )
    expect(bad.ok).toBe(false)
    expect(bad.errors[0].path).toBe('modules')
  })
})

describe('Tier 1: curriculum via CLI', () => {
  it('imports a YAML course and lists it', async () => {
    const imported = await runCli(
      ['curriculum', 'import', resolve(examples, 'sql-essentials.yaml')],
      getActiveDbPath(),
      20000,
    )
    expect(imported.stdout).toMatch(/SQL Essentials — 2 modules, 4 lessons/)
    const listed = await runCli(['curriculum', 'list'], getActiveDbPath(), 20000)
    expect(listed.stdout).toMatch(/SQL Essentials/)
  })

  it('exits non-zero with readable errors for invalid files', async () => {
    const r = await runCli(
      ['curriculum', 'import', resolve(__dirname, '../../../package.json')],
      getActiveDbPath(),
      20000,
    )
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toMatch(/not a valid course/)
  })
})
