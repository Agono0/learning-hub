/**
 * @fileoverview Spatial Memory Palace Physics, Waypoints & Mnemonic Engine.
 *
 * Implements:
 * 1. Multi-Archetype 3D Architecture (Roman Villa, Modern Gallery, Cyber Sanctum,
 *    Renaissance Library, Zen Monastery) with collision boundaries and portals.
 * 2. Continuous 3D Collision Detection with natural wall-sliding physics.
 * 3. Guided Tour Waypoint Generation with smooth Catmull-Rom path interpolation.
 * 4. Mnemonic Association Modeling (Simonides 477 BC; Dresler et al. Neuron 2017)
 *    calculating spatial retention multipliers and interference metrics.
 * 5. Interactive Palace Review Session State Machine.
 */

import type { EnvironmentArchetype, SpatialLocus, SpatialVector3 } from './index'

export interface WallSegment {
  id: string
  startX: number
  startZ: number
  endX: number
  endZ: number
  height: number
  thickness: number
}

export interface PillarObstacle {
  id: string
  x: number
  z: number
  radius: number
}

export interface RoomBoundary {
  id: string
  name: string
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  floorHeight: number
  ceilingHeight: number
  walls: WallSegment[]
  pillars: PillarObstacle[]
}

export interface ArchitecturalTheme {
  id: EnvironmentArchetype
  name: string
  description: string
  ambientLight: number
  primaryColor: number
  accentColor: number
  floorColor: number
  wallColor: number
  fogColor: number
  fogDensity: number
  reverbDecaySeconds: number
}

export const ARCHITECTURAL_THEMES: Record<EnvironmentArchetype, ArchitecturalTheme> = {
  roman_villa: {
    id: 'roman_villa',
    name: 'Roman Peristyle Villa',
    description: 'Classical marble colonnade surrounding an open central atrium fountain.',
    ambientLight: 0xf8fafc,
    primaryColor: 0xd97706,
    accentColor: 0xef4444,
    floorColor: 0x1e293b,
    wallColor: 0x334155,
    fogColor: 0x0f172a,
    fogDensity: 0.015,
    reverbDecaySeconds: 1.8,
  },
  modern_gallery: {
    id: 'modern_gallery',
    name: 'Modernist Bauhaus Gallery',
    description: 'Minimalist polished concrete exhibition halls with directional spotlights.',
    ambientLight: 0xffffff,
    primaryColor: 0x6366f1,
    accentColor: 0x06b6d4,
    floorColor: 0x18181b,
    wallColor: 0x27272a,
    fogColor: 0x09090b,
    fogDensity: 0.012,
    reverbDecaySeconds: 1.2,
  },
  cyber_sanctum: {
    id: 'cyber_sanctum',
    name: 'Cybernetic Holographic Sanctum',
    description: 'Floating neon data sanctum with luminous holographic pedestal matrices.',
    ambientLight: 0x38bdf8,
    primaryColor: 0x818cf8,
    accentColor: 0xec4899,
    floorColor: 0x030712,
    wallColor: 0x0b0f19,
    fogColor: 0x020617,
    fogDensity: 0.02,
    reverbDecaySeconds: 2.4,
  },
  renaissance_library: {
    id: 'renaissance_library',
    name: 'Renaissance Grand Library',
    description:
      'Tiered dark oak bookshelves, brass reading lamps, and vaulted cathedral ceilings.',
    ambientLight: 0xfef3c7,
    primaryColor: 0xb45309,
    accentColor: 0x10b981,
    floorColor: 0x29180b,
    wallColor: 0x3d2514,
    fogColor: 0x170d06,
    fogDensity: 0.018,
    reverbDecaySeconds: 2.2,
  },
  zen_monastery: {
    id: 'zen_monastery',
    name: 'Kyoto Zen Monastery',
    description: 'Raked white gravel courtyard, cedar engawa walkways, and sliding shoji screens.',
    ambientLight: 0xfafaf9,
    primaryColor: 0x84cc16,
    accentColor: 0x0ea5e9,
    floorColor: 0x262626,
    wallColor: 0x404040,
    fogColor: 0x171717,
    fogDensity: 0.014,
    reverbDecaySeconds: 0.8,
  },
}

/**
 * Builds standard architectural room boundaries and collision obstacles for a theme.
 */
export function generateRoomBoundaries(archetype: EnvironmentArchetype): RoomBoundary {
  const walls: WallSegment[] = []
  const pillars: PillarObstacle[] = []

  switch (archetype) {
    case 'roman_villa': {
      // 20x20m Atrium with 4 inner colonnade pillars
      const size = 12
      // Outer walls
      walls.push({
        id: 'w1',
        startX: -size,
        startZ: -size,
        endX: size,
        endZ: -size,
        height: 4.5,
        thickness: 0.4,
      })
      walls.push({
        id: 'w2',
        startX: size,
        startZ: -size,
        endX: size,
        endZ: size,
        height: 4.5,
        thickness: 0.4,
      })
      walls.push({
        id: 'w3',
        startX: size,
        startZ: size,
        endX: -size,
        endZ: size,
        height: 4.5,
        thickness: 0.4,
      })
      walls.push({
        id: 'w4',
        startX: -size,
        startZ: size,
        endX: -size,
        endZ: -size,
        height: 4.5,
        thickness: 0.4,
      })

      // 4 Colonnade Pillars
      pillars.push({ id: 'p1', x: -4, z: -4, radius: 0.6 })
      pillars.push({ id: 'p2', x: 4, z: -4, radius: 0.6 })
      pillars.push({ id: 'p3', x: 4, z: 4, radius: 0.6 })
      pillars.push({ id: 'p4', x: -4, z: 4, radius: 0.6 })

      return {
        id: 'room-roman-villa',
        name: 'Villa Peristyle Atrium',
        minX: -size,
        maxX: size,
        minZ: -size,
        maxZ: size,
        floorHeight: 0,
        ceilingHeight: 4.5,
        walls,
        pillars,
      }
    }

    case 'modern_gallery': {
      // Linear elongated gallery hall 10x30m
      const w = 6
      const l = 16
      walls.push({
        id: 'w1',
        startX: -w,
        startZ: -l,
        endX: w,
        endZ: -l,
        height: 4.0,
        thickness: 0.3,
      })
      walls.push({ id: 'w2', startX: w, startZ: -l, endX: w, endZ: l, height: 4.0, thickness: 0.3 })
      walls.push({ id: 'w3', startX: w, startZ: l, endX: -w, endZ: l, height: 4.0, thickness: 0.3 })
      walls.push({
        id: 'w4',
        startX: -w,
        startZ: l,
        endX: -w,
        endZ: -l,
        height: 4.0,
        thickness: 0.3,
      })

      // Center separator partition wall
      walls.push({
        id: 'part1',
        startX: -0.2,
        startZ: -6,
        endX: -0.2,
        endZ: 6,
        height: 3.2,
        thickness: 0.4,
      })

      return {
        id: 'room-modern-gallery',
        name: 'Linear Bauhaus Exhibition',
        minX: -w,
        maxX: w,
        minZ: -l,
        maxZ: l,
        floorHeight: 0,
        ceilingHeight: 4.0,
        walls,
        pillars,
      }
    }

    case 'cyber_sanctum':
    case 'renaissance_library':
    case 'zen_monastery':
    default: {
      const radius = 14
      walls.push({
        id: 'w1',
        startX: -radius,
        startZ: -radius,
        endX: radius,
        endZ: -radius,
        height: 5.0,
        thickness: 0.5,
      })
      walls.push({
        id: 'w2',
        startX: radius,
        startZ: -radius,
        endX: radius,
        endZ: radius,
        height: 5.0,
        thickness: 0.5,
      })
      walls.push({
        id: 'w3',
        startX: radius,
        startZ: radius,
        endX: -radius,
        endZ: radius,
        height: 5.0,
        thickness: 0.5,
      })
      walls.push({
        id: 'w4',
        startX: -radius,
        startZ: radius,
        endX: -radius,
        endZ: -radius,
        height: 5.0,
        thickness: 0.5,
      })

      pillars.push({ id: 'p_center', x: 0, z: 0, radius: 1.2 })

      return {
        id: `room-${archetype}`,
        name: ARCHITECTURAL_THEMES[archetype]?.name ?? 'Palace Sanctum',
        minX: -radius,
        maxX: radius,
        minZ: -radius,
        maxZ: radius,
        floorHeight: 0,
        ceilingHeight: 5.0,
        walls,
        pillars,
      }
    }
  }
}

export type DecorationKind =
  | 'atrium_fountain'
  | 'bronze_brazier'
  | 'spotlight_track'
  | 'hologram_core'
  | 'carved_bookshelf'
  | 'zen_lantern'

export interface PalaceDecoration {
  id: string
  kind: DecorationKind
  position: SpatialVector3
  rotationY?: number
  scale?: number
  lightColor?: number
  lightIntensity?: number
}

/**
 * Generates architectural environmental decorations (fountains, braziers,
 * bookshelves, stone lanterns) to enhance mnemonic distinctiveness.
 */
export function generateRoomDecorations(archetype: EnvironmentArchetype): PalaceDecoration[] {
  const decorations: PalaceDecoration[] = []

  switch (archetype) {
    case 'roman_villa':
      decorations.push({
        id: 'villa-fountain-center',
        kind: 'atrium_fountain',
        position: [0, 0.4, 0],
        scale: 1.8,
        lightColor: 0x38bdf8,
        lightIntensity: 0.8,
      })
      decorations.push({
        id: 'villa-brazier-nw',
        kind: 'bronze_brazier',
        position: [-6, 0.8, -6],
        lightColor: 0xf59e0b,
        lightIntensity: 1.5,
      })
      decorations.push({
        id: 'villa-brazier-ne',
        kind: 'bronze_brazier',
        position: [6, 0.8, -6],
        lightColor: 0xf59e0b,
        lightIntensity: 1.5,
      })
      break

    case 'modern_gallery':
      decorations.push({
        id: 'gallery-track-1',
        kind: 'spotlight_track',
        position: [0, 3.8, -4],
        lightColor: 0xffffff,
        lightIntensity: 2.0,
      })
      decorations.push({
        id: 'gallery-track-2',
        kind: 'spotlight_track',
        position: [0, 3.8, 4],
        lightColor: 0xffffff,
        lightIntensity: 2.0,
      })
      break

    case 'cyber_sanctum':
      decorations.push({
        id: 'cyber-quantum-core',
        kind: 'hologram_core',
        position: [0, 1.8, 0],
        scale: 1.4,
        lightColor: 0x818cf8,
        lightIntensity: 2.5,
      })
      break

    case 'renaissance_library':
      decorations.push({
        id: 'library-shelf-north',
        kind: 'carved_bookshelf',
        position: [0, 2.2, -8],
        rotationY: 0,
        scale: 2.0,
        lightColor: 0xfde68a,
        lightIntensity: 1.2,
      })
      decorations.push({
        id: 'library-shelf-south',
        kind: 'carved_bookshelf',
        position: [0, 2.2, 8],
        rotationY: Math.PI,
        scale: 2.0,
        lightColor: 0xfde68a,
        lightIntensity: 1.2,
      })
      break

    case 'zen_monastery':
      decorations.push({
        id: 'zen-stone-lantern-1',
        kind: 'zen_lantern',
        position: [-3.5, 0.5, -3.5],
        lightColor: 0xfef08a,
        lightIntensity: 1.0,
      })
      decorations.push({
        id: 'zen-stone-lantern-2',
        kind: 'zen_lantern',
        position: [3.5, 0.5, 3.5],
        lightColor: 0xfef08a,
        lightIntensity: 1.0,
      })
      break
  }

  return decorations
}

/**
 * Resolves player movement with continuous collision detection against walls and pillars.
 * Uses tangential projection to allow smooth wall sliding without getting stuck.
 */
export function resolvePalaceCollisions(
  currentPos: SpatialVector3,
  targetPos: SpatialVector3,
  boundary: RoomBoundary,
  playerRadius = 0.45,
): SpatialVector3 {
  const y = targetPos[1]
  let nextX = targetPos[0]
  let nextZ = targetPos[2]

  // 1. Clamp to boundary extents
  const buffer = playerRadius + 0.05
  nextX = Math.max(boundary.minX + buffer, Math.min(boundary.maxX - buffer, nextX))
  nextZ = Math.max(boundary.minZ + buffer, Math.min(boundary.maxZ - buffer, nextZ))

  // 2. Resolve pillar circular collisions
  for (const p of boundary.pillars) {
    const dx = nextX - p.x
    const dz = nextZ - p.z
    const dist = Math.hypot(dx, dz)
    const minDist = p.radius + playerRadius
    if (dist < minDist && dist > 1e-6) {
      // Push out radially along collision normal
      const nx = dx / dist
      const nz = dz / dist
      nextX = p.x + nx * minDist
      nextZ = p.z + nz * minDist
    }
  }

  // 3. Resolve line-segment wall collisions (sliding response)
  for (const w of boundary.walls) {
    const wx = w.endX - w.startX
    const wz = w.endZ - w.startZ
    const wallLenSq = wx * wx + wz * wz
    if (wallLenSq === 0) continue

    // Project player position onto wall line segment
    const t = Math.max(
      0,
      Math.min(1, ((nextX - w.startX) * wx + (nextZ - w.startZ) * wz) / wallLenSq),
    )
    const closestX = w.startX + t * wx
    const closestZ = w.startZ + t * wz

    const distX = nextX - closestX
    const distZ = nextZ - closestZ
    const dist = Math.hypot(distX, distZ)
    const minDist = playerRadius + w.thickness * 0.5

    if (dist < minDist && dist > 1e-6) {
      const nx = distX / dist
      const nz = distZ / dist
      nextX = closestX + nx * minDist
      nextZ = closestZ + nz * minDist
    }
  }

  return [Math.round(nextX * 100) / 100, y, Math.round(nextZ * 100) / 100]
}

// ─── Guided Walkthrough Waypoint Tour Pathfinding ───────────────────────────

/**
 * Builds an optimal sequential walkthrough itinerary through all loci.
 * Inserts waypoint clearances between distant loci to navigate around central obstacles.
 */
export function buildLociWalkthroughTour(
  loci: SpatialLocus[],
  startPos: SpatialVector3 = [0, 1.6, 5],
): SpatialVector3[] {
  if (loci.length === 0) return [startPos]

  const waypoints: SpatialVector3[] = [startPos]

  for (let i = 0; i < loci.length; i++) {
    const locus = loci[i]!
    const [lx, ly, lz] = locus.position

    // Approach point is 1.2m offset from locus facing yaw
    const approachYaw = locus.rotationY ?? 0
    const approachX = lx + Math.sin(approachYaw) * 1.3
    const approachZ = lz + Math.cos(approachYaw) * 1.3

    // Insert intermediate corner clearance if crossing through origin
    const prev = waypoints[waypoints.length - 1]!
    if (
      (prev[0] * approachX < -4 && Math.abs(prev[2] + approachZ) < 6) ||
      (prev[2] * approachZ < -4 && Math.abs(prev[0] + approachX) < 6)
    ) {
      // Route around perimeter corner
      const midX = prev[0] * 0.5 + Math.sign(prev[0]) * 3
      const midZ = prev[2] * 0.5 + Math.sign(prev[2]) * 3
      waypoints.push([midX, 1.6, midZ])
    }

    waypoints.push([approachX, ly > 1.6 ? ly : 1.6, approachZ])
  }

  return waypoints
}

/**
 * Catmull-Rom spline cubic interpolation between 4 control points.
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const v0 = (p2 - p0) * 0.5
  const v1 = (p3 - p1) * 0.5
  const t2 = t * t
  const t3 = t * t2
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1
}

/**
 * Samples a continuous progress ratio `t` [0.0, 1.0] along a series of tour waypoints.
 */
export function sampleSplineTour(
  waypoints: SpatialVector3[],
  t: number,
): { position: SpatialVector3; targetLocusIndex: number } {
  if (waypoints.length === 0) return { position: [0, 1.6, 0], targetLocusIndex: 0 }
  if (waypoints.length === 1) return { position: waypoints[0]!, targetLocusIndex: 0 }

  const clampedT = Math.max(0, Math.min(1, t))
  const segments = waypoints.length - 1
  const scaledT = clampedT * segments
  const index = Math.min(Math.floor(scaledT), segments - 1)
  const segmentT = scaledT - index

  const p0 = waypoints[Math.max(0, index - 1)]!
  const p1 = waypoints[index]!
  const p2 = waypoints[Math.min(waypoints.length - 1, index + 1)]!
  const p3 = waypoints[Math.min(waypoints.length - 1, index + 2)]!

  const x = catmullRom(p0[0], p1[0], p2[0], p3[0], segmentT)
  const y = catmullRom(p0[1], p1[1], p2[1], p3[1], segmentT)
  const z = catmullRom(p0[2], p1[2], p2[2], p3[2], segmentT)

  return {
    position: [Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100],
    targetLocusIndex: Math.min(waypoints.length - 1, index + 1),
  }
}

// ─── Mnemonic Association & Spatial Retention Bonus ─────────────────────────

export interface MnemonicEvaluationInput {
  lociCount: number
  averageInterLocusDistance: number
  theme: EnvironmentArchetype
  distinctivenessScore: number // 0.0 - 1.0
  bizarrenessRating?: number // 1 - 5 (Von Restorff isolate effect)
  emotionalValence?: number // -1.0 to +1.0
}

export interface MnemonicEvaluationResult {
  spatialRetentionMultiplier: number // 1.0 - 1.5x
  estimatedLapseReductionPct: number // 0 - 40%
  spatialInterferenceRisk: 'negligible' | 'moderate' | 'high'
  recommendation: string
}

/**
 * Computes the cognitive retention boost imparted by the Method of Loci
 * (Simonides 477 BC; Maguire et al. PNAS 2003; Dresler et al. Neuron 2017).
 *
 * Factors:
 * - Spatial distinctiveness (loci separated by >= 2.5m minimize spatial interference)
 * - Mnemonic imagery vividness / bizarreness (Von Restorff isolation effect)
 * - Architectural environmental cues (high-fidelity room structures reduce memory decay)
 */
export function evaluateMnemonicStrength(input: MnemonicEvaluationInput): MnemonicEvaluationResult {
  const {
    averageInterLocusDistance,
    distinctivenessScore,
    bizarrenessRating = 3,
    emotionalValence = 0.5,
  } = input

  // 1. Spatial Interference Factor: loci closer than 2.0m crowd working memory
  let interferenceRisk: 'negligible' | 'moderate' | 'high' = 'negligible'
  let spacingMultiplier = 1.15
  if (averageInterLocusDistance < 1.8) {
    interferenceRisk = 'high'
    spacingMultiplier = 0.88
  } else if (averageInterLocusDistance < 2.5) {
    interferenceRisk = 'moderate'
    spacingMultiplier = 1.02
  } else {
    spacingMultiplier = 1.18
  }

  // 2. Von Restorff Isolation / Bizarreness Boost (1 to 5 scale)
  const bizarrenessMultiplier = 1.0 + (bizarrenessRating - 1) * 0.05 // up to +20%

  // 3. Distinctiveness & Emotional Valence Multiplier
  const distinctivenessBoost = distinctivenessScore * 0.12
  const valenceBoost = Math.abs(emotionalValence) * 0.06

  const rawMultiplier =
    spacingMultiplier * bizarrenessMultiplier * (1.0 + distinctivenessBoost + valenceBoost)

  // Clamp multiplier between 0.9x and 1.45x
  const spatialRetentionMultiplier =
    Math.round(Math.max(0.9, Math.min(1.45, rawMultiplier)) * 100) / 100
  const estimatedLapseReductionPct = Math.round(
    Math.max(0, Math.min(38, (spatialRetentionMultiplier - 1.0) * 85)),
  )

  let recommendation =
    'Optimal spatial separation: loci are well-spaced for strong hippocampal encoding.'
  if (interferenceRisk === 'high') {
    recommendation =
      'Loci are positioned too closely together (<1.8m), risking spatial crowding. Spread loci further apart across the room perimeter.'
  } else if (distinctivenessScore < 0.4) {
    recommendation =
      'Consider using varied 3D anchor types (wall canvases, holographic orbs, pedestals) to heighten perceptual distinctiveness.'
  }

  return {
    spatialRetentionMultiplier,
    estimatedLapseReductionPct,
    spatialInterferenceRisk: interferenceRisk,
    recommendation,
  }
}

// ─── Palace Review Session State Machine ───────────────────────────────────

export interface LocusRecallEvent {
  locusId: string
  cardId?: number
  rating: 1 | 2 | 3 | 4 // FSRS rating
  latencyMs: number
  distanceAtReview: number
  timestamp: string
}

export class PalaceReviewSession {
  private loci: SpatialLocus[] = []
  private currentIndex = 0
  private recallHistory: LocusRecallEvent[] = []
  private sessionStartTime = Date.now()

  constructor(loci: SpatialLocus[]) {
    this.loci = [...loci]
  }

  public get currentLocus(): SpatialLocus | null {
    return this.loci[this.currentIndex] ?? null
  }

  public get completedCount(): number {
    return this.recallHistory.length
  }

  public get totalLoci(): number {
    return this.loci.length
  }

  public get isFinished(): boolean {
    return this.currentIndex >= this.loci.length
  }

  /**
   * Checks whether the player's 3D position is within activation proximity of a locus.
   */
  public evaluateProximity(
    playerPos: SpatialVector3,
    activationRadius = 2.4,
  ): {
    focusedLocus: SpatialLocus | null
    distance: number
    isInProximity: boolean
  } {
    let closestLocus: SpatialLocus | null = null
    let minDistance = Infinity

    for (const l of this.loci) {
      const dx = playerPos[0] - l.position[0]
      const dy = playerPos[1] - l.position[1]
      const dz = playerPos[2] - l.position[2]
      const dist = Math.hypot(dx, dy, dz)
      if (dist < minDistance) {
        minDistance = dist
        closestLocus = l
      }
    }

    const roundedDist = Math.round(minDistance * 100) / 100
    const isInProximity = roundedDist <= activationRadius

    return {
      focusedLocus: isInProximity ? closestLocus : null,
      distance: roundedDist,
      isInProximity,
    }
  }

  /**
   * Records a user recall rating at the active or focused locus.
   */
  public recordRecall(
    locusId: string,
    rating: 1 | 2 | 3 | 4,
    latencyMs: number,
    distanceAtReview: number,
  ): LocusRecallEvent {
    const locus = this.loci.find((l) => l.id === locusId)
    const event: LocusRecallEvent = {
      locusId,
      cardId: locus?.cardId,
      rating,
      latencyMs,
      distanceAtReview: Math.round(distanceAtReview * 100) / 100,
      timestamp: new Date().toISOString(),
    }

    this.recallHistory.push(event)

    // Advance current index if reviewing the active sequential target
    if (this.currentLocus?.id === locusId) {
      this.currentIndex += 1
    }

    return event
  }

  /**
   * Summarizes session performance statistics.
   */
  public getSummary(): {
    totalReviewed: number
    accuracyPct: number // % of rating >= 3 (Good/Easy)
    averageLatencyMs: number
    durationSeconds: number
  } {
    const count = this.recallHistory.length
    if (count === 0) {
      return {
        totalReviewed: 0,
        accuracyPct: 0,
        averageLatencyMs: 0,
        durationSeconds: Math.round((Date.now() - this.sessionStartTime) / 1000),
      }
    }

    const correctCount = this.recallHistory.filter((r) => r.rating >= 3).length
    const totalLatency = this.recallHistory.reduce((sum, r) => sum + r.latencyMs, 0)

    return {
      totalReviewed: count,
      accuracyPct: Math.round((correctCount / count) * 100),
      averageLatencyMs: Math.round(totalLatency / count),
      durationSeconds: Math.round((Date.now() - this.sessionStartTime) / 1000),
    }
  }
}
