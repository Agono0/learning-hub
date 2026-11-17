import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_QUESTION_BANKS,
  AdaptiveExamSession,
  SuccessiveRelearningBuffer,
  calculateItemInformation,
  calculateProbability3PL,
  calculateSEM,
  calculateTestInformation,
  estimateAbilityEAP,
  evaluateSPRT,
  selectNextAdaptiveItem,
  thetaToPercentileRank,
  type AdaptiveExamConfig,
} from '../src/practice'

describe('Computerized Adaptive Testing & Item Response Theory (IRT) Engine', () => {
  describe('3-Parameter Logistic (3PL) Model Foundations', () => {
    it('calculates monotonic item characteristic probabilities correctly', () => {
      const a = 1.5 // discrimination
      const b = 0.5 // difficulty
      const c = 0.2 // guessing

      const pLow = calculateProbability3PL(-3.0, a, b, c)
      const pMid = calculateProbability3PL(b, a, b, c)
      const pHigh = calculateProbability3PL(3.0, a, b, c)

      // At theta = b, P = c + (1 - c) / 2 = 0.2 + 0.4 = 0.60
      expect(pMid).toBeCloseTo(0.6, 2)
      // Monotonicity: P(-3) < P(b) < P(+3)
      expect(pLow).toBeLessThan(pMid)
      expect(pMid).toBeLessThan(pHigh)
      // Lower asymptote approaches c = 0.2
      expect(pLow).toBeGreaterThanOrEqual(c)
      // Upper asymptote approaches 1.0
      expect(pHigh).toBeLessThanOrEqual(1.0)
    })

    it('calculates Fisher Information peaking near item difficulty', () => {
      const a = 1.8
      const b = 0.0
      const c = 0.2

      const infoPeak = calculateItemInformation(0.0, a, b, c)
      const infoDistant = calculateItemInformation(2.5, a, b, c)

      expect(infoPeak).toBeGreaterThan(infoDistant)
      expect(infoPeak).toBeGreaterThan(0.5)
    })

    it('computes test information and standard error of measurement', () => {
      const items = CALIBRATED_QUESTION_BANKS.neuroscience_memory!
      const totalInfo = calculateTestInformation(0.0, items)
      const sem = calculateSEM(totalInfo)

      expect(totalInfo).toBeGreaterThan(1.0)
      expect(sem).toBeLessThan(1.0)
      expect(sem).toBeGreaterThan(0.1)
    })

    it('converts latent ability theta to accurate population percentile ranks', () => {
      expect(thetaToPercentileRank(0.0)).toBeCloseTo(50, 0)
      expect(thetaToPercentileRank(1.0)).toBeGreaterThanOrEqual(84)
      expect(thetaToPercentileRank(2.0)).toBeGreaterThanOrEqual(97)
      expect(thetaToPercentileRank(-1.0)).toBeLessThanOrEqual(16)
    })
  })

  describe('Bayesian Ability Estimation (EAP)', () => {
    const items = CALIBRATED_QUESTION_BANKS.distributed_consensus!

    it('increases estimated ability when answers are correct', () => {
      const administered = [
        { item: items[0]!, isCorrect: true },
        { item: items[1]!, isCorrect: true },
      ]
      const { theta, sem } = estimateAbilityEAP(administered)

      expect(theta).toBeGreaterThan(0.2)
      expect(sem).toBeLessThan(1.0)
    })

    it('decreases estimated ability when answers are incorrect', () => {
      const administered = [
        { item: items[0]!, isCorrect: false },
        { item: items[1]!, isCorrect: false },
      ]
      const { theta, sem } = estimateAbilityEAP(administered)

      expect(theta).toBeLessThan(-0.2)
      expect(sem).toBeLessThan(1.0)
    })
  })

  describe('Adaptive Item Selection (Maximum Fisher Information)', () => {
    it('selects the item maximizing information at current ability', () => {
      const pool = CALIBRATED_QUESTION_BANKS.neuroscience_memory!
      const administeredIds = new Set<string>()

      const nextItem = selectNextAdaptiveItem(0.1, pool, administeredIds)
      expect(nextItem).toBeDefined()
      expect(administeredIds.has(nextItem!.id)).toBe(false)
    })
  })

  describe('Sequential Probability Ratio Test (SPRT)', () => {
    it('evaluates mastery hypothesis against passing standard threshold', () => {
      const items = CALIBRATED_QUESTION_BANKS.cognitive_psychology!
      const passingStandard = 0.0

      const passingSeries = [
        { item: items[0]!, isCorrect: true },
        { item: items[1]!, isCorrect: true },
      ]
      const sprtPass = evaluateSPRT(passingSeries, passingStandard)
      expect(sprtPass.logLikelihoodRatio).toBeGreaterThan(0)

      const failingSeries = [
        { item: items[0]!, isCorrect: false },
        { item: items[1]!, isCorrect: false },
      ]
      const sprtFail = evaluateSPRT(failingSeries, passingStandard)
      expect(sprtFail.logLikelihoodRatio).toBeLessThan(0)
    })
  })

  describe('Successive Relearning Remediation Buffer', () => {
    it('tracks failed questions and advances criterion until mastery', () => {
      const buffer = new SuccessiveRelearningBuffer(2)
      const item = CALIBRATED_QUESTION_BANKS.neuroscience_memory![0]!

      buffer.addFailedItem(item, 2, 'Confused Dentate Gyrus with CA3')
      expect(buffer.getTotalCount()).toBe(1)
      expect(buffer.getPendingItems().length).toBe(1)

      // First successful retrieval
      buffer.recordRecallAttempt(item.id, true)
      expect(buffer.getPendingItems().length).toBe(1)

      // Second successful retrieval -> meets criterion of 2
      buffer.recordRecallAttempt(item.id, true)
      expect(buffer.getPendingItems().length).toBe(0)
      expect(buffer.getMasteredCount()).toBe(1)
    })
  })

  describe('AdaptiveExamSession State Machine', () => {
    const config: AdaptiveExamConfig = {
      id: 'exam-neuro-cat',
      title: 'Neuroscience CAT Certification',
      domain: 'Neurobiology of Memory',
      passingThetaStandard: 0.2,
      sprtConfidenceAlpha: 0.05,
      sprtConfidenceBeta: 0.05,
      minQuestions: 2,
      maxQuestions: 4,
      targetSem: 0.35,
      timeLimitSeconds: 600,
      successiveRelearningCriterion: 2,
    }

    it('orchestrates adaptive question delivery and computes diagnostic autopsy', () => {
      const pool = CALIBRATED_QUESTION_BANKS.neuroscience_memory!
      const session = new AdaptiveExamSession(config, pool)

      expect(session.getCurrentItem()).toBeDefined()
      expect(session.getAdministeredCount()).toBe(0)

      // Answer question 1 correctly
      const item1 = session.getCurrentItem()!
      const res1 = session.submitResponse(item1.correctOptionIndex, 8500)
      expect(res1.isCorrect).toBe(true)
      expect(session.getAdministeredCount()).toBe(1)

      // Answer question 2 incorrectly
      const item2 = session.getCurrentItem()!
      const wrongIndex = (item2.correctOptionIndex + 1) % 4
      session.submitResponse(wrongIndex, 12000)
      expect(session.getAdministeredCount()).toBe(2)

      const autopsy = session.generateDiagnosticAutopsy()
      expect(autopsy.scorePercent).toBe(50)
      expect(autopsy.bloomBreakdown).toBeDefined()
      expect(autopsy.missedItems.length).toBe(1)
      expect(autopsy.pedagogicalSummary.length).toBeGreaterThan(10)
    })
  })
})
