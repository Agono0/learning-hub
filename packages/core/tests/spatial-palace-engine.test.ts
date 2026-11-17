import { describe, expect, it } from 'vitest'
import {
  ARCHITECTURAL_THEMES,
  PalaceReviewSession,
  buildLociWalkthroughTour,
  evaluateMnemonicStrength,
  generateArchetypeLoci,
  generateRoomBoundaries,
  generateRoomDecorations,
  resolvePalaceCollisions,
  sampleSplineTour,
  type SpatialLocus,
} from '../src/spatial'

describe('Spatial Memory Palace & 3D WebXR Engine', () => {
  describe('Architectural Themes & Boundary Geometries', () => {
    it('defines rich themes for all 5 classical and modern archetypes', () => {
      const archetypes = [
        'roman_villa',
        'modern_gallery',
        'cyber_sanctum',
        'renaissance_library',
        'zen_monastery',
      ] as const

      for (const a of archetypes) {
        const theme = ARCHITECTURAL_THEMES[a]
        expect(theme).toBeDefined()
        expect(theme.name).toBeTruthy()
        expect(theme.reverbDecaySeconds).toBeGreaterThan(0)
      }
    })

    it('generates structural room boundaries with walls and collision obstacles', () => {
      const villaBoundary = generateRoomBoundaries('roman_villa')
      expect(villaBoundary.walls.length).toBeGreaterThanOrEqual(4)
      expect(villaBoundary.pillars.length).toBe(4) // 4 colonnade pillars

      const galleryBoundary = generateRoomBoundaries('modern_gallery')
      expect(galleryBoundary.walls.length).toBeGreaterThanOrEqual(5) // outer + partition
    })

    it('generates deterministic spatial loci for new archetypes', () => {
      const sampleSources = [
        { id: 101, title: 'Cicero Rhetoric' },
        { id: 102, title: 'Aristotle Syllogisms' },
        { id: 103, title: 'Plato Forms' },
      ]

      const libraryLoci = generateArchetypeLoci('renaissance_library', sampleSources)
      expect(libraryLoci).toHaveLength(3)
      expect(libraryLoci[0]!.position).toBeDefined()

      const zenLoci = generateArchetypeLoci('zen_monastery', sampleSources)
      expect(zenLoci).toHaveLength(3)
      expect(zenLoci[0]!.assetType).toBe('wall_canvas')
    })

    it('generates thematic room decorations and environmental lighting fixtures', () => {
      const villaDecos = generateRoomDecorations('roman_villa')
      expect(villaDecos.length).toBeGreaterThanOrEqual(2)
      expect(villaDecos.some((d) => d.kind === 'atrium_fountain')).toBe(true)

      const libraryDecos = generateRoomDecorations('renaissance_library')
      expect(libraryDecos.some((d) => d.kind === 'carved_bookshelf')).toBe(true)

      const cyberDecos = generateRoomDecorations('cyber_sanctum')
      expect(cyberDecos.some((d) => d.kind === 'hologram_core')).toBe(true)
    })
  })

  describe('3D Continuous Collision Detection & Wall Sliding', () => {
    const boundary = generateRoomBoundaries('roman_villa') // -12 to 12

    it('clamps target position within room boundary walls with player radius', () => {
      const resolved = resolvePalaceCollisions([0, 1.6, 0], [15, 1.6, 0], boundary, 0.5)
      expect(resolved[0]).toBeLessThanOrEqual(11.45)
    })

    it('pushes player out radially when attempting to walk through a pillar', () => {
      // Pillar 1 is at (-4, -4) with radius 0.6
      const resolved = resolvePalaceCollisions([-3.2, 1.6, -4], [-3.9, 1.6, -4], boundary, 0.5)
      const distToPillar = Math.hypot(resolved[0] - -4, resolved[2] - -4)
      expect(distToPillar).toBeGreaterThanOrEqual(1.05) // radius 0.6 + player 0.5 - eps
    })

    it('allows natural sliding along wall tangent vector', () => {
      // Move diagonally into North wall (z = -12)
      const resolved = resolvePalaceCollisions([5, 1.6, -11], [6, 1.6, -13], boundary, 0.5)
      expect(resolved[0]).toBeCloseTo(6, 1) // x slides freely
      expect(resolved[2]).toBeGreaterThanOrEqual(-11.45) // z is clamped
    })
  })

  describe('Guided Tour Waypoint Generation & Spline Sampling', () => {
    const mockLoci: SpatialLocus[] = [
      {
        id: 'l1',
        title: 'Locus 1',
        position: [4, 0.8, 4],
        rotationY: 0,
        assetType: 'pedestal_plaque',
      },
      {
        id: 'l2',
        title: 'Locus 2',
        position: [-4, 0.8, 4],
        rotationY: Math.PI / 2,
        assetType: 'pedestal_plaque',
      },
    ]

    it('builds clear sequential tour waypoints approaching each locus', () => {
      const tour = buildLociWalkthroughTour(mockLoci, [0, 1.6, 5])
      expect(tour.length).toBeGreaterThanOrEqual(3) // start + locus 1 + locus 2
    })

    it('smoothly samples Catmull-Rom tour progression between 0 and 1', () => {
      const tour = buildLociWalkthroughTour(mockLoci, [0, 1.6, 5])
      const startSample = sampleSplineTour(tour, 0.0)
      const midSample = sampleSplineTour(tour, 0.5)
      const endSample = sampleSplineTour(tour, 1.0)

      expect(startSample.position).toBeDefined()
      expect(midSample.position).toBeDefined()
      expect(endSample.position).toBeDefined()
      expect(endSample.targetLocusIndex).toBe(tour.length - 1)
    })
  })

  describe('Cognitive Mnemonic Association & Retention Evaluation', () => {
    it('calculates optimal spatial retention multiplier for well-spaced loci', () => {
      const result = evaluateMnemonicStrength({
        lociCount: 12,
        averageInterLocusDistance: 3.2,
        theme: 'roman_villa',
        distinctivenessScore: 0.85,
        bizarrenessRating: 4,
        emotionalValence: 0.6,
      })

      expect(result.spatialRetentionMultiplier).toBeGreaterThan(1.2)
      expect(result.estimatedLapseReductionPct).toBeGreaterThan(15)
      expect(result.spatialInterferenceRisk).toBe('negligible')
    })

    it('flags high spatial interference risk when loci are clustered too tightly', () => {
      const result = evaluateMnemonicStrength({
        lociCount: 10,
        averageInterLocusDistance: 1.2, // Too tight! (<1.8m)
        theme: 'modern_gallery',
        distinctivenessScore: 0.3,
      })

      expect(result.spatialInterferenceRisk).toBe('high')
      expect(result.spatialRetentionMultiplier).toBeLessThanOrEqual(1.05)
      expect(result.recommendation).toContain('crowding')
    })
  })

  describe('PalaceReviewSession State Machine', () => {
    const sessionLoci: SpatialLocus[] = [
      {
        id: 'loc_a',
        cardId: 201,
        title: 'Mitochondrial Matrix',
        position: [2.0, 0.8, 2.0],
        rotationY: 0,
        assetType: 'pedestal_plaque',
      },
      {
        id: 'loc_b',
        cardId: 202,
        title: 'ATP Synthase Complex',
        position: [-2.0, 0.8, 2.0],
        rotationY: Math.PI,
        assetType: 'pedestal_plaque',
      },
    ]

    it('evaluates proximity when player walks within activation radius', () => {
      const session = new PalaceReviewSession(sessionLoci)
      expect(session.currentLocus?.id).toBe('loc_a')

      // Far away
      const farCheck = session.evaluateProximity([10, 1.6, 10])
      expect(farCheck.isInProximity).toBe(false)
      expect(farCheck.focusedLocus).toBeNull()

      // Close to loc_a
      const closeCheck = session.evaluateProximity([2.1, 1.6, 2.2])
      expect(closeCheck.isInProximity).toBe(true)
      expect(closeCheck.focusedLocus?.id).toBe('loc_a')
    })

    it('records review recall ratings and advances through the palace tour', () => {
      const session = new PalaceReviewSession(sessionLoci)

      // Review first locus
      const event1 = session.recordRecall('loc_a', 3, 1450, 1.2)
      expect(event1.cardId).toBe(201)
      expect(event1.rating).toBe(3)
      expect(session.completedCount).toBe(1)
      expect(session.currentLocus?.id).toBe('loc_b')

      // Review second locus
      session.recordRecall('loc_b', 4, 1100, 1.5)
      expect(session.completedCount).toBe(2)
      expect(session.isFinished).toBe(true)

      const summary = session.getSummary()
      expect(summary.totalReviewed).toBe(2)
      expect(summary.accuracyPct).toBe(100)
      expect(summary.averageLatencyMs).toBe(1275)
    })
  })
})
