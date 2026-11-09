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

  it('runs search, fsrs, starter, and sync status commands cleanly', async () => {
    const searchRes = await runCli(['search', 'Spaced Repetition'], getActiveDbPath())
    expect(searchRes.exitCode).toBe(0)
    expect(searchRes.stdout).toContain('SEARCH')

    const fsrsRes = await runCli(['fsrs', 'status'], getActiveDbPath())
    expect(fsrsRes.exitCode).toBe(0)
    expect(fsrsRes.stdout).toContain('FSRS-6 STATUS')

    const starterRes = await runCli(['starter', 'list'], getActiveDbPath())
    expect(starterRes.exitCode).toBe(0)
    expect(starterRes.stdout).toContain('STARTER LIBRARY')
    expect(starterRes.stdout).toContain('sql-essentials')

    const syncRes = await runCli(['sync', 'status'], getActiveDbPath())
    expect(syncRes.exitCode).toBe(0)
    expect(syncRes.stdout).toContain('CLOUD SYNC')
  })

  it('runs habits, journal, and physio CLI commands (Batch C1)', async () => {
    // 1. habits list
    const habitsRes = await runCli(['habits', 'list'], getActiveDbPath())
    expect(habitsRes.exitCode).toBe(0)
    expect(habitsRes.stdout).toMatch(/Habits|No habits found/)

    // 2. journal write & show
    const journalWrite = await runCli(
      ['journal', 'write', '--date', '2026-11-09', '--mood', '5', '--wins', 'Shipped Batch C1 CLI'],
      getActiveDbPath(),
    )
    expect(journalWrite.exitCode).toBe(0)
    expect(journalWrite.stdout).toContain('Journal entry saved')

    const journalShow = await runCli(['journal', 'show', '2026-11-09'], getActiveDbPath())
    expect(journalShow.exitCode).toBe(0)
    expect(journalShow.stdout).toContain('Shipped Batch C1 CLI')

    // 3. physio command
    const physioRes = await runCli(
      ['physio', '--sleep', '7.5', '--exercise', '30', '--arousal', '6'],
      getActiveDbPath(),
    )
    expect(physioRes.exitCode).toBe(0)
    expect(physioRes.stdout).toContain('Physiology & Retention Telemetry')
    expect(physioRes.stdout).toContain('Yerkes-Dodson zone')
  })

  it('runs reading, plan, and gkt CLI commands (Batch C2)', async () => {
    // 1. reading add & list
    const readingAdd = await runCli(
      [
        'reading',
        'add',
        '--title',
        'Testing Effects in Human Memory',
        '--content',
        'Retrieval practice produces durable consolidation over restudy.',
        '--priority',
        '80',
      ],
      getActiveDbPath(),
    )
    expect(readingAdd.exitCode).toBe(0)
    expect(readingAdd.stdout).toContain('Ingested reading source')

    const readingList = await runCli(['reading', 'list'], getActiveDbPath())
    expect(readingList.exitCode).toBe(0)
    expect(readingList.stdout).toContain('Testing Effects in Human Memory')

    // 2. plan set & week
    const planSet = await runCli(
      ['plan', 'set', '--minutes', '300', '--rest-day', '0'],
      getActiveDbPath(),
    )
    expect(planSet.exitCode).toBe(0)
    expect(planSet.stdout).toContain('Generated and saved study plan template')

    const planWeek = await runCli(['plan', 'week'], getActiveDbPath())
    expect(planWeek.exitCode).toBe(0)
    expect(planWeek.stdout).toContain('Weekly Study Plan')
    expect(planWeek.stdout).toContain('Rest Day')

    // 3. gkt drill
    const gktDrill = await runCli(['gkt', 'drill', '--answer', 'true'], getActiveDbPath())
    expect(gktDrill.exitCode).toBe(0)
    expect(gktDrill.stdout).toContain('Graph Knowledge Tracing (GKT)')
    expect(gktDrill.stdout).toContain('Updated mastery')
  })
})
