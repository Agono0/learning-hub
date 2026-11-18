/**
 * @file packages/core/tests/inquiry-engine.test.ts
 * @description Unit tests for Dual-Space Scientific Discovery & Inquiry Engine
 * (Klahr & Dunbar 1988 SDDS, Chen & Klahr 1999 VOTAT, Chinn & Brewer 1993).
 */

import { describe, expect, it } from 'vitest'
import {
  AnomalousDataReactionEnum,
  InquiryLabSchema,
  InquiryMasteryBandEnum,
  calculateInquiryMetrics,
  generateInquiryFSRSCards,
  getCanonicalInquiryLabs,
  getInquiryLabById,
  runInquiryTrial,
} from '../src/inquiry/inquiry-engine'

describe('Dual-Space Scientific Discovery & Inquiry Engine (Klahr & Dunbar 1988)', () => {
  describe('Canonical Inquiry Laboratories Validation', () => {
    it('validates all 5 canonical inquiry labs against InquiryLabSchema', () => {
      const labs = getCanonicalInquiryLabs()
      expect(labs.length).toBe(5)

      for (const lab of labs) {
        const parsed = InquiryLabSchema.safeParse(lab)
        expect(parsed.success).toBe(true)
        expect(lab.independentVariables.length).toBeGreaterThanOrEqual(3)
        expect(lab.dependentOutputs.length).toBeGreaterThanOrEqual(1)
        expect(lab.anomalousScenarios.length).toBeGreaterThanOrEqual(1)
        expect(lab.seedCards.length).toBeGreaterThanOrEqual(3)
      }
    })

    it('retrieves lab by ID and returns undefined for unknown ID', () => {
      const pendulum = getInquiryLabById('lab-pendulum-period')
      expect(pendulum).toBeDefined()
      expect(pendulum?.title).toBe('Galilean Pendulum Dynamics')

      const unknown = getInquiryLabById('lab-unknown-fictitious')
      expect(unknown).toBeUndefined()
    })
  })

  describe('Laboratory Physics & Systems Simulation Kernel', () => {
    it('simulates Galilean pendulum: period increases with length but is invariant to mass', () => {
      const lab = getInquiryLabById('lab-pendulum-period')!

      // Trial 1: baseline (L = 1.0, m = 0.2)
      const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
      expect(t1.observedOutputs.period).toBeCloseTo(2.006, 1)

      // Trial 2: vary length to 2.0 (L = 2.0, m = 0.2) -> VOTAT compliant
      const t2 = runInquiryTrial(
        lab,
        1,
        { length: 2.0, mass: 0.2, angle: 15, gravity: 9.81 },
        t1.variableSettings,
      )
      expect(t2.votatCompliantWithPrevious).toBe(true)
      expect(t2.variedVariableIds).toEqual(['length'])
      expect(t2.observedOutputs.period).toBeGreaterThan(t1.observedOutputs.period!)

      // Trial 3: vary mass only (L = 2.0, m = 0.8) -> Period must remain identical!
      const t3 = runInquiryTrial(
        lab,
        2,
        { length: 2.0, mass: 0.8, angle: 15, gravity: 9.81 },
        t2.variableSettings,
      )
      expect(t3.votatCompliantWithPrevious).toBe(true)
      expect(t3.variedVariableIds).toEqual(['mass'])
      expect(t3.observedOutputs.period).toBe(t2.observedOutputs.period)
    })

    it('detects VOTAT confounding when multiple variables are altered simultaneously', () => {
      const lab = getInquiryLabById('lab-pendulum-period')!
      const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })

      // Confounded: changed both length and angle
      const t2 = runInquiryTrial(
        lab,
        1,
        { length: 1.5, mass: 0.2, angle: 45, gravity: 9.81 },
        t1.variableSettings,
      )
      expect(t2.votatCompliantWithPrevious).toBe(false)
      expect(t2.confoundingVariableIds).toContain('length')
      expect(t2.confoundingVariableIds).toContain('angle')
    })

    it('simulates enzyme kinetics: reflects thermal denaturation cliff above 45°C', () => {
      const lab = getInquiryLabById('lab-enzyme-kinetics')!
      const tOpt = runInquiryTrial(lab, 0, {
        substrate: 20,
        temperature: 37,
        ph: 7.4,
        inhibitor: 0,
      })
      const tHigh = runInquiryTrial(lab, 1, {
        substrate: 20,
        temperature: 65,
        ph: 7.4,
        inhibitor: 0,
      })

      expect(tOpt.observedOutputs.velocity).toBeGreaterThan(50)
      expect(tHigh.observedOutputs.velocity).toBeLessThan(tOpt.observedOutputs.velocity!)
      expect(tHigh.observedOutputs.fractionActive).toBeLessThan(50)
    })

    it('simulates Faraday-Lenz induction: stationary magnet produces zero EMF', () => {
      const lab = getInquiryLabById('lab-electromagnetic-induction')!
      const moving = runInquiryTrial(lab, 0, {
        velocity: 2.0,
        turns: 200,
        fieldStrength: 1.0,
        coreRelativePermeability: 1,
      })
      const stationary = runInquiryTrial(lab, 1, {
        velocity: 0.0,
        turns: 200,
        fieldStrength: 1.0,
        coreRelativePermeability: 1,
      })

      expect(moving.observedOutputs.peakEmf).toBeGreaterThan(0)
      expect(stationary.observedOutputs.peakEmf).toBe(0)
      expect(stationary.observedOutputs.fluxRate).toBe(0)
    })
  })

  describe('Quantitative Inquiry Metrics (VOTAT & Chinn & Brewer)', () => {
    it('computes Master Empirical Scientist for rigorous VOTAT and theory revision', () => {
      const lab = getInquiryLabById('lab-pendulum-period')!
      const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
      const t2 = runInquiryTrial(
        lab,
        1,
        { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
        t1.variableSettings,
      )
      const t3 = runInquiryTrial(
        lab,
        2,
        { length: 1.5, mass: 0.6, angle: 15, gravity: 9.81 },
        t2.variableSettings,
      )
      const t4 = runInquiryTrial(
        lab,
        3,
        { length: 1.5, mass: 0.6, angle: 30, gravity: 9.81 },
        t3.variableSettings,
      )

      const metrics = calculateInquiryMetrics({
        lab,
        trials: [t1, t2, t3, t4],
        anomalousSubmissions: [
          {
            anomalyId: 'anomaly-pendulum-mass-invariance',
            reaction: 'theory_revision',
            articulatedExplanation:
              'Inertial mass cancels gravitational mass in Newton second law.',
          },
        ],
        falsificationTrialCount: 2,
        finalHypothesisCapturesInvariant: true,
      })

      expect(metrics.votatRigorIndex).toBe(1.0)
      expect(metrics.anomalousDataResolutionIndex).toBe(100)
      expect(metrics.scientificDiscoveryIndex).toBeGreaterThanOrEqual(85)
      expect(metrics.inquiryMasteryBand).toBe('Master Empirical Scientist')
      expect(metrics.sddsSearchEfficiencyRatio).toBeGreaterThanOrEqual(0.8)
    })

    it('computes Unsystematic Explorer when confounders are frequent and anomalies ignored', () => {
      const lab = getInquiryLabById('lab-pendulum-period')!
      const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
      const t2 = runInquiryTrial(
        lab,
        1,
        { length: 1.5, mass: 0.6, angle: 45, gravity: 9.81 },
        t1.variableSettings,
      ) // 3 variables changed
      const t3 = runInquiryTrial(
        lab,
        2,
        { length: 0.5, mass: 0.9, angle: 10, gravity: 9.81 },
        t2.variableSettings,
      ) // 3 variables changed

      const metrics = calculateInquiryMetrics({
        lab,
        trials: [t1, t2, t3],
        anomalousSubmissions: [
          {
            anomalyId: 'anomaly-pendulum-mass-invariance',
            reaction: 'ignore',
            articulatedExplanation: 'The data looked strange, so I skipped it.',
          },
        ],
        falsificationTrialCount: 0,
        finalHypothesisCapturesInvariant: false,
      })

      expect(metrics.votatRigorIndex).toBe(0.0)
      expect(metrics.anomalousDataResolutionIndex).toBe(0)
      expect(metrics.scientificDiscoveryIndex).toBeLessThan(50)
      expect(metrics.inquiryMasteryBand).toBe('Unsystematic Explorer')
    })
  })

  describe('Calibrated FSRS-6 Review Flashcard Scaling', () => {
    it('scales initial stability and difficulty based on scientific discovery index', () => {
      const lab = getInquiryLabById('lab-pendulum-period')!
      const highMetrics = calculateInquiryMetrics({
        lab,
        trials: [
          runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 }),
          runInquiryTrial(
            lab,
            1,
            { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
            { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 },
          ),
        ],
        anomalousSubmissions: [
          { anomalyId: 'a1', reaction: 'theory_revision', articulatedExplanation: 'Revised model' },
        ],
        falsificationTrialCount: 1,
        finalHypothesisCapturesInvariant: true,
      })

      const cards = generateInquiryFSRSCards(lab, highMetrics)
      expect(cards.length).toBe(3)
      for (const card of cards) {
        expect(card.initialStabilityDays).toBeGreaterThanOrEqual(4.0)
        expect(card.initialDifficulty).toBeLessThanOrEqual(7.0)
      }
    })
  })

  describe('Zod Enum Integrity', () => {
    it('verifies all AnomalousDataReactionEnum values', () => {
      const values = AnomalousDataReactionEnum.options
      expect(values).toContain('ignore')
      expect(values).toContain('reject')
      expect(values).toContain('exclude')
      expect(values).toContain('hold_in_abeyance')
      expect(values).toContain('reinterpretation')
      expect(values).toContain('peripheral_change')
      expect(values).toContain('theory_revision')
    })

    it('verifies all InquiryMasteryBandEnum values', () => {
      const bands = InquiryMasteryBandEnum.options
      expect(bands).toContain('Master Empirical Scientist')
      expect(bands).toContain('Methodical Investigator')
      expect(bands).toContain('Emerging Experimenter')
      expect(bands).toContain('Unsystematic Explorer')
    })
  })
})
