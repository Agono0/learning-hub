/**
 * @file spatial-rotation-engine.ts
 * @description Spatial Cognition, Mental Rotation & Kinematic Simulation Engine
 *
 * Grounded in foundational cognitive science and spatial psychology research:
 * 1. Roger N. Shepard & Jacqueline Metzler (1971) - "Mental Rotation of Three-Dimensional Objects",
 *    Science 171(3972): 701-703. Demonstrates that reaction time to determine spatial congruence
 *    is an exact linear function of angular disparity between 3D objects (RT = α + β·θ).
 * 2. Mary Hegarty (2004, 2010) - "Mechanical Reasoning by Mental Simulation", Trends in Cognitive
 *    Sciences 8(6): 280-285. Distinguishes piecemeal mental animation from holistic mental simulation
 *    in kinematic mechanical assemblies (gear trains, pulley systems, levers).
 * 3. Barbara Tversky (1993, 2005) - "Spatial Schemas and Spatial Mental Models", Functional Features
 *    of Spatial Cognition. Identifies alignment heuristics, rotation heuristics to cardinal axes,
 *    and egocentric vs allocentric reference frame transformations.
 * 4. David H. Uttal et al. (2013) - "The Malleability of Spatial Skills: A Meta-Analysis of Training
 *    Studies", Psychological Bulletin 139(2): 352-402. Confirms that systematic mental rotation
 *    practice transfers robustly to STEM domains (stereochemistry, geology, neuroanatomy, robotics).
 * 5. Free Spaced Repetition Scheduler (FSRS-6) integration for 3D model-checking and kinematic flashcards.
 *
 * @module @learning-hub/core/spatial
 */

import { clamp } from '../math'

// Re-exported so `@learning-hub/core/spatial` keeps exposing `clamp` while the
// implementation lives in the canonical math module (TD-06).
export { clamp }

// TD-05: scenario corpora (stimuli + scenario library) are CONTENT, not logic —
// they live in ./content.ts so engine diffs stay about algorithms. The engine
// still consumes them and re-exports them, so every existing import path
// (`@learning-hub/core/spatial` barrel does `export * from` this file) works.
import { CANONICAL_SHEPARD_METZLER_SHAPES, MULTIDISCIPLINARY_SPATIAL_SCENARIOS } from './content'

export { CANONICAL_SHEPARD_METZLER_SHAPES, MULTIDISCIPLINARY_SPATIAL_SCENARIOS }

export interface Voxel3D {
  x: number
  y: number
  z: number
  color?: string
  id?: string
}

export type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
]

export interface SpatialVector3D {
  x: number
  y: number
  z: number
}
type Vector3D = SpatialVector3D

export interface Quaternion {
  w: number
  x: number
  y: number
  z: number
}

export interface RotationEuler {
  pitch: number // Rotation around X-axis (degrees)
  yaw: number // Rotation around Y-axis (degrees)
  roll: number // Rotation around Z-axis (degrees)
}

export interface IsometricPoint {
  x: number
  y: number
  depth: number
}

export interface IsoFace {
  vertices: IsometricPoint[]
  normal: Vector3D
  color: string
  shade: number
  depth: number
  voxelIndex: number
}

export type PolycubeCategory =
  | 'shepard_metzler_canonical'
  | 'organic_molecule'
  | 'mechanical_assembly'
  | 'geological_block'
  | 'anatomical_structure'
  | 'robotics_frame'

export interface PolycubeShape {
  id: string
  name: string
  description: string
  category: PolycubeCategory
  voxels: Voxel3D[]
  centerOfMass: Vector3D
  boundingDimensions: { width: number; height: number; depth: number }
  isChiral: boolean
}

export interface ShepardMetzlerTrial {
  trialId: string
  baseShape: PolycubeShape
  rotatedShape: PolycubeShape
  angularDisparityDeg: number
  isCongruent: boolean
  rotationEuler: RotationEuler
  rotationAxis: Vector3D
  expectedReactionTimeMs: number
}

export interface RotationPerformanceAttempt {
  trialId: string
  userResponseCongruent: boolean
  isCorrect: boolean
  reactionTimeMs: number
  angularDisparityDeg: number
  timestamp?: number
}

export type KinematicNodeType = 'gear' | 'pulley' | 'lever' | 'cam' | 'piston'

export type KinematicCouplingType =
  'meshed_external' | 'meshed_internal' | 'belt_open' | 'belt_crossed' | 'rigid_shaft'

export type KinematicRotationDirection = 'clockwise' | 'counter_clockwise' | 'stationary'

export interface KinematicNode {
  id: string
  name: string
  type: KinematicNodeType
  pitchRadius: number
  teethCount?: number
  position: { x: number; y: number }
  drivenBy?: string
  couplingType?: KinematicCouplingType
  angularVelocityRpm: number
  direction: KinematicRotationDirection
}

export interface KinematicChainState {
  chainName: string
  nodes: Record<string, KinematicNode>
  inputNodeId: string
  inputRpm: number
  inputDirection: KinematicRotationDirection
  stepEvaluationSequence: string[]
  totalDirectionReversals: number
  cognitiveLoadScore: number
}

export type SpatialScenarioDomain =
  | 'stereochemistry'
  | 'mechanical_kinematics'
  | 'structural_geology'
  | 'neuroanatomy'
  | 'robotics_frames'

export interface SpatialScenarioQuestion {
  id: string
  prompt: string
  options: string[]
  correctOptionIndex: number
  rationale: string
  cognitiveSkillTested:
    'mental_rotation' | 'chirality_discrimination' | 'kinematic_animation' | 'frame_switching'
}

export interface SpatialScenario {
  id: string
  domain: SpatialScenarioDomain
  title: string
  subtitle: string
  scientificBackground: string
  primaryPolycube?: PolycubeShape
  kinematicChain?: KinematicChainState
  canonicalReferenceFrame: string
  keyQuestions: SpatialScenarioQuestion[]
  learningObjectives: string[]
}

export type SpatialSkillTier =
  | 'piecemeal_2d_rotator'
  | 'constrained_3d_animator'
  | 'holistic_spatial_synthesizer'
  | 'master_spatial_modeler'

export interface SpatialVisualizationMetrics {
  mentalRotationVelocityDegPerSec: number
  chiralityDiscriminationAccuracy: number
  kinematicStepCoherence: number
  spatialDisparityToleranceDeg: number
  alignmentBiasFactor: number
  overallSpatialVisualizationIndex: number
  skillTier: SpatialSkillTier
  recommendations: string[]
}

export interface FSRSSpatialFlashcard {
  id: string
  scenarioDomain: SpatialScenarioDomain
  prompt: string
  visualRepresentationType:
    'polycube_pair' | 'kinematic_diagram' | 'stereocenter_cip' | 'mri_cross_section'
  disparityDeg: number
  question: string
  options: string[]
  correctAnswerIndex: number
  explanation: string
  initialStabilityDays: number
  initialDifficulty: number
}

// ============================================================================
// 1. Vector & Matrix Math Operations (3D Euclidean Space & Rotations)
// ============================================================================

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function createIdentityMatrix(): Matrix3x3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
}

export function multiplyMatrices(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  const result: Matrix3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      result[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]
    }
  }
  return result
}

export function multiplyMatrixVector(m: Matrix3x3, v: Vector3D): Vector3D {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  }
}

export function transposeMatrix(m: Matrix3x3): Matrix3x3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ]
}

export function matrixTrace(m: Matrix3x3): number {
  return m[0][0] + m[1][1] + m[2][2]
}

/**
 * Creates 3D rotation matrix from Euler angles (Pitch: X, Yaw: Y, Roll: Z)
 * Uses standard aerospace Tait-Bryan intrinsic sequence: R = Rz(roll) * Ry(yaw) * Rx(pitch)
 */
export function createEulerRotationMatrix(
  pitchDeg: number,
  yawDeg: number,
  rollDeg: number,
): Matrix3x3 {
  const p = toRadians(pitchDeg)
  const y = toRadians(yawDeg)
  const r = toRadians(rollDeg)

  const cp = Math.cos(p)
  const sp = Math.sin(p)
  const cy = Math.cos(y)
  const sy = Math.sin(y)
  const cr = Math.cos(r)
  const sr = Math.sin(r)

  // Rx(pitch)
  const rx: Matrix3x3 = [
    [1, 0, 0],
    [0, cp, -sp],
    [0, sp, cp],
  ]

  // Ry(yaw)
  const ry: Matrix3x3 = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ]

  // Rz(roll)
  const rz: Matrix3x3 = [
    [cr, -sr, 0],
    [sr, cr, 0],
    [0, 0, 1],
  ]

  return multiplyMatrices(rz, multiplyMatrices(ry, rx))
}

/**
 * Creates a rotation matrix around an arbitrary unit axis by angle theta
 * Rodrigues' rotation formula in matrix form
 */
export function createAxisAngleMatrix(axis: Vector3D, angleDeg: number): Matrix3x3 {
  const theta = toRadians(angleDeg)
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const t = 1 - c

  const length = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z)
  const u =
    length > 0.0001
      ? { x: axis.x / length, y: axis.y / length, z: axis.z / length }
      : { x: 0, y: 1, z: 0 }

  return [
    [t * u.x * u.x + c, t * u.x * u.y - s * u.z, t * u.x * u.z + s * u.y],
    [t * u.x * u.y + s * u.z, t * u.y * u.y + c, t * u.y * u.z - s * u.x],
    [t * u.x * u.z - s * u.y, t * u.y * u.z + s * u.x, t * u.z * u.z + c],
  ]
}

/**
 * Calculates the exact geodesic angular distance (angular disparity) between two 3D rotations
 * in degrees: θ = arccos((Tr(R1^T * R2) - 1) / 2)
 */
export function calculateAngularDisparityDeg(r1: Matrix3x3, r2: Matrix3x3): number {
  const r1T = transposeMatrix(r1)
  const diff = multiplyMatrices(r1T, r2)
  const trace = matrixTrace(diff)
  const cosTheta = clamp((trace - 1) / 2, -1, 1)
  return toDegrees(Math.acos(cosTheta))
}

/**
 * Creates a chiral reflection matrix across the selected plane
 */
export function createReflectionMatrix(plane: 'yz' | 'xz' | 'xy'): Matrix3x3 {
  switch (plane) {
    case 'yz':
      return [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
    case 'xz':
      return [
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
      ]
    case 'xy':
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
      ]
  }
}

/**
 * Normalizes center of mass of a collection of 3D voxels
 */
export function calculateCenterOfMass(voxels: Voxel3D[]): Vector3D {
  if (voxels.length === 0) return { x: 0, y: 0, z: 0 }
  const sum = voxels.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }), {
    x: 0,
    y: 0,
    z: 0,
  })
  return {
    x: sum.x / voxels.length,
    y: sum.y / voxels.length,
    z: sum.z / voxels.length,
  }
}

/**
 * Calculates bounding dimensions of a voxel group
 */
export function calculateBoundingDimensions(voxels: Voxel3D[]): {
  width: number
  height: number
  depth: number
} {
  if (voxels.length === 0) return { width: 0, height: 0, depth: 0 }
  let minX = Infinity,
    maxX = -Infinity
  let minY = Infinity,
    maxY = -Infinity
  let minZ = Infinity,
    maxZ = -Infinity

  for (const v of voxels) {
    if (v.x < minX) minX = v.x
    if (v.x > maxX) maxX = v.x
    if (v.y < minY) minY = v.y
    if (v.y > maxY) maxY = v.y
    if (v.z < minZ) minZ = v.z
    if (v.z > maxZ) maxZ = v.z
  }

  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    depth: maxZ - minZ + 1,
  }
}

/**
 * Transforms a polycube shape by a given 3x3 matrix around its center of mass
 */
export function transformShape(shape: PolycubeShape, matrix: Matrix3x3): PolycubeShape {
  const com = shape.centerOfMass
  const transformedVoxels: Voxel3D[] = shape.voxels.map((v) => {
    // translate to COM
    const relative = { x: v.x - com.x, y: v.y - com.y, z: v.z - com.z }
    const rotated = multiplyMatrixVector(matrix, relative)
    return {
      x: rotated.x + com.x,
      y: rotated.y + com.y,
      z: rotated.z + com.z,
      color: v.color,
      id: v.id,
    }
  })

  return {
    ...shape,
    voxels: transformedVoxels,
    centerOfMass: calculateCenterOfMass(transformedVoxels),
    boundingDimensions: calculateBoundingDimensions(transformedVoxels),
  }
}

/**
 * Rotates a shape using Euler angles
 */
export function rotateShape(shape: PolycubeShape, euler: RotationEuler): PolycubeShape {
  const matrix = createEulerRotationMatrix(euler.pitch, euler.yaw, euler.roll)
  return transformShape(shape, matrix)
}

/**
 * Creates a chiral enantiomer of a polycube by reflecting across the YZ plane (x -> -x)
 */
export function createChiralEnantiomer(shape: PolycubeShape): PolycubeShape {
  const reflection = createReflectionMatrix('yz')
  const enantiomer = transformShape(shape, reflection)
  return {
    ...enantiomer,
    id: `${shape.id}_enantiomer`,
    name: `${shape.name} (Enantiomer)`,
    description: `Mirror-image chiral reflection of ${shape.name}`,
    isChiral: true,
  }
}

/**
 * Converts 3D point to 2D isometric projected coordinates with depth metric
 */
export function projectIsometric(
  v: Vector3D,
  scale: number = 32,
  centerOffset: { x: number; y: number } = { x: 150, y: 150 },
): IsometricPoint {
  // Standard 30-degree isometric projection formulas:
  // x_2d = (x - z) * cos(30°)
  // y_2d = y + (x + z) * sin(30°)
  const cos30 = 0.86602540378
  const sin30 = 0.5

  const isoX = (v.x - v.z) * cos30 * scale + centerOffset.x
  const isoY = (-v.y + (v.x + v.z) * sin30) * scale + centerOffset.y
  // Depth buffer value for isometric painter's algorithm
  const depth = v.x + v.y + v.z

  return { x: isoX, y: isoY, depth }
}

/**
 * Generates 2D renderable isometric faces for a 3D polycube with depth-sorting
 */
export function generateVoxelFaces(
  voxels: Voxel3D[],
  viewEuler: RotationEuler,
  scale: number = 32,
  centerOffset: { x: number; y: number } = { x: 150, y: 150 },
): IsoFace[] {
  const viewMatrix = createEulerRotationMatrix(viewEuler.pitch, viewEuler.yaw, viewEuler.roll)
  const com = calculateCenterOfMass(voxels)

  // Light source vector in view space (coming from top-left-front)
  const lightSource: Vector3D = { x: -0.577, y: 0.577, z: 0.577 }

  const faces: IsoFace[] = []

  // Unit cube face definitions (6 faces per cube)
  const unitFaces: { name: string; normal: Vector3D; vertices: Vector3D[] }[] = [
    // Top face (+Y)
    {
      name: 'top',
      normal: { x: 0, y: 1, z: 0 },
      vertices: [
        { x: -0.5, y: 0.5, z: -0.5 },
        { x: 0.5, y: 0.5, z: -0.5 },
        { x: 0.5, y: 0.5, z: 0.5 },
        { x: -0.5, y: 0.5, z: 0.5 },
      ],
    },
    // Right/Front face (+X)
    {
      name: 'right',
      normal: { x: 1, y: 0, z: 0 },
      vertices: [
        { x: 0.5, y: -0.5, z: -0.5 },
        { x: 0.5, y: 0.5, z: -0.5 },
        { x: 0.5, y: 0.5, z: 0.5 },
        { x: 0.5, y: -0.5, z: 0.5 },
      ],
    },
    // Front/Left face (+Z)
    {
      name: 'front',
      normal: { x: 0, y: 0, z: 1 },
      vertices: [
        { x: -0.5, y: -0.5, z: 0.5 },
        { x: 0.5, y: -0.5, z: 0.5 },
        { x: 0.5, y: 0.5, z: 0.5 },
        { x: -0.5, y: 0.5, z: 0.5 },
      ],
    },
    // Bottom face (-Y)
    {
      name: 'bottom',
      normal: { x: 0, y: -1, z: 0 },
      vertices: [
        { x: -0.5, y: -0.5, z: 0.5 },
        { x: 0.5, y: -0.5, z: 0.5 },
        { x: 0.5, y: -0.5, z: -0.5 },
        { x: -0.5, y: -0.5, z: -0.5 },
      ],
    },
    // Left face (-X)
    {
      name: 'left',
      normal: { x: -1, y: 0, z: 0 },
      vertices: [
        { x: -0.5, y: -0.5, z: 0.5 },
        { x: -0.5, y: 0.5, z: 0.5 },
        { x: -0.5, y: 0.5, z: -0.5 },
        { x: -0.5, y: -0.5, z: -0.5 },
      ],
    },
    // Back face (-Z)
    {
      name: 'back',
      normal: { x: 0, y: 0, z: -1 },
      vertices: [
        { x: 0.5, y: -0.5, z: -0.5 },
        { x: -0.5, y: -0.5, z: -0.5 },
        { x: -0.5, y: 0.5, z: -0.5 },
        { x: 0.5, y: 0.5, z: -0.5 },
      ],
    },
  ]

  voxels.forEach((voxel, vIdx) => {
    // Relative to COM
    const relPos = { x: voxel.x - com.x, y: voxel.y - com.y, z: voxel.z - com.z }
    const rotatedPos = multiplyMatrixVector(viewMatrix, relPos)

    for (const uf of unitFaces) {
      // Rotated face normal
      const rotNormal = multiplyMatrixVector(viewMatrix, uf.normal)

      // Back-face culling for isometric projection
      // In isometric view, observer line of sight is roughly in direction (1, 1, 1) in normalized coords
      const dotView = rotNormal.x * 0.577 + rotNormal.y * 0.577 + rotNormal.z * 0.577
      if (dotView < -0.1) {
        continue // Culled back face
      }

      // Calculate lighting shade (Lambertian cosine diffuse + ambient)
      const dotLight =
        rotNormal.x * lightSource.x + rotNormal.y * lightSource.y + rotNormal.z * lightSource.z
      const shade = clamp(0.35 + 0.65 * Math.max(0, dotLight), 0.2, 1.0)

      // Project vertices
      let faceDepthSum = 0
      const projVertices: IsometricPoint[] = uf.vertices.map((vert) => {
        const vWorld = {
          x: rotatedPos.x + vert.x,
          y: rotatedPos.y + vert.y,
          z: rotatedPos.z + vert.z,
        }
        const proj = projectIsometric(vWorld, scale, centerOffset)
        faceDepthSum += proj.depth
        return proj
      })

      faces.push({
        vertices: projVertices,
        normal: rotNormal,
        color: voxel.color || '#3b82f6',
        shade,
        depth: faceDepthSum / 4,
        voxelIndex: vIdx,
      })
    }
  })

  // Painter's algorithm: sort faces from back to front (lowest depth rendered first)
  return faces.sort((a, b) => a.depth - b.depth)
}

/**
 * 24 rotational symmetries of the cube (SO(3) subgroup)
 * Used to test whether two polycubes are congruent under rigid rotation
 */
export function generateCubeGroupRotations(): Matrix3x3[] {
  const matrices: Matrix3x3[] = []

  // Permutations of coordinate axes and sign flips preserving det = +1
  const signs = [1, -1]
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      if (yi === xi) continue
      const zi = 3 - xi - yi

      for (const sx of signs) {
        for (const sy of signs) {
          // Determinant must be +1 for pure rotation
          // det = sx * sy * sz * permutation_parity
          const parity = yi === (xi + 1) % 3 ? 1 : -1
          const sz = sx * sy * parity

          const m: Matrix3x3 = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ]
          m[0][xi] = sx
          m[1][yi] = sy
          m[2][zi] = sz
          matrices.push(m)
        }
      }
    }
  }

  return matrices
}

/**
 * Checks if two polycubes are geometrically congruent under any of the 24 cube rotations
 */
export function checkCongruenceUnderSO3(
  shapeA: PolycubeShape,
  shapeB: PolycubeShape,
  _tolerance: number = 0.01,
): { isCongruent: boolean; matchingRotation?: Matrix3x3 } {
  if (shapeA.voxels.length !== shapeB.voxels.length) {
    return { isCongruent: false }
  }

  const rotations = generateCubeGroupRotations()
  const comA = shapeA.centerOfMass
  const relA = shapeA.voxels.map((v) => ({
    x: Math.round(v.x - comA.x),
    y: Math.round(v.y - comA.y),
    z: Math.round(v.z - comA.z),
  }))

  const comB = shapeB.centerOfMass
  const setB = new Set(
    shapeB.voxels.map(
      (v) => `${Math.round(v.x - comB.x)},${Math.round(v.y - comB.y)},${Math.round(v.z - comB.z)}`,
    ),
  )

  for (const rot of rotations) {
    let allMatched = true
    for (const vA of relA) {
      const rotated = multiplyMatrixVector(rot, vA)
      const key = `${Math.round(rotated.x)},${Math.round(rotated.y)},${Math.round(rotated.z)}`
      if (!setB.has(key)) {
        allMatched = false
        break
      }
    }
    if (allMatched) {
      return { isCongruent: true, matchingRotation: rot }
    }
  }

  return { isCongruent: false }
}

// ============================================================================
// 2. Canonical Shepard & Metzler (1971) Stimuli Library
// ============================================================================

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic);
// re-exported near the top of this file so import paths are unchanged.

// ============================================================================
// 3. Shepard & Metzler Response Latency & Trial Generation
// ============================================================================

/**
 * Predicts expected reaction time based on Shepard & Metzler's linear regression:
 * RT = α + β·θ
 * Where:
 * α ≈ 950 ms (base sensorimotor encoding and keypress latency)
 * β ≈ 4.5 ms / degree (mental rotation rate ≈ 222 deg/sec)
 */
export function predictShepardMetzlerReactionTimeMs(
  angularDisparityDeg: number,
  baseAlphaMs: number = 950,
  slopeBetaMsPerDeg: number = 4.5,
): number {
  const disparity = Math.abs(angularDisparityDeg)
  return Math.round(baseAlphaMs + slopeBetaMsPerDeg * disparity)
}

/**
 * Calculates empirical mental rotation velocity in degrees per second
 */
export function calculateMentalRotationVelocity(
  angularDisparityDeg: number,
  reactionTimeMs: number,
  baseAlphaMs: number = 950,
): number {
  if (angularDisparityDeg <= 5) return 0
  const activeRotationMs = Math.max(100, reactionTimeMs - baseAlphaMs)
  return Math.round((angularDisparityDeg / (activeRotationMs / 1000)) * 10) / 10
}

/**
 * Generates an empirical Shepard-Metzler trial comparing a target shape against
 * a rotated candidate (either congruent or a chiral mirror reflection)
 */
export function generateShepardMetzlerTrial(
  baseShapeId: string,
  targetDisparityDeg: number = 60,
  forceEnantiomer?: boolean,
): ShepardMetzlerTrial {
  const baseShape =
    CANONICAL_SHEPARD_METZLER_SHAPES.find((s) => s.id === baseShapeId) ||
    CANONICAL_SHEPARD_METZLER_SHAPES[0]

  // Decide if stimulus is congruent or chiral enantiomer
  const isCongruent = forceEnantiomer !== undefined ? !forceEnantiomer : Math.random() > 0.5

  // Pick rotation axis (either pure X, pure Y, pure Z, or compound oblique)
  const axisOptions: Vector3D[] = [
    { x: 0, y: 1, z: 0 }, // Picture-plane / yaw
    { x: 1, y: 0, z: 0 }, // Pitch (depth)
    { x: 0, y: 0, z: 1 }, // Roll (depth)
    { x: 0.707, y: 0.707, z: 0 }, // Oblique axis
  ]
  const axis = axisOptions[Math.floor(Math.random() * axisOptions.length)]
  const rotationMatrix = createAxisAngleMatrix(axis, targetDisparityDeg)

  let rotated: PolycubeShape
  if (isCongruent) {
    rotated = transformShape(baseShape, rotationMatrix)
  } else {
    // Generate true enantiomer reflection first, then apply rotation
    const enantiomer = createChiralEnantiomer(baseShape)
    rotated = transformShape(enantiomer, rotationMatrix)
  }

  // Calculate actual angular disparity
  const identity = createIdentityMatrix()
  const actualDisparity = Math.round(calculateAngularDisparityDeg(identity, rotationMatrix))
  const expectedRt = predictShepardMetzlerReactionTimeMs(actualDisparity)

  return {
    trialId: `trial_${baseShape.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    baseShape,
    rotatedShape: rotated,
    angularDisparityDeg: actualDisparity,
    isCongruent,
    rotationEuler: { pitch: 0, yaw: targetDisparityDeg, roll: 0 },
    rotationAxis: axis,
    expectedReactionTimeMs: expectedRt,
  }
}

// ============================================================================
// 4. Mary Hegarty (2004) Kinematic Mechanical Simulation Engine
// ============================================================================

/**
 * Topologically traverses and solves kinematic chain velocity and direction propagation
 */
export function solveKinematicChain(chain: KinematicChainState): KinematicChainState {
  const updatedNodes = { ...chain.nodes }
  const visited = new Set<string>()
  const sequence: string[] = []
  let reversals = 0

  // Queue for Breadth-First-Search propagation from input node
  const queue: string[] = [chain.inputNodeId]
  const inputNode = updatedNodes[chain.inputNodeId]

  if (inputNode) {
    inputNode.angularVelocityRpm = chain.inputRpm
    inputNode.direction = chain.inputDirection
    visited.add(chain.inputNodeId)
    sequence.push(chain.inputNodeId)
  }

  while (queue.length > 0) {
    const parentId = queue.shift()!
    const parent = updatedNodes[parentId]
    if (!parent) continue

    // Find all children driven by this parent
    for (const childId of Object.keys(updatedNodes)) {
      const child = updatedNodes[childId]
      if (child.drivenBy === parentId && !visited.has(childId)) {
        visited.add(childId)
        sequence.push(childId)
        queue.push(childId)

        // Calculate angular velocity and direction based on mechanical coupling
        switch (child.couplingType) {
          case 'meshed_external': {
            // External gears invert direction
            const ratio = parent.pitchRadius / child.pitchRadius
            child.angularVelocityRpm = Math.round(parent.angularVelocityRpm * ratio * 100) / 100
            child.direction =
              parent.direction === 'clockwise'
                ? 'counter_clockwise'
                : parent.direction === 'counter_clockwise'
                  ? 'clockwise'
                  : 'stationary'
            reversals++
            break
          }
          case 'meshed_internal': {
            // Internal ring gear preserves direction
            const ratio = parent.pitchRadius / child.pitchRadius
            child.angularVelocityRpm = Math.round(parent.angularVelocityRpm * ratio * 100) / 100
            child.direction = parent.direction
            break
          }
          case 'belt_open': {
            // Open belt preserves direction
            const ratio = parent.pitchRadius / child.pitchRadius
            child.angularVelocityRpm = Math.round(parent.angularVelocityRpm * ratio * 100) / 100
            child.direction = parent.direction
            break
          }
          case 'belt_crossed': {
            // Crossed belt inverts direction
            const ratio = parent.pitchRadius / child.pitchRadius
            child.angularVelocityRpm = Math.round(parent.angularVelocityRpm * ratio * 100) / 100
            child.direction =
              parent.direction === 'clockwise'
                ? 'counter_clockwise'
                : parent.direction === 'counter_clockwise'
                  ? 'clockwise'
                  : 'stationary'
            reversals++
            break
          }
          case 'rigid_shaft': {
            // Coaxial rigid shaft maintains identical RPM and direction
            child.angularVelocityRpm = parent.angularVelocityRpm
            child.direction = parent.direction
            break
          }
          default:
            child.direction = parent.direction
            child.angularVelocityRpm = parent.angularVelocityRpm
        }
      }
    }
  }

  // Cognitive load calculation based on Hegarty (2004):
  // Load = 1.0 + 0.35 * (chain_length) + 0.5 * (reversals)
  const cogLoad = Math.round((1.0 + 0.35 * sequence.length + 0.5 * reversals) * 10) / 10

  return {
    ...chain,
    nodes: updatedNodes,
    stepEvaluationSequence: sequence,
    totalDirectionReversals: reversals,
    cognitiveLoadScore: cogLoad,
  }
}

/**
 * Evaluates Hegarty's piecemeal mental animation predictions vs actual kinematic solution
 */
export function evaluatePiecemealKinematicPredictions(
  solvedChain: KinematicChainState,
  userPredictions: Record<string, { direction: KinematicRotationDirection; rpm?: number }>,
): {
  stepCoherence: number
  errorNodes: string[]
  piecemealDriftIndex: number
} {
  const sequence = solvedChain.stepEvaluationSequence
  let correctCount = 0
  const errorNodes: string[] = []
  let cumulativeDrift = 0

  sequence.forEach((nodeId, stepIdx) => {
    const actualNode = solvedChain.nodes[nodeId]
    const userGuess = userPredictions[nodeId]

    if (!userGuess) {
      errorNodes.push(nodeId)
      cumulativeDrift += stepIdx + 1
      return
    }

    if (userGuess.direction === actualNode.direction) {
      correctCount++
    } else {
      errorNodes.push(nodeId)
      // Hegarty finding: errors later in the chain indicate piecemeal mental simulation breakdown
      cumulativeDrift += (stepIdx + 1) * 1.5
    }
  })

  const total = Math.max(1, sequence.length)
  const stepCoherence = Math.round((correctCount / total) * 100) / 100
  const piecemealDriftIndex = Math.min(1.0, Math.round((cumulativeDrift / (total * 2)) * 100) / 100)

  return {
    stepCoherence,
    errorNodes,
    piecemealDriftIndex,
  }
}

// ============================================================================
// 5. 5 Multidisciplinary STEM Spatial Scenarios
// ============================================================================

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic);
// re-exported near the top of this file so import paths are unchanged.

// ============================================================================
// 6. Assessment, Bias Diagnostics & Indexing
// ============================================================================

/**
 * Computes comprehensive Spatial Visualization Index and diagnostic metrics
 */
export function calculateSpatialVisualizationMetrics(
  attempts: RotationPerformanceAttempt[],
  kinematicStepCoherence: number = 0.85,
  alignmentBiasFactor: number = 0.15,
): SpatialVisualizationMetrics {
  if (attempts.length === 0) {
    return {
      mentalRotationVelocityDegPerSec: 180,
      chiralityDiscriminationAccuracy: 0.75,
      kinematicStepCoherence,
      spatialDisparityToleranceDeg: 120,
      alignmentBiasFactor,
      overallSpatialVisualizationIndex: 0.72,
      skillTier: 'constrained_3d_animator',
      recommendations: [
        'Complete baseline Shepard-Metzler trials to establish angular rotation latency curves',
        'Practice with high-disparity (>120°) stimulus pairs to build spatial working memory buffer',
      ],
    }
  }

  // 1. Calculate average mental rotation velocity on correct attempts
  const correctAttempts = attempts.filter((a) => a.isCorrect && a.angularDisparityDeg > 15)
  let avgVelocity = 180
  if (correctAttempts.length > 0) {
    const velocities = correctAttempts.map((a) =>
      calculateMentalRotationVelocity(a.angularDisparityDeg, a.reactionTimeMs),
    )
    avgVelocity = Math.round(velocities.reduce((sum, v) => sum + v, 0) / velocities.length)
  }

  // 2. Chirality discrimination accuracy
  const chiralityCorrect = attempts.filter((a) => a.isCorrect).length
  const chiralityAccuracy = Math.round((chiralityCorrect / attempts.length) * 100) / 100

  // 3. Maximum angular disparity tolerated with >75% accuracy
  const disparityGroups: Record<number, { total: number; correct: number }> = {}
  attempts.forEach((a) => {
    const bucket = Math.round(a.angularDisparityDeg / 30) * 30
    if (!disparityGroups[bucket]) disparityGroups[bucket] = { total: 0, correct: 0 }
    disparityGroups[bucket].total++
    if (a.isCorrect) disparityGroups[bucket].correct++
  })

  let maxToleranceDeg = 60
  for (const bucketStr of Object.keys(disparityGroups).sort((a, b) => Number(a) - Number(b))) {
    const bucket = Number(bucketStr)
    const stats = disparityGroups[bucket]
    if (stats.total >= 1 && stats.correct / stats.total >= 0.7) {
      maxToleranceDeg = Math.max(maxToleranceDeg, bucket)
    }
  }

  // 4. Overall Spatial Visualization Index (0.0 .. 1.0)
  // Weighted:
  // - Velocity score: 25% (normalized against 300 deg/sec)
  // - Chirality accuracy: 30%
  // - Kinematic coherence: 25%
  // - Disparity tolerance: 20% (normalized against 180 deg)
  const normVelocity = clamp(avgVelocity / 300, 0.2, 1.0)
  const normTolerance = clamp(maxToleranceDeg / 180, 0.2, 1.0)
  const normAlignment = 1.0 - clamp(alignmentBiasFactor, 0, 0.8)

  const overallIndex =
    Math.round(
      (normVelocity * 0.25 +
        chiralityAccuracy * 0.3 +
        kinematicStepCoherence * 0.25 +
        normTolerance * 0.2) *
        normAlignment *
        100,
    ) / 100

  // 5. Determine Skill Tier
  let skillTier: SpatialSkillTier = 'piecemeal_2d_rotator'
  if (overallIndex >= 0.88) {
    skillTier = 'master_spatial_modeler'
  } else if (overallIndex >= 0.72) {
    skillTier = 'holistic_spatial_synthesizer'
  } else if (overallIndex >= 0.52) {
    skillTier = 'constrained_3d_animator'
  }

  // 6. Actionable recommendations
  const recommendations: string[] = []
  if (chiralityAccuracy < 0.75) {
    recommendations.push(
      'Target chiral enantiomer discrimination: practice flipping mental models across the YZ mirror plane before rotation.',
    )
  }
  if (avgVelocity < 150) {
    recommendations.push(
      'Improve mental rotation speed: focus on rotating continuous 3D axes rather than piecemeal block-by-block reconstruction.',
    )
  }
  if (kinematicStepCoherence < 0.75) {
    recommendations.push(
      'Strengthen kinematic chain simulation: apply Hegarty causal direction rules step-by-step through gear meshing points.',
    )
  }
  if (alignmentBiasFactor > 0.25) {
    recommendations.push(
      'Counteract Tversky alignment heuristic: train on oblique (non-cardinal) rotation angles (45°, 135°) to decouple from screen axes.',
    )
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Exceptional spatial cognition: advance to coupled epicyclic multi-frame simulations and high-dimensional SE(3) transforms.',
    )
  }

  return {
    mentalRotationVelocityDegPerSec: avgVelocity,
    chiralityDiscriminationAccuracy: chiralityAccuracy,
    kinematicStepCoherence,
    spatialDisparityToleranceDeg: maxToleranceDeg,
    alignmentBiasFactor,
    overallSpatialVisualizationIndex: overallIndex,
    skillTier,
    recommendations,
  }
}

// ============================================================================
// 7. FSRS-6 Spaced Repetition Flashcard Deck Generator
// ============================================================================

export function generateFSRSSpatialDeck(): FSRSSpatialFlashcard[] {
  return [
    {
      id: 'fsrs_sm_01',
      scenarioDomain: 'stereochemistry',
      prompt: 'Shepard-Metzler 3D Congruence Check (60° Disparity)',
      visualRepresentationType: 'polycube_pair',
      disparityDeg: 60,
      question:
        'Compare the target polycube with the 60° rotated figure. Are they congruent through rigid rotation, or are they non-superimposable mirror enantiomers?',
      options: [
        'Congruent through 3D rotation',
        'Mirror enantiomer (Chiral reflection)',
        'Different block topologies',
      ],
      correctAnswerIndex: 0,
      explanation:
        'A rigid 60-degree rotation around the Y-axis superimposes all 10 voxel vertices exactly; no planar reflection occurred.',
      initialStabilityDays: 2.5,
      initialDifficulty: 3.2,
    },
    {
      id: 'fsrs_sm_02',
      scenarioDomain: 'stereochemistry',
      prompt: 'Chiral Enantiomer Detection (90° Disparity)',
      visualRepresentationType: 'polycube_pair',
      disparityDeg: 90,
      question:
        'Examine the second polycube. Can any sequence of 3D rotations align its orthogonal elbow arm with the reference figure?',
      options: [
        'No, it is an inverted chiral enantiomer reflected across the YZ plane',
        'Yes, with pitch = 90° and roll = 90°',
        'Yes, with yaw = 180°',
      ],
      correctAnswerIndex: 0,
      explanation:
        'Reflecting an asymmetric 3D polycube produces an enantiomer that cannot be superimposed by any SO(3) rotation.',
      initialStabilityDays: 1.8,
      initialDifficulty: 5.4,
    },
    {
      id: 'fsrs_cip_01',
      scenarioDomain: 'stereochemistry',
      prompt: 'Cahn-Ingold-Prelog (R)/(S) Stereocenter Deduction',
      visualRepresentationType: 'stereocenter_cip',
      disparityDeg: 45,
      question:
        'In Bromochlorofluoromethane, if priority group 4 (-H) points directly towards you (into your eye), and 1->2->3 traces CLOCKWISE, what is the true configuration?',
      options: [
        '(S) sinister configuration (reversed because priority 4 is pointing toward observer)',
        '(R) rectus configuration',
        'Achiral meso form',
      ],
      correctAnswerIndex: 0,
      explanation:
        'The standard CIP rule requires priority 4 to point AWAY. When pointing TOWARD, clockwise apparent trace inverts to (S).',
      initialStabilityDays: 2.1,
      initialDifficulty: 4.8,
    },
    {
      id: 'fsrs_kinematic_01',
      scenarioDomain: 'mechanical_kinematics',
      prompt: 'Hegarty Kinematic Chain Direction Reversal',
      visualRepresentationType: 'kinematic_diagram',
      disparityDeg: 0,
      question:
        'In a 5-gear external train where Gear 1 rotates CLOCKWISE, what is the rotation direction of Gear 5?',
      options: [
        'Clockwise (odd number of gears in simple external train)',
        'Counter-clockwise',
        'Depends on tooth count ratios',
      ],
      correctAnswerIndex: 0,
      explanation:
        'Each external mesh inverts direction (-1). Four meshes = (-1)^4 = +1. Gear 5 rotates in the same direction as Gear 1 (Clockwise).',
      initialStabilityDays: 3.8,
      initialDifficulty: 2.4,
    },
    {
      id: 'fsrs_mri_01',
      scenarioDomain: 'neuroanatomy',
      prompt: 'MRI Plane Volumetric Alignment',
      visualRepresentationType: 'mri_cross_section',
      disparityDeg: 90,
      question:
        'Which anatomical plane divides the human brain into anterior (rostral) and posterior (caudal) sections?',
      options: ['Coronal (Frontal) Plane', 'Axial (Transverse) Plane', 'Sagittal (Medial) Plane'],
      correctAnswerIndex: 0,
      explanation:
        'The Coronal plane slices vertically from ear-to-ear, partitioning anterior and posterior segments.',
      initialStabilityDays: 4.2,
      initialDifficulty: 2.1,
    },
  ]
}
