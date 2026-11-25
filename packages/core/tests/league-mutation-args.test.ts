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
