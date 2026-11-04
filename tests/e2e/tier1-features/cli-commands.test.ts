import { describe, it, expect } from 'vitest'
import { runCli } from '../helpers/cli-runner'
import { getActiveDbPath } from '../helpers/setup'

describe('Tier 1: Terminal CLI Subsystem Execution', () => {
  it('displays command summary when run without arguments', async () => {
    const res = await runCli([], getActiveDbPath())

    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('learning-hub')
    expect(res.stdout).toContain('capture')
    expect(res.stdout).toContain('today')
    expect(res.stdout).toContain('stats')
    expect(res.stdout).toContain('quote')
  })

  it('captures an idea via `learning-hub capture <text>`', async () => {
    const res = await runCli(['capture', 'CLI Spaced Repetition Idea'], getActiveDbPath())

    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Captured idea')
    expect(res.stdout).toContain('inbox')
    expect(res.stdout).toContain('CLI Spaced Repetition Idea')
  })

  it('prints today dashboard via `learning-hub today`', async () => {
    const res = await runCli(['today'], getActiveDbPath())

    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('TODAY')
    expect(res.stdout).toContain('Due cards:')
    expect(res.stdout).toContain('Streak:')
  })

  it('prints learning statistics via `learning-hub stats`', async () => {
    const res = await runCli(['stats'], getActiveDbPath())

    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('LEARNING STATS')
    expect(res.stdout).toContain('True retention:')
    expect(res.stdout).toContain('XP:')
  })

  it('prints random quote via `learning-hub quote`', async () => {
    const res = await runCli(['quote'], getActiveDbPath())

    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('—') // Author delimiter
  })
})
