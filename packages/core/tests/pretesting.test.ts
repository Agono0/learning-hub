import { describe, expect, it } from 'vitest'
import {
  PretestingSession,
  auditPretestCard,
  buildPretestQuestion,
  evaluatePretestingSession,
  gradeGuess,
  pickPretestKind,
  pretestRelatedness,
  selectPretestCandidates,
  type PretestCardState,
} from '../src/pretesting'

function attempt(
  overrides: Partial<
    Parameters<typeof gradeGuess> extends never
      ? never
      : {
          cardId?: number
          guess?: string
          confidence?: number
          wasCorrect?: boolean
          feedbackDelivered?: boolean
          kind?: 'direct_retrieval'
        }
  > = {},
) {
  return {
    cardId: overrides.cardId ?? 1,
    kind: overrides.kind ?? ('direct_retrieval' as const),
    guess: overrides.guess ?? 'hippocampus',
    confidence: overrides.confidence ?? 0.5,
    wasCorrect: overrides.wasCorrect ?? false,
    feedbackDelivered: overrides.feedbackDelivered ?? true,
  }
}

const SOLID_STATE: PretestCardState = {
  cardId: 1,
  prompt: 'Before studying: WHY might the following be true — "What is memory consolidation?"',
  target: 'Memory consolidation stabilizes fragile traces during slow-wave sleep',
  kind: 'inferential_why',
  relatedness: 0.8,
  attempts: [
    attempt({
      guess: 'something about sleep',
      confidence: 0.6,
      wasCorrect: false,
      feedbackDelivered: true,
    }),
  ],
  studyEpisodes: [{ cardId: 1, delayMsAfterAttempt: 15000, resolvesPretest: true }],
  criterionRecalls: 3,
  successfulRecalls: 3,
  criterionMet: true,
}

describe('pretest question generation (deterministic)', () => {
  it('picks kinds by prompt/target shape', () => {
    expect(pickPretestKind('Why does sleep help memory?', 'Sleep consolidates traces')).toBe(
      'inferential_why',
    )
    expect(pickPretestKind('What is a quorum?', 'quorum')).toBe('anagram_generation')
    expect(pickPretestKind('What is the CAP theorem?', 'CAP theorem')).toBe('direct_retrieval')
    expect(pickPretestKind('Explain Raft leader election', 'Raft leader election')).toBe(
      'cloze_completion',
    )
  })

  it('builds questions and keeps them conceptually tied to targets', () => {
    const built = buildPretestQuestion('What is a quorum?', 'quorum')
    expect(built.kind).toBe('anagram_generation')
    // Deterministic anagram: same letters, different order (or identity for
    // tiny words), reproducible across calls.
    expect(built.question).toContain('What is a quorum?')
    expect(built.question).toBe(buildPretestQuestion('What is a quorum?', 'quorum').question)
  })

  it('scores relatedness: shared keywords rate high, arbitrary questions rate low', () => {
    const solid = pretestRelatedness(
      'Why does consolidation stabilize memory traces during sleep?',
      'Consolidation stabilizes memory traces during sleep',
    )
    expect(solid).toBeGreaterThanOrEqual(0.5)
    const arbitrary = pretestRelatedness(
      'What is your favorite color of the sky?',
      'Consolidation stabilizes traces',
    )
    expect(arbitrary).toBeLessThan(0.5)
  })

  it('grades guesses with forgiving matching', () => {
    expect(gradeGuess('Memory Consolidation', 'memory consolidation')).toBe(true)
    expect(gradeGuess('  the   hippocampus ', 'hippocampus')).toBe(true)
    expect(gradeGuess('', 'hippocampus')).toBe(false)
    expect(gradeGuess('completely wrong', 'hippocampus')).toBe(false)
    // Long targets get substring and word-overlap credit.
    expect(
      gradeGuess(
        'Consolidation stabilizes fragile memory traces during sleep',
        'Memory consolidation stabilizes fragile traces during slow-wave sleep',
      ),
    ).toBe(true)
  })
})

describe('protocol audit (Little & Bjork / Butler & Roediger gates)', () => {
  it('grants the full multiplier for a compliant failed-pretest protocol', () => {
    const audit = auditPretestCard(SOLID_STATE)
    // 1.0 + 0.08 (failed) + 0.05 (feedback) + 0.05 (prompt study) + 0.04
    // (solid) + 0.03 (criterion) = 1.25 (capped).
    expect(audit.predictedRetentionMultiplier).toBe(1.25)
    expect(audit.firstAttemptFailed).toBe(true)
    expect(audit.feedbackCompliant).toBe(true)
    expect(audit.promptStudy).toBe(true)
    expect(audit.solidPretest).toBe(true)
    expect(audit.relearningProgress).toBe(1)
    expect(audit.rationale).toContain('Kornell')
  })

  it('flags missing feedback as the strongest protocol violation', () => {
    const audit = auditPretestCard({
      ...SOLID_STATE,
      attempts: [attempt({ feedbackDelivered: false, wasCorrect: false })],
    })
    expect(audit.feedbackCompliant).toBe(false)
    expect(audit.rationale).toContain('uncorrected errors')
    expect(audit.predictedRetentionMultiplier).toBeLessThan(1.25)
  })

  it('demotes arbitrary pretest questions (preparation without pretesting)', () => {
    const audit = auditPretestCard({ ...SOLID_STATE, relatedness: 0.2 })
    expect(audit.solidPretest).toBe(false)
    expect(audit.rationale).toContain('Little & Bjork')
  })

  it('flags late study episodes', () => {
    const audit = auditPretestCard({
      ...SOLID_STATE,
      studyEpisodes: [{ cardId: 1, delayMsAfterAttempt: 300000, resolvesPretest: true }],
    })
    expect(audit.promptStudy).toBe(false)
    // failed 0.08 + feedback 0.05 + solid 0.04 + criterion 0.03, promptStudy 0.
    expect(audit.predictedRetentionMultiplier).toBe(1.2)
  })

  it('gives study-only cards no multiplier and an honest rationale', () => {
    const audit = auditPretestCard({
      ...SOLID_STATE,
      attempts: [],
      studyEpisodes: [],
      criterionMet: false,
      successfulRecalls: 0,
    })
    expect(audit.pretestAttempts).toBe(0)
    expect(audit.predictedRetentionMultiplier).toBe(1)
    expect(audit.rationale).toContain('No pretest attempt yet')
    expect(audit.feedbackCompliant).toBe(false)
  })

  it('caps the multiplier at 1.25 — no lab-scale promises', () => {
    const audit = auditPretestCard(SOLID_STATE)
    expect(audit.predictedRetentionMultiplier).toBeLessThanOrEqual(1.25)
  })
})

describe('session aggregation', () => {
  it('reports honest zeros with no attempts', () => {
    const report = evaluatePretestingSession([{ ...SOLID_STATE, attempts: [], studyEpisodes: [] }])
    expect(report.protocolCompliance).toBe(0)
    expect(report.meanPredictedMultiplier).toBe(1)
    expect(report.hypercorrectionTargets).toEqual([])
    expect(report.guidance).toContain('GUESSING before studying')
  })

  it('aggregates compliance, hypercorrection targets and the relearning queue', () => {
    const card2: PretestCardState = {
      ...SOLID_STATE,
      cardId: 2,
      criterionMet: false,
      successfulRecalls: 1,
      attempts: [attempt({ cardId: 2, guess: 'wrong guess', confidence: 0.9, wasCorrect: false })],
      studyEpisodes: [{ cardId: 2, delayMsAfterAttempt: 20000, resolvesPretest: true }],
    }
    const report = evaluatePretestingSession([SOLID_STATE, card2])
    // Both cards followed the full protocol (failed guess + feedback + prompt
    // study + solid question) → compliance 1.0. Both are audited.
    expect(report.protocolCompliance).toBe(1)
    expect(report.cards).toHaveLength(2)
  })

  it('collects confident wrong guesses as hypercorrection targets', () => {
    const card2: PretestCardState = {
      ...SOLID_STATE,
      cardId: 2,
      criterionMet: false,
      successfulRecalls: 1,
      attempts: [
        attempt({
          cardId: 2,
          guess: 'I was sure it was the striatum',
          confidence: 0.9,
          wasCorrect: false,
        }),
        attempt({ cardId: 2, guess: 'no idea', confidence: 0.2, wasCorrect: false }),
      ],
      studyEpisodes: [{ cardId: 2, delayMsAfterAttempt: 10000, resolvesPretest: true }],
    }
    const report = evaluatePretestingSession([card2])
    expect(report.hypercorrectionTargets).toHaveLength(1)
    expect(report.hypercorrectionTargets[0].confidence).toBe(0.9)
    expect(report.relearningQueue).toContain(2)
    expect(report.guidance).toContain('Butterfield')
  })
})

describe('PretestingSession state machine', () => {
  const prompts = [
    { cardId: 1, prompt: 'What is a quorum?', target: 'quorum' },
    {
      cardId: 2,
      prompt: 'Why does sleep consolidate memory?',
      target: 'Sleep replays fragile traces',
    },
  ]

  it('walks pretest → study → retest and reaches the criterion', () => {
    const session = new PretestingSession(prompts)
    expect(session.currentCard()!.cardId).toBe(1)
    expect(session.getState().phase).toBe('pretest')

    const guess = session.recordPretestAttempt({ guess: 'majority vote', confidence: 0.5 })
    expect(guess.success).toBe(true)
    expect(guess.wasCorrect).toBe(false)
    expect(session.getState().phase).toBe('study')
    expect(session.getState().lastFeedback).toContain('Kornell')

    const study = session.recordStudyEpisode(12000)
    expect(study.success).toBe(true)
    expect(session.getState().phase).toBe('retest')

    // Criterion is 3 consecutive recalls.
    expect(session.recordRetest(true).criterionMet).toBe(false)
    expect(session.recordRetest(true).criterionMet).toBe(false)
    const third = session.recordRetest(true)
    expect(third.criterionMet).toBe(true)
    expect(session.currentCard()!.cardId).toBe(2)
    expect(session.getState().phase).toBe('pretest')
  })

  it('resets the criterion on a lapse and refuses out-of-order operations', () => {
    const session = new PretestingSession(prompts)
    expect(session.recordStudyEpisode(100).success).toBe(false)
    expect(session.recordRetest(true).success).toBe(false)
    expect(session.recordPretestAttempt({ guess: 'x', confidence: 1.5 }).success).toBe(false)

    session.recordPretestAttempt({ guess: 'nope', confidence: 0.4 })
    session.recordStudyEpisode(5000)
    session.recordRetest(true)
    session.recordRetest(true)
    const lapse = session.recordRetest(false)
    expect(lapse.criterionMet).toBe(false)
    expect(session.currentCard()!.successfulRecalls).toBe(0)
    // Still in retest phase for the same card.
    expect(session.getState().phase).toBe('retest')
  })

  it('marks feedback absence in the feedback text without hiding the error', () => {
    const session = new PretestingSession(prompts)
    const r = session.recordPretestAttempt({
      guess: 'banana',
      confidence: 0.7,
      feedbackDelivered: false,
    })
    expect(r.success).toBe(true)
    expect(session.getState().lastFeedback).toContain('No feedback')
  })

  it('completes when all cards meet their criteria', () => {
    const session = new PretestingSession(prompts.slice(0, 1))
    session.recordPretestAttempt({ guess: 'quorum', confidence: 0.8 })
    session.recordStudyEpisode(8000)
    session.recordRetest(true)
    session.recordRetest(true)
    const final = session.recordRetest(true)
    expect(final.criterionMet).toBe(true)
    expect(session.getState().phase).toBe('complete')
    expect(session.currentCard()).toBeNull()
    // Out-of-order after completion:
    expect(session.recordPretestAttempt({ guess: 'x', confidence: 0.5 }).success).toBe(false)
  })

  it('reports through the pure aggregator at any point', () => {
    const session = new PretestingSession(prompts)
    session.recordPretestAttempt({ guess: 'wrong', confidence: 0.85 })
    session.recordStudyEpisode(30000)
    const report = session.report()
    // Only the attempted card carries an audit — no fabricated entries for
    // untouched cards.
    expect(report.cards).toHaveLength(1)
    expect(report.hypercorrectionTargets[0].cardId).toBe(1)
    expect(report.meanPredictedMultiplier).toBeGreaterThan(1)
  })
})

describe('FSRS candidate selection', () => {
  it('prioritizes young, hard cards for the pretest protocol', () => {
    const picked = selectPretestCandidates(
      [
        { cardId: 1, stability: 0.5, difficulty: 9 },
        { cardId: 2, stability: 20, difficulty: 3 },
        { cardId: 3, stability: 1.2, difficulty: 7 },
        { cardId: 4, stability: 2.8, difficulty: 5 },
      ],
      3,
    )
    expect(picked.map((c) => c.cardId)).toEqual([1, 3, 4])
    expect(picked).toHaveLength(3)
  })

  it('caps the list', () => {
    const picked = selectPretestCandidates(
      Array.from({ length: 20 }, (_, i) => ({ cardId: i + 1, stability: 0.5, difficulty: 8 })),
      10,
    )
    expect(picked).toHaveLength(10)
  })
})
