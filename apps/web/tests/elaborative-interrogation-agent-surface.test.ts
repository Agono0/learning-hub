/**
 * Elaborative Interrogation MCP tools and the `ei` CLI command. Both call the
 * same pure core functions as the web handler; this checks wiring, validation
 * and output shape. It does not run the MCP stdio server or the CLI entrypoint.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { elaborativeInterrogationTools as tools } from '../../mcp/src/tools/elaborative-interrogation'
import {
  elaborativeInterrogationCommand as ei,
  elaborativeInterrogationCommands,
} from '../../cli/src/commands/elaborative-interrogation'

const FACT =
  'Spaced practice improves retention because each retrieval strengthens the memory trace.'
const ANSWER =
  'Each retrieval takes effort, and that effort strengthens the memory so retention lasts, because forgetting makes recall harder and therefore more useful. For example vocabulary after a week.'

async function callTool(name: string, args: Record<string, unknown>) {
  const t = tools.find((x) => x.name === name)!
  const res = await t.handler(args)
  return JSON.parse((res.content[0] as { text: string }).text)
}

async function runCli(args: string[]) {
  const logs: string[] = []
  const errs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a) => void errs.push(a.join(' ')))
  process.exitCode = 0
  await ei(args)
  const code = process.exitCode
  process.exitCode = 0
  return { out: logs.join('\n'), err: errs.join('\n'), code }
}

afterEach(() => vi.restoreAllMocks())

describe('ei MCP tools', () => {
  it('registers six uniquely named tools', () => {
    const names = tools.map((t) => t.name)
    expect(names).toEqual([
      'ei_prompt',
      'ei_grade',
      'ei_extract',
      'ei_lint',
      'ei_calibration',
      'free_recall_score',
    ])
    expect(new Set(names).size).toBe(6)
  })
  it('ei_prompt returns a prompt in the requested style', async () => {
    const r = await callTool('ei_prompt', { statement: FACT, style: 'analogy' })
    expect(r.ok).toBe(true)
    expect(r.prompt.style).toBe('analogy')
    expect(r.prompt.text).toContain(FACT)
  })
  it('ei_grade scores and maps to an FSRS rating', async () => {
    const r = await callTool('ei_grade', {
      statement: FACT,
      keyTerms: ['retrieval', 'memory'],
      answer: ANSWER,
    })
    expect(r.grade.total).toBeGreaterThan(40)
    expect([1, 2, 3, 4]).toContain(r.fsrsRating)
    const copied = await callTool('ei_grade', { statement: FACT, keyTerms: [], answer: FACT })
    expect(copied.grade.copied).toBe(true)
    expect(copied.fsrsRating).toBe(1)
  })
  it('ei_extract, ei_lint and ei_calibration work', async () => {
    const x = await callTool('ei_extract', { text: `${FACT} Short. ${FACT}`, max: 5 })
    expect(x.facts.length).toBe(2)
    const l = await callTool('ei_lint', { facts: x.facts })
    expect(l.issues.map((i: { code: string }) => i.code)).toContain('duplicate')
    const c = await callTool('ei_calibration', { points: [{ predicted: 90, actual: 40 }] })
    expect(c.report.n).toBe(1)
  })
})

describe('free recall surfaces', () => {
  const PASSAGE =
    'Photosynthesis converts sunlight into chemical energy inside chloroplasts. The light reactions split water and release oxygen as a byproduct. The Calvin cycle fixes carbon dioxide into glucose using ATP.'
  it('free_recall_score returns report, EI facts and a plan', async () => {
    const r = await callTool('free_recall_score', {
      passage: PASSAGE,
      recall: 'Photosynthesis converts sunlight into chemical energy inside chloroplasts.',
    })
    expect(r.report.recalled).toBe(1)
    expect(r.eiFacts).toHaveLength(2)
    expect(r.next.action).toBe('retry')
  })
  it('ei recall scores two files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-fr-'))
    writeFileSync(join(dir, 'p.txt'), PASSAGE)
    writeFileSync(join(dir, 'r.txt'), PASSAGE)
    const t = await runCli(['recall', join(dir, 'p.txt'), join(dir, 'r.txt')])
    expect(t.out).toMatch(/^Recall 100\/100 \(thorough\)/)
    const j = JSON.parse(
      (await runCli(['recall', join(dir, 'p.txt'), join(dir, 'r.txt'), '--json'])).out,
    )
    expect(j.report.missed).toBe(0)
    expect((await runCli(['recall', join(dir, 'p.txt')])).code).toBe(1)
    expect((await runCli(['recall', join(dir, 'p.txt'), join(dir, 'none.txt')])).code).toBe(1)
  })
})

describe('ei CLI command', () => {
  it('registers under the name ei', () => {
    expect(elaborativeInterrogationCommands.map((c) => c.name)).toEqual(['ei'])
  })
  it('styles lists ten styles, as text and json', async () => {
    const t = await runCli(['styles'])
    expect(t.out.split('\n')).toHaveLength(10)
    const j = JSON.parse((await runCli(['styles', '--json'])).out)
    expect(j.styles).toHaveLength(10)
  })
  it('prompt prints text and supports --style and --json', async () => {
    expect((await runCli(['prompt', FACT])).out).toContain(FACT)
    const j = JSON.parse((await runCli(['prompt', FACT, '--style', 'teach-back', '--json'])).out)
    expect(j.prompt.style).toBe('teach-back')
  })
  it('prompt rejects short facts and unknown styles', async () => {
    const a = await runCli(['prompt', 'short'])
    expect(a.code).toBe(1)
    const b = await runCli(['prompt', FACT, '--style', 'bogus'])
    expect(b.code).toBe(1)
    expect(b.err).toContain('Unknown style')
  })
  it('grade prints the rubric and json', async () => {
    const t = await runCli(['grade', FACT, ANSWER])
    expect(t.out).toMatch(/^Score \d+\/100/)
    expect(t.out).toContain('Causal reasoning')
    const j = JSON.parse((await runCli(['grade', FACT, ANSWER, '--json'])).out)
    expect(j.grade.rubric).toHaveLength(6)
  })
  it('grade needs both arguments', async () => {
    expect((await runCli(['grade', FACT])).code).toBe(1)
  })
  it('lint reads a file and reports issues', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lh-ei-'))
    const file = join(dir, 'facts.txt')
    writeFileSync(file, `${FACT} ${FACT}`)
    const r = await runCli(['lint', file, '--json'])
    expect(JSON.parse(r.out).issues.length).toBeGreaterThan(0)
    expect((await runCli(['lint', join(dir, 'missing.txt')])).code).toBe(1)
  })
  it('unknown subcommand prints usage', async () => {
    const r = await runCli(['wat'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('usage')
  })
})
