import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leaguesRemoteCommands } from '../../../apps/cli/src/commands/leagues-remote'

const SERVER = 'https://league.example.dev'
const LEAGUE = 'lg-cli-remote-01'
const cmd = leaguesRemoteCommands[0]!

let out: string[]
let err: string[]

beforeEach(() => {
  out = []
  err = []
  process.exitCode = 0
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')))
})

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

const run = (...args: string[]) => cmd.run(args)

describe('Tier 1: leagues-remote CLI', () => {
  it('links a league and lists it with an empty queue', async () => {
    await run('link', SERVER, LEAGUE)
    expect(out.join('\n')).toContain(`Linked ${LEAGUE}`)
    out.length = 0
    await run('list')
    const text = out.join('\n')
    expect(text).toContain(LEAGUE)
    expect(text).toContain('0 pending')
  })

  it('enqueues every membership mutation and sends nothing', async () => {
    const lines = [
      ['join', 'Ada'],
      ['rename', 'Ada', 'L'],
      ['invite-policy', 'on'],
      ['remove-member', 'usr_bo'],
      ['unblock-member', 'usr_bo'],
      ['leave'],
    ]
    for (const mutation of lines) {
      out.length = 0
      await run('enqueue', SERVER, LEAGUE, ...mutation)
      expect(out.join('\n')).toMatch(/Queued .* \(\d+ pending\)\. Not sent yet\./)
      expect(process.exitCode).toBe(0)
    }
    out.length = 0
    await run('queue', SERVER, LEAGUE)
    const text = out.join('\n')
    for (const t of [
      'join',
      'rename',
      'invite-policy',
      'remove-member',
      'unblock-member',
      'leave',
    ]) {
      expect(text).toContain(t)
    }
  })

  it('refuses a malformed mutation with a message and a failing exit code', async () => {
    await run('enqueue', SERVER, LEAGUE, 'remove-member')
    expect(err.join('\n')).toMatch(/handle/)
    expect(process.exitCode).toBe(1)
  })

  it('refuses a bad league id before queueing anything', async () => {
    await run('enqueue', SERVER, 'BAD ID', 'leave')
    expect(process.exitCode).toBe(1)
    expect(err.length).toBeGreaterThan(0)
  })

  it('invite-new shows the code once and queues only the digest', async () => {
    await run('invite-new', SERVER, LEAGUE, '--uses', '2', '--hours', '3')
    const lines = out
    const code = lines.find((l) => /^[A-Za-z0-9_-]{32}$/.test(l))
    expect(code).toBeDefined()
    expect(lines.join('\n')).toContain('shown once')
    out.length = 0
    await run('queue', SERVER, LEAGUE)
    const queue = out.join('\n')
    expect(queue).toContain('invite-create')
    expect(queue).not.toContain(code as string)
  })

  it('invite-new rejects out-of-range options', async () => {
    await run('invite-new', SERVER, LEAGUE, '--uses', '999')
    expect(process.exitCode).toBe(1)
  })

  it('queue on an unlinked league says to link first', async () => {
    await run('queue', SERVER, 'lg-never-linked')
    expect(err.join('\n')).toContain('leagues-remote link')
    expect(process.exitCode).toBe(1)
  })

  it('prints usage for an unknown subcommand', async () => {
    await run('bogus')
    expect(err.join('\n')).toContain('Usage: learning-hub leagues-remote')
    expect(process.exitCode).toBe(1)
  })
})
