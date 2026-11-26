import { describe, it, expect } from 'vitest'
import { runCli } from '../helpers/cli-runner'
import { getActiveDbPath } from '../helpers/setup'

/**
 * Usage errors and "not found" used to print to stderr and still exit 0, so scripts could not
 * tell a failed command from a successful one. They now exit non-zero. Numeric flags that went
 * through bare Number() (NaN reached the repos) now fail with a one-line usage error (exit 2).
 */
describe('Tier 2: CLI exit codes on bad input', () => {
  it.each([
    [['goals', 'update', 'abc']],
    [['goals', 'delete', 'abc']],
    [['goals', 'delete', '99999']],
    [['notes', 'show', 'abc']],
    [['notes', 'show', '99999']],
    [['habits', 'checkin', 'abc']],
    [['habits', 'checkin', '99999']],
    [['reading', 'finish', 'abc']],
    [['plan', 'set']],
  ])('%j exits non-zero', async (args) => {
    const res = await runCli(args, getActiveDbPath())
    expect(res.exitCode).not.toBe(0)
    expect(res.stderr.length).toBeGreaterThan(0)
    expect(res.stderr).not.toContain('    at ')
  })

  it.each([
    [['goals', 'update', '1', '--progress', 'abc'], '--progress'],
    [['goals', 'update', '1', '--progress', '150'], '--progress'],
    [['goals', 'plan', 'list', '--goal', 'x'], '--goal'],
    [['plan', 'set', '--minutes', 'abc'], '--minutes'],
    [['plan', 'set', '--minutes', '0'], '--minutes'],
    [['plan', 'set', '--minutes', '60', '--rest-day', '9'], '--rest-day'],
    [['physio', 'log', '--sleep', 'abc'], '--sleep'],
    [['physio', 'log', '--sleep', '99'], '--sleep'],
  ])('%j exits 2 with a one-line message', async (args, flag) => {
    const res = await runCli(args, getActiveDbPath())
    expect(res.exitCode).toBe(2)
    expect(res.stderr).toContain(`error: ${flag}`)
    expect(res.stderr).not.toContain('    at ')
  })

  it('leagues create with a non-numeric --round-days fails with a message instead of storing NaN', async () => {
    const res = await runCli(
      ['leagues', 'create', 'bad-num', 'Bad', '--round-days', 'abc'],
      getActiveDbPath(),
    )
    expect(res.exitCode).not.toBe(0)
    expect(res.stderr).toContain('numeric option')
  })

  it('unknown subcommand is a failure, not a success', async () => {
    const res = await runCli(['debate', 'nonsense-sub'], getActiveDbPath())
    expect(res.exitCode).not.toBe(0)
  })

  it('a good command still exits 0', async () => {
    const res = await runCli(['notes', 'list'], getActiveDbPath())
    expect(res.exitCode).toBe(0)
  })
})
