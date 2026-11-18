import { describe, expect, it } from 'vitest'
import {
  calculateAngularDisparityDeg,
  calculateBoundingDimensions,
  calculateCenterOfMass,
  calculateMentalRotationVelocity,
  calculateSpatialVisualizationMetrics,
  CANONICAL_SHEPARD_METZLER_SHAPES,
  checkCongruenceUnderSO3,
  createAxisAngleMatrix,
  createChiralEnantiomer,
  createEulerRotationMatrix,
  createIdentityMatrix,
  createReflectionMatrix,
  evaluatePiecemealKinematicPredictions,
  generateCubeGroupRotations,
  generateFSRSSpatialDeck,
  generateShepardMetzlerTrial,
  generateVoxelFaces,
  matrixTrace,
  MULTIDISCIPLINARY_SPATIAL_SCENARIOS,
  multiplyMatrices,
  multiplyMatrixVector,
  predictShepardMetzlerReactionTimeMs,
  projectIsometric,
  rotateShape,
  solveKinematicChain,
  transposeMatrix,
  type KinematicChainState,
  type RotationPerformanceAttempt,
} from '../src/spatial/spatial-rotation-engine'

describe('spatial-rotation-engine: Matrix & Vector Math (Euclidean & SO(3))', () => {
  it('creates identity matrix and preserves vectors under multiplication', () => {
    const identity = createIdentityMatrix()
    expect(identity).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ])
    const v = { x: 3.5, y: -2.1, z: 7.8 }
    const res = multiplyMatrixVector(identity, v)
    expect(res.x).toBeCloseTo(v.x)
    expect(res.y).toBeCloseTo(v.y)
    expect(res.z).toBeCloseTo(v.z)
  })

  it('correctly multiplies 3x3 matrices and computes trace', () => {
    const m1 = createEulerRotationMatrix(90, 0, 0)
    const m1T = transposeMatrix(m1)
    const product = multiplyMatrices(m1, m1T)
    const identity = createIdentityMatrix()

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(product[r][c]).toBeCloseTo(identity[r][c], 4)
      }
    }

    const trace = matrixTrace(identity)
    expect(trace).toBe(3)
  })

  it('generates Euler rotation matrices matching trigonometric expectations', () => {
    // 90 deg Yaw (around Y axis): maps (1, 0, 0) to (0, 0, -1)
    const yaw90 = createEulerRotationMatrix(0, 90, 0)
    const vX = { x: 1, y: 0, z: 0 }
    const rotated = multiplyMatrixVector(yaw90, vX)
    expect(rotated.x).toBeCloseTo(0, 4)
    expect(rotated.y).toBeCloseTo(0, 4)
    expect(rotated.z).toBeCloseTo(-1, 4)

    const axisMat = createAxisAngleMatrix({ x: 0, y: 1, z: 0 }, 90)
    expect(calculateAngularDisparityDeg(yaw90, axisMat)).toBeCloseTo(0, 2)
  })

  it('calculates angular disparity between rotations via geodesic SO(3) metric', () => {
    const id = createIdentityMatrix()
    const rot45 = createEulerRotationMatrix(0, 45, 0)
    const rot90 = createEulerRotationMatrix(0, 90, 0)
    const rot180 = createEulerRotationMatrix(0, 180, 0)

    const disp0 = calculateAngularDisparityDeg(id, id)
    const disp45 = calculateAngularDisparityDeg(id, rot45)
    const disp90 = calculateAngularDisparityDeg(id, rot90)
    const disp180 = calculateAngularDisparityDeg(id, rot180)

    expect(disp0).toBeCloseTo(0, 2)
    expect(disp45).toBeCloseTo(45, 2)
    expect(disp90).toBeCloseTo(90, 2)
    expect(disp180).toBeCloseTo(180, 2)
  })

  it('inverts coordinates across mirror plane using reflection matrices', () => {
    const reflYZ = createReflectionMatrix('yz')
    const v = { x: 5, y: 3, z: -2 }
    const mirrored = multiplyMatrixVector(reflYZ, v)
    expect(mirrored.x).toBe(-5)
    expect(mirrored.y).toBe(3)
    expect(mirrored.z).toBe(-2)
  })
})

describe('spatial-rotation-engine: Polycube Geometry & SO(3) Invariance', () => {
  it('accurately calculates center of mass and bounding dimensions', () => {
    const voxels = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
    ]
    const com = calculateCenterOfMass(voxels)
    expect(com.x).toBe(1.25)
    expect(com.y).toBe(0.25)
    expect(com.z).toBe(0)

    const bounds = calculateBoundingDimensions(voxels)
    expect(bounds.width).toBe(3)
    expect(bounds.height).toBe(2)
    expect(bounds.depth).toBe(1)
  })

  it('rotates polycubes while preserving voxel topology', () => {
    const shape = CANONICAL_SHEPARD_METZLER_SHAPES[0]
    const rotated = rotateShape(shape, { pitch: 0, yaw: 90, roll: 0 })

    expect(rotated.voxels.length).toBe(shape.voxels.length)
    expect(rotated.boundingDimensions).toBeDefined()
  })

  it('generates true non-superimposable chiral enantiomers', () => {
    const shape = CANONICAL_SHEPARD_METZLER_SHAPES[0]
    const enantiomer = createChiralEnantiomer(shape)

    expect(enantiomer.id).toContain('enantiomer')
    expect(enantiomer.isChiral).toBe(true)

    // Check SO(3) congruence: true enantiomer should NOT be congruent under any cube rotation
    const { isCongruent } = checkCongruenceUnderSO3(shape, enantiomer)
    expect(isCongruent).toBe(false)
  })

  it('identifies 24 rotational symmetries of the cube group SO(3)', () => {
    const group = generateCubeGroupRotations()
    expect(group.length).toBe(24)

    // Every matrix in the group must have det = +1 and orthogonal columns
    group.forEach((m) => {
      const prod = multiplyMatrices(m, transposeMatrix(m))
      const id = createIdentityMatrix()
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          expect(prod[r][c]).toBeCloseTo(id[r][c], 4)
        }
      }
    })
  })

  it('detects congruence under SO(3) rotations for identical or rotated shapes', () => {
    const shape = CANONICAL_SHEPARD_METZLER_SHAPES[0]
    const rotated90 = rotateShape(shape, { pitch: 0, yaw: 90, roll: 0 })
    const { isCongruent } = checkCongruenceUnderSO3(shape, rotated90)
    expect(isCongruent).toBe(true)
  })

  it('generates 2D isometric faces sorted by depth (painter algorithm)', () => {
    const isoPt = projectIsometric({ x: 1, y: 2, z: 3 }, 32)
    expect(isoPt.depth).toBe(6)

    const shape = CANONICAL_SHEPARD_METZLER_SHAPES[0]
    const faces = generateVoxelFaces(shape.voxels, { pitch: 15, yaw: 45, roll: 0 }, 32)
    expect(faces.length).toBeGreaterThan(0)

    // Ensure sorted by depth ascending
    for (let i = 1; i < faces.length; i++) {
      expect(faces[i].depth).toBeGreaterThanOrEqual(faces[i - 1].depth)
    }
  })
})

describe('spatial-rotation-engine: Shepard & Metzler (1971) Response Latency Model', () => {
  it('predicts linear reaction time: RT = alpha + beta * disparity', () => {
    const rt0 = predictShepardMetzlerReactionTimeMs(0)
    const rt60 = predictShepardMetzlerReactionTimeMs(60)
    const rt120 = predictShepardMetzlerReactionTimeMs(120)
    const rt180 = predictShepardMetzlerReactionTimeMs(180)

    expect(rt0).toBe(950)
    expect(rt60).toBe(950 + Math.round(4.5 * 60)) // 1220 ms
    expect(rt120).toBe(950 + Math.round(4.5 * 120)) // 1490 ms
    expect(rt180).toBe(950 + Math.round(4.5 * 180)) // 1760 ms
  })

  it('computes mental rotation velocity (deg/sec)', () => {
    // 90 deg rotated in 1400 ms (active = 450 ms) -> ~200 deg/sec
    const velocity = calculateMentalRotationVelocity(90, 1400, 950)
    expect(velocity).toBe(200)

    const zeroVel = calculateMentalRotationVelocity(0, 1000)
    expect(zeroVel).toBe(0)
  })

  it('generates valid Shepard-Metzler trials with expected reaction times', () => {
    const trialCongruent = generateShepardMetzlerTrial('sm_canonical_alpha', 60, false)
    expect(trialCongruent.isCongruent).toBe(true)
    expect(trialCongruent.angularDisparityDeg).toBeGreaterThan(0)
    expect(trialCongruent.expectedReactionTimeMs).toBeGreaterThan(950)

    const trialEnantiomer = generateShepardMetzlerTrial('sm_canonical_alpha', 60, true)
    expect(trialEnantiomer.isCongruent).toBe(false)
  })
})

describe('spatial-rotation-engine: Mary Hegarty (2004) Kinematic Simulation', () => {
  it('solves simple external meshed gear train reversing directions at each step', () => {
    const chain: KinematicChainState = {
      chainName: 'Three-Gear Train',
      nodes: {
        g1: {
          id: 'g1',
          name: 'Gear 1',
          type: 'gear',
          pitchRadius: 20,
          teethCount: 20,
          position: { x: 0, y: 0 },
          angularVelocityRpm: 100,
          direction: 'clockwise',
        },
        g2: {
          id: 'g2',
          name: 'Gear 2',
          type: 'gear',
          pitchRadius: 10,
          teethCount: 10,
          position: { x: 30, y: 0 },
          drivenBy: 'g1',
          couplingType: 'meshed_external',
          angularVelocityRpm: 0,
          direction: 'stationary',
        },
        g3: {
          id: 'g3',
          name: 'Gear 3',
          type: 'gear',
          pitchRadius: 40,
          teethCount: 40,
          position: { x: 80, y: 0 },
          drivenBy: 'g2',
          couplingType: 'meshed_external',
          angularVelocityRpm: 0,
          direction: 'stationary',
        },
      },
      inputNodeId: 'g1',
      inputRpm: 100,
      inputDirection: 'clockwise',
      stepEvaluationSequence: [],
      totalDirectionReversals: 0,
      cognitiveLoadScore: 0,
    }

    const solved = solveKinematicChain(chain)

    expect(solved.nodes.g1.direction).toBe('clockwise')
    expect(solved.nodes.g1.angularVelocityRpm).toBe(100)

    // g2 meshed external -> inverts to counter_clockwise; 20/10 ratio -> 200 rpm
    expect(solved.nodes.g2.direction).toBe('counter_clockwise')
    expect(solved.nodes.g2.angularVelocityRpm).toBe(200)

    // g3 meshed external to g2 -> inverts back to clockwise; 10/40 ratio -> 50 rpm
    expect(solved.nodes.g3.direction).toBe('clockwise')
    expect(solved.nodes.g3.angularVelocityRpm).toBe(50)

    expect(solved.totalDirectionReversals).toBe(2)
    expect(solved.stepEvaluationSequence).toEqual(['g1', 'g2', 'g3'])
  })

  it('evaluates piecemeal predictions and flags cumulative drift', () => {
    const chain: KinematicChainState = {
      chainName: 'Two-Gear Train',
      nodes: {
        a: {
          id: 'a',
          name: 'A',
          type: 'gear',
          pitchRadius: 10,
          position: { x: 0, y: 0 },
          angularVelocityRpm: 50,
          direction: 'clockwise',
        },
        b: {
          id: 'b',
          name: 'B',
          type: 'gear',
          pitchRadius: 10,
          position: { x: 20, y: 0 },
          drivenBy: 'a',
          couplingType: 'meshed_external',
          angularVelocityRpm: 0,
          direction: 'stationary',
        },
      },
      inputNodeId: 'a',
      inputRpm: 50,
      inputDirection: 'clockwise',
      stepEvaluationSequence: [],
      totalDirectionReversals: 0,
      cognitiveLoadScore: 0,
    }
    const solved = solveKinematicChain(chain)

    // Perfect predictions
    const evalPerfect = evaluatePiecemealKinematicPredictions(solved, {
      a: { direction: 'clockwise' },
      b: { direction: 'counter_clockwise' },
    })
    expect(evalPerfect.stepCoherence).toBe(1.0)
    expect(evalPerfect.errorNodes.length).toBe(0)

    // Erroneous prediction on node B
    const evalError = evaluatePiecemealKinematicPredictions(solved, {
      a: { direction: 'clockwise' },
      b: { direction: 'clockwise' }, // Wrong!
    })
    expect(evalError.stepCoherence).toBe(0.5)
    expect(evalError.errorNodes).toContain('b')
  })
})

describe('spatial-rotation-engine: Multidisciplinary Scenarios Library', () => {
  it('supplies 5 calibrated STEM scenarios across domains', () => {
    expect(MULTIDISCIPLINARY_SPATIAL_SCENARIOS.length).toBe(5)
    const domains = MULTIDISCIPLINARY_SPATIAL_SCENARIOS.map((s) => s.domain)
    expect(domains).toContain('stereochemistry')
    expect(domains).toContain('mechanical_kinematics')
    expect(domains).toContain('structural_geology')
    expect(domains).toContain('neuroanatomy')
    expect(domains).toContain('robotics_frames')
  })

  it('validates stereochemistry CIP scenario questions and geometry', () => {
    const scenario = MULTIDISCIPLINARY_SPATIAL_SCENARIOS.find(
      (s) => s.domain === 'stereochemistry',
    )!
    expect(scenario.primaryPolycube?.isChiral).toBe(true)
    expect(scenario.keyQuestions.length).toBeGreaterThan(0)
    const q1 = scenario.keyQuestions[0]
    expect(q1.options[q1.correctOptionIndex]).toContain('(R configuration)')
  })
})

describe('spatial-rotation-engine: Assessment & FSRS-6 Flashcards', () => {
  it('calculates spatial visualization metrics and evaluates skill tier', () => {
    const attempts: RotationPerformanceAttempt[] = [
      {
        trialId: 't1',
        userResponseCongruent: true,
        isCorrect: true,
        reactionTimeMs: 1300,
        angularDisparityDeg: 60,
      },
      {
        trialId: 't2',
        userResponseCongruent: false,
        isCorrect: true,
        reactionTimeMs: 1550,
        angularDisparityDeg: 120,
      },
      {
        trialId: 't3',
        userResponseCongruent: true,
        isCorrect: true,
        reactionTimeMs: 1750,
        angularDisparityDeg: 150,
      },
    ]

    const metrics = calculateSpatialVisualizationMetrics(attempts, 0.9, 0.1)
    expect(metrics.chiralityDiscriminationAccuracy).toBe(1.0)
    expect(metrics.mentalRotationVelocityDegPerSec).toBeGreaterThan(100)
    expect(metrics.overallSpatialVisualizationIndex).toBeGreaterThan(0.7)
    expect(['holistic_spatial_synthesizer', 'master_spatial_modeler']).toContain(metrics.skillTier)
    expect(metrics.recommendations.length).toBeGreaterThan(0)
  })

  it('generates spaced repetition flashcards with FSRS-6 initial parameters', () => {
    const deck = generateFSRSSpatialDeck()
    expect(deck.length).toBeGreaterThanOrEqual(5)
    deck.forEach((card) => {
      expect(card.initialStabilityDays).toBeGreaterThan(0)
      expect(card.initialDifficulty).toBeGreaterThan(0)
      expect(card.options.length).toBeGreaterThanOrEqual(2)
      expect(card.correctAnswerIndex).toBeLessThan(card.options.length)
    })
  })
})
