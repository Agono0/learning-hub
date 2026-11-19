import { describe, expect, it } from 'vitest'
import {
  calibrateCategorizationFsrsParameters,
  generateEnhancedCategorizationDeck,
} from '../src/categorization/categorization-fsrs'

describe('FSRS-6 parameter calibration for categorization cards', () => {
  it('assigns high stability and low difficulty to prototype abstraction cards', () => {
    const params = calibrateCategorizationFsrsParameters({
      cardType: 'prototype_abstraction',
      typicality: 7.0,
      criBaseline: 80,
    })
    expect(params.stability).toBeGreaterThanOrEqual(9.0)
    expect(params.difficulty).toBeLessThanOrEqual(3.5)
  })

  it('assigns lower stability and higher difficulty to exemplar exception cards', () => {
    const params = calibrateCategorizationFsrsParameters({
      cardType: 'exemplar_exception',
      isException: true,
      normalizedFuzziness: 0.8,
      criBaseline: 40,
    })
    expect(params.stability).toBeLessThanOrEqual(4.5)
    expect(params.difficulty).toBeGreaterThanOrEqual(7.0)
  })

  it('scales boundary fuzziness card difficulty by normalized fuzziness', () => {
    const lowFuzz = calibrateCategorizationFsrsParameters({
      cardType: 'boundary_fuzziness',
      normalizedFuzziness: 0.1,
    })
    const highFuzz = calibrateCategorizationFsrsParameters({
      cardType: 'boundary_fuzziness',
      normalizedFuzziness: 0.9,
    })
    expect(highFuzz.difficulty).toBeGreaterThan(lowFuzz.difficulty)
  })
})

describe('enhanced 6-card categorization deck synthesis', () => {
  it('synthesizes complete 6-card deck across all research dimensions', () => {
    const deck = generateEnhancedCategorizationDeck({
      setId: 'proto-bird-typicality',
      setTitle: 'Rosch (1975) Bird Typicality',
      criBaseline: 75,
      fuzzinessIndex: 0.35,
      borderlineStimuli: ['bat', 'penguin'],
      attendedDimension: 0,
      dominantSystem: 'dual_system',
    })

    expect(deck.cardCount).toBe(6)
    expect(deck.cards).toHaveLength(6)

    const cardTypes = deck.cards.map((c) => c.cardType)
    expect(cardTypes).toContain('prototype_abstraction')
    expect(cardTypes).toContain('exemplar_exception')
    expect(cardTypes).toContain('typicality_gradient')
    expect(cardTypes).toContain('attention_strategy')
    expect(cardTypes).toContain('boundary_fuzziness')
    expect(cardTypes).toContain('dual_system_arbitration')

    expect(deck.fsrsSummary.meanStabilityDays).toBeGreaterThan(0)
    expect(deck.fsrsSummary.meanDifficulty).toBeGreaterThan(0)
    expect(deck.fsrsSummary.hardestCardId).toBeTruthy()
  })
})
