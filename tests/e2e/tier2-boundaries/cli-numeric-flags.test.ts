import { describe, it, expect } from 'vitest'
import { runCli } from '../helpers/cli-runner'
import { getActiveDbPath } from '../helpers/setup'

/**
 * Numeric CLI flags used to go through bare `Number(...)`: `--limit abc` became NaN (SQL LIMIT
 * NULL), `--limit -1` meant "no limit", and engines printed NaN for `--score abc`. They now fail
 * with a one-line usage error (exit 2) or fall back to the default when the flag is absent.
 */
describe('Tier 2: CLI numeric flag validation', () => {
  it.each([
    [['notes', 'list', '--limit', 'abc'], '--limit'],
    [['notes', 'list', '--limit', '-1'], '--limit'],
    [['notes', 'list', '--limit', '0'], '--limit'],
    [['notes', 'list', '--limit', '1.5'], '--limit'],
    [['notes', 'list', '--limit', 'Infinity'], '--limit'],
    [['goals', 'list', '--limit', 'NaN'], '--limit'],
  ])('%j exits 2 with a one-line message', async (args, flag) => {
    const res = await runCli(args, getActiveDbPath())
    expect(res.exitCode).toBe(2)
    expect(res.stderr).toContain(`error: ${flag} must be`)
    expect(res.stderr).not.toContain('    at ')
    expect(res.stdout).not.toContain('NaN')
  })

  it('valid limits still work', async () => {
    const res = await runCli(['notes', 'list', '--limit', '5'], getActiveDbPath())
    expect(res.exitCode).toBe(0)
  })

  it('absent flag uses the default', async () => {
    const res = await runCli(['notes', 'list'], getActiveDbPath())
    expect(res.exitCode).toBe(0)
  })

  it('audio tmr-plan: --limit caps the plan size instead of dropping the most fragile cards', async () => {
    const bad = await runCli(['audio', 'tmr-plan', '--limit', '-3'], getActiveDbPath())
    expect(bad.exitCode).toBe(2)
    const ok = await runCli(['audio', 'tmr-plan', '--limit', '2'], getActiveDbPath())
    expect(ok.exitCode).toBe(0)
  })
})
