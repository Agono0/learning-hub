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
  }, 90000)

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
  }, 90000)

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
  }, 90000)

  it('runs debate, palace, world, and guild CLI commands (Batch C3)', async () => {
    // 1. debate open, turn, list
    const debateOpen = await runCli(
      [
        'debate',
        'open',
        '--topic',
        'Desirable Difficulties in Schema Formation',
        '--thesis',
        'Cognitivist',
        '--antithesis',
        'DirectInstructionist',
      ],
      getActiveDbPath(),
    )
    expect(debateOpen.exitCode).toBe(0)
    expect(debateOpen.stdout).toContain('Opened debate')
    expect(debateOpen.stdout).toContain('Desirable Difficulties')

    const debateTurn = await runCli(
      [
        'debate',
        'turn',
        '1',
        '--content',
        'Varied and interleaved practice enhances transfer to novel domains.',
        '--speaker',
        'thesis_agent',
        '--name',
        'Cognitivist',
      ],
      getActiveDbPath(),
    )
    expect(debateTurn.exitCode).toBe(0)
    expect(debateTurn.stdout).toContain('Appended turn')

    const debateList = await runCli(['debate', 'list'], getActiveDbPath())
    expect(debateList.exitCode).toBe(0)
    expect(debateList.stdout).toContain('Dialectic Arena Debates')
    expect(debateList.stdout).toContain('Desirable Difficulties')

    // 2. palace create, add, list
    const palaceCreate = await runCli(
      ['palace', 'create', 'Renaissance Memory Hall'],
      getActiveDbPath(),
    )
    expect(palaceCreate.exitCode).toBe(0)
    expect(palaceCreate.stdout).toContain('Created palace')
    expect(palaceCreate.stdout).toContain('Renaissance Memory Hall')

    const palaceAdd = await runCli(
      [
        'palace',
        'add',
        '1',
        '--locus',
        'Fountain Courtyard',
        '--image',
        'Gleaming obsidian fountain with cascading droplets',
      ],
      getActiveDbPath(),
    )
    expect(palaceAdd.exitCode).toBe(0)
    expect(palaceAdd.stdout).toContain('Added locus station')
    expect(palaceAdd.stdout).toContain('Fountain Courtyard')

    const palaceList = await runCli(['palace', 'list'], getActiveDbPath())
    expect(palaceList.exitCode).toBe(0)
    expect(palaceList.stdout).toContain('Memory Palaces')
    expect(palaceList.stdout).toContain('Renaissance Memory Hall')

    // 3. world status & market
    const worldStatus = await runCli(['world', 'status'], getActiveDbPath())
    expect(worldStatus.exitCode).toBe(0)
    expect(worldStatus.stdout).toContain('Study World Status')
    expect(worldStatus.stdout).toContain('Study Coins')

    const worldMarket = await runCli(['world', 'market'], getActiveDbPath())
    expect(worldMarket.exitCode).toBe(0)
    expect(worldMarket.stdout).toContain('Study World Market Catalog')

    // 4. guild create, list, join, leave
    const guildCreate = await runCli(
      ['guild', 'create', 'Polymath Society', '--tag', 'POLY', '--leader', 'scholar'],
      getActiveDbPath(),
    )
    expect(guildCreate.exitCode).toBe(0)
    expect(guildCreate.stdout).toContain('Created guild')
    expect(guildCreate.stdout).toContain('[POLY]')

    const guildList = await runCli(['guild', 'list'], getActiveDbPath())
    expect(guildList.exitCode).toBe(0)
    expect(guildList.stdout).toContain('Study Guilds')
    expect(guildList.stdout).toContain('Polymath Society')

    const guildJoin = await runCli(
      ['guild', 'join', '1', '--alias', 'apprentice'],
      getActiveDbPath(),
    )
    expect(guildJoin.exitCode).toBe(0)
    expect(guildJoin.stdout).toContain('apprentice joined guild #1')

    const guildLeave = await runCli(['guild', 'leave', '--alias', 'apprentice'], getActiveDbPath())
    expect(guildLeave.exitCode).toBe(0)
    expect(guildLeave.stdout).toContain('apprentice left their guild')
  }, 120000)

  it('runs audio, focus load, and games CLI commands (Batch C4)', async () => {
    // 1. audio schedule (commute and tmr)
    const audioCommute = await runCli(['audio', 'schedule', '--kind', 'commute'], getActiveDbPath())
    expect(audioCommute.exitCode).toBe(0)
    expect(audioCommute.stdout).toMatch(/Audio Hands-Free Commute Queue|No due cards ready/)

    const audioTmr = await runCli(
      ['audio', 'schedule', '--kind', 'tmr', '--action', 'mint'],
      getActiveDbPath(),
    )
    expect(audioTmr.exitCode).toBe(0)
    expect(audioTmr.stdout).toContain('sleep TMR cues')

    // 2. focus load
    const focusLoad = await runCli(['focus', 'load'], getActiveDbPath())
    expect(focusLoad.exitCode).toBe(0)
    expect(focusLoad.stdout).toMatch(/Cognitive Load & Flow Telemetry|No cognitive telemetry/)

    // 3. games status
    const gamesStatus = await runCli(['games', 'status'], getActiveDbPath())
    expect(gamesStatus.exitCode).toBe(0)
    expect(gamesStatus.stdout).toContain('Solo RPG Boss Battle Status')
    expect(gamesStatus.stdout).toContain('Mythical Boss Roster')
    expect(gamesStatus.stdout).toContain('Chronos')
  }, 90000)

  it('runs generation, feynman, and metacognition CLI commands', async () => {
    // 1. generation challenge
    const genChallenge = await runCli(
      ['generation', 'challenge', '--concept', 'Spaced Retrieval', '--tier', 'stem_completion'],
      getActiveDbPath(),
    )
    expect(genChallenge.exitCode).toBe(0)
    expect(genChallenge.stdout).toContain('Slamecka-Graf Generation Effect Ladder')
    expect(genChallenge.stdout).toContain('stem_completion')

    // 2. generation eval
    const genEval = await runCli(
      [
        'generation',
        'eval',
        '--concept',
        'Spaced Retrieval',
        '--expected',
        'Testing improves long-term memory retention',
        '--attempt',
        'Testing improves long-term memory retention',
        '--tier',
        'stem_completion',
      ],
      getActiveDbPath(),
    )
    expect(genEval.exitCode).toBe(0)
    expect(genEval.stdout).toContain('CORRECT')
    expect(genEval.stdout).toContain('100.0%')

    // 3. feynman eval
    const feynmanEval = await runCli(
      [
        'feynman',
        'eval',
        '--concept',
        'Hebbian Learning',
        '--explanation',
        'Neurons that fire together wire together through repeated stimulation.',
      ],
      getActiveDbPath(),
    )
    expect(feynmanEval.exitCode).toBe(0)
    expect(feynmanEval.stdout).toContain('Feynman Teach-Back & IOED Report')
    expect(feynmanEval.stdout).toContain('Hebbian Learning')

    // 4. metacognition stats
    const metaStats = await runCli(['metacognition', 'stats'], getActiveDbPath())
    expect(metaStats.exitCode).toBe(0)
    expect(metaStats.stdout).toContain('Metacognitive Calibration Profile')
  }, 90000)
})
