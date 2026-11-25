import { describe, expect, it } from 'vitest'
import { parseMutationArgs, parsePromptSpec } from '../src/leagues'

const err = (args: string[]): string => {
  const r = parseMutationArgs(args)
  if (r.ok) throw new Error('expected failure')
  return r.error
}

describe('parsePromptSpec', () => {
  it('splits id, question and answers, trimming blanks', () => {
    expect(parsePromptSpec('p1::Capital of France?::Paris| paris ||')).toEqual({
      ok: true,
      prompt: { id: 'p1', question: 'Capital of France?', answers: ['Paris', 'paris'] },
    })
  })
  it('rejects wrong shapes', () => {
    for (const bad of ['', 'p1', 'p1::q', 'p1::q::a::extra', '::q::a', 'p1:: ::a', 'p1::q::|']) {
      expect(parsePromptSpec(bad).ok, bad).toBe(false)
    }
  })
})

describe('parseMutationArgs', () => {
  it('parses join with a multi-word alias', () => {
    expect(parseMutationArgs(['join', 'Ada', 'Lovelace'])).toEqual({
      ok: true,
      mutation: { type: 'join', alias: 'Ada Lovelace' },
    })
  })

  it('parses close-round and refuses stray arguments', () => {
    expect(parseMutationArgs(['close-round']).ok).toBe(true)
    expect(err(['close-round', 'now'])).toMatch(/no arguments/)
  })

  it('parses duel-start and duel-answer', () => {
    expect(parseMutationArgs(['duel-start', 'duel-1'])).toEqual({
      ok: true,
      mutation: { type: 'duel-start', duelId: 'duel-1' },
    })
    expect(parseMutationArgs(['duel-answer', 'duel-1', 'p1', 'the', 'answer'])).toEqual({
      ok: true,
      mutation: { type: 'duel-answer', duelId: 'duel-1', promptId: 'p1', answer: 'the answer' },
    })
    expect(err(['duel-start'])).toMatch(/duel id/)
    expect(err(['duel-answer', 'd'])).toMatch(/prompt id/)
  })

  it('parses duel-open with repeated --prompt flags in any position', () => {
    const r = parseMutationArgs([
      'duel-open',
      '--prompt',
      'a::Q1::x|y',
      'duel-9',
      'usr_opponent',
      '--prompt',
      'b::Q2::z',
    ])
    expect(r).toEqual({
      ok: true,
      mutation: {
        type: 'duel-open',
        duelId: 'duel-9',
        opponent: 'usr_opponent',
        prompts: [
          { id: 'a', question: 'Q1', answers: ['x', 'y'] },
          { id: 'b', question: 'Q2', answers: ['z'] },
        ],
      },
    })
  })

  it('duel-open errors are specific', () => {
    expect(err(['duel-open', 'd1'])).toMatch(/duel-open needs/)
    expect(err(['duel-open', 'd1', 'usr_x'])).toMatch(/at least one --prompt/)
    expect(err(['duel-open', 'd1', 'usr_x', '--prompt', 'bad'])).toMatch(/bad --prompt/)
    expect(err(['duel-open', 'd1', 'usr_x', 'extra', '--prompt', 'a::q::b'])).toMatch(
      /duel-open needs/,
    )
  })

  it('runs everything through the schema: bad ids and oversized text are refused', () => {
    expect(err(['duel-start', 'has space'])).toMatch(/invalid duel-start/)
    expect(err(['join', 'x'.repeat(41)])).toMatch(/invalid join/)
    expect(err(['duel-answer', 'd', 'p', 'y'.repeat(401)])).toMatch(/invalid duel-answer/)
  })

  it('refuses unknown types and mutations that would set scores', () => {
    expect(err([])).toMatch(/required/)
    expect(err(['set-points', '9999'])).toMatch(/unknown mutation type/)
    expect(err(['award', 'usr_a'])).toMatch(/unknown mutation type/)
  })
})

describe('membership mutation arguments', () => {
  const digest = 'ab'.repeat(32)

  it('parses join with an invite code in any position', () => {
    const code = 'x'.repeat(32)
    expect(parseMutationArgs(['join', '--invite', code, 'Ada', 'L'])).toEqual({
      ok: true,
      mutation: { type: 'join', alias: 'Ada L', invite: code },
    })
    expect(parseMutationArgs(['join', 'Ada'])).toEqual({
      ok: true,
      mutation: { type: 'join', alias: 'Ada' },
    })
    expect(err(['join', 'Ada', '--invite', 'short'])).toMatch(/invite/)
    expect(err(['join', '--invite', code, '--invite', code, 'Ada'])).toMatch(/at most one/)
  })

  it('parses rename and leave', () => {
    expect(parseMutationArgs(['rename', 'New', 'Name'])).toEqual({
      ok: true,
      mutation: { type: 'rename', alias: 'New Name' },
    })
    expect(err(['rename'])).toMatch(/alias/)
    expect(parseMutationArgs(['leave']).ok).toBe(true)
    expect(err(['leave', 'now'])).toMatch(/no arguments/)
  })

  it('parses invite-create with defaults and flags', () => {
    expect(parseMutationArgs(['invite-create', digest])).toEqual({
      ok: true,
      mutation: { type: 'invite-create', digest, maxUses: 1, ttlMs: 24 * 60 * 60_000 },
    })
    expect(parseMutationArgs(['invite-create', '--uses', '5', digest, '--hours', '2'])).toEqual({
      ok: true,
      mutation: { type: 'invite-create', digest, maxUses: 5, ttlMs: 2 * 60 * 60_000 },
    })
  })

  it('rejects malformed invite arguments with a readable error', () => {
    expect(err(['invite-create'])).toMatch(/digest/)
    expect(err(['invite-create', 'nothex'])).toMatch(/invalid invite-create/)
    expect(err(['invite-create', digest, '--uses', 'many'])).toMatch(/numbers/)
    expect(err(['invite-create', digest, '--uses', '99'])).toMatch(/invalid invite-create/)
    expect(err(['invite-create', digest, '--hours', '1000'])).toMatch(/invalid invite-create/)
    expect(err(['invite-revoke'])).toMatch(/digest/)
    expect(parseMutationArgs(['invite-revoke', digest]).ok).toBe(true)
  })

  it('parses invite-policy on and off only', () => {
    expect(parseMutationArgs(['invite-policy', 'on'])).toEqual({
      ok: true,
      mutation: { type: 'invite-policy', required: true },
    })
    expect(parseMutationArgs(['invite-policy', 'off'])).toEqual({
      ok: true,
      mutation: { type: 'invite-policy', required: false },
    })
    expect(err(['invite-policy', 'maybe'])).toMatch(/on or off/)
    expect(err(['invite-policy'])).toMatch(/on or off/)
  })
})
