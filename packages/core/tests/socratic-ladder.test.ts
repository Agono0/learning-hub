import { describe, expect, it } from 'vitest'
import {
  buildAnswerCloze,
  evaluateSocraticTurn,
  type SocraticCardContext,
} from '../src/socratic-ladder'

describe('Socratic Escalation Ladder', () => {
  const context: SocraticCardContext = {
    topic: 'Cell Biology',
    prompt: 'What organelle produces ATP via cellular respiration?',
    targetAnswer: 'Mitochondria',
    explanation: 'Known as the powerhouse of the cell',
  }

  it('buildAnswerCloze masks words with structural prefixes', () => {
    expect(buildAnswerCloze('Mitochondria')).toMatch(/^Mito―+/)
    expect(buildAnswerCloze('Cellular Respiration')).toMatch(/^Cellular Res―+/)
    expect(buildAnswerCloze('')).toBe('______')
  })

  it('returns initial opening question on empty transcript', () => {
    const turn = evaluateSocraticTurn({
      context,
      userTranscript: '',
      currentRung: 1,
      attemptCount: 0,
    })
    expect(turn.spokenReply).toContain('Cell Biology')
    expect(turn.spokenReply).toContain(context.prompt)
    expect(turn.nextRung).toBe(1)
    expect(turn.revealedAnswer).toBe(false)
  })

  it('enforces Generation Guard: never reveals answer on rung 4 if attempts === 0', () => {
    const turn = evaluateSocraticTurn({
      context,
      userTranscript: 'give me the answer please',
      currentRung: 3, // hint request would promote to 4
      attemptCount: 0, // no genuine attempts made yet!
    })
    expect(turn.revealedAnswer).toBe(false)
    expect(turn.spokenReply).toContain('active prediction')
    expect(turn.spokenReply).not.toContain('Mitochondria')
  })

  it('reveals answer with re-derivation inquiry on rung 4 after attempts >= 1', () => {
    const turn = evaluateSocraticTurn({
      context,
      userTranscript: 'I give up, tell me the answer',
      currentRung: 3,
      attemptCount: 1, // at least 1 attempt made
    })
    expect(turn.revealedAnswer).toBe(true)
    expect(turn.spokenReply).toContain('Mitochondria')
    expect(turn.spokenReply).toContain('what core concept makes "Mitochondria" the right solution')
  })

  it('escalates to structural hint on rung 2', () => {
    const turn = evaluateSocraticTurn({
      context,
      userTranscript: 'I am stuck, give me a clue',
      currentRung: 1,
      attemptCount: 1,
    })
    expect(turn.nextRung).toBe(2)
    expect(turn.spokenReply).toContain('starts with "M"')
    expect(turn.spokenReply).toContain('characters')
  })

  it('escalates to cloze framework on rung 3', () => {
    const turn = evaluateSocraticTurn({
      context,
      userTranscript: 'still need another hint',
      currentRung: 2,
      attemptCount: 1,
    })
    expect(turn.nextRung).toBe(3)
    expect(turn.spokenReply).toContain('Mito')
    expect(turn.spokenReply).toContain('partial framework')
  })
})
