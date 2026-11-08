import { describe, expect, it } from 'vitest'
import { calculateSpatialAudioAttenuation, generateArchetypeLoci } from '../src/spatial'

describe('3D Spatial Memory Palace Domain', () => {
  describe('calculateSpatialAudioAttenuation', () => {
    it('provides full gain when camera is at the locus anchor', () => {
      const cameraPos: [number, number, number] = [0, 1.6, 0]
      const locusPos: [number, number, number] = [0, 1.6, 1.0] // 1 meter away
      const att = calculateSpatialAudioAttenuation(cameraPos, 0, locusPos)

      expect(att.gain).toBe(1.0)
      expect(att.distance).toBe(1.0)
      expect(att.stereoPan).toBe(0.0) // Dead ahead
    })

    it('pans audio to the right when locus is on the right of camera yaw', () => {
      const cameraPos: [number, number, number] = [0, 1.6, 0]
      const locusPos: [number, number, number] = [5.0, 1.6, 0] // 5m to the right (x=5)
      const att = calculateSpatialAudioAttenuation(cameraPos, 0, locusPos)

      expect(att.stereoPan).toBeGreaterThan(0.7) // Panned right
      expect(att.gain).toBeLessThan(1.0) // Attenuated with distance
    })

    it('pans audio to the left when locus is on the left', () => {
      const cameraPos: [number, number, number] = [0, 1.6, 0]
      const locusPos: [number, number, number] = [-5.0, 1.6, 0] // 5m to the left (x=-5)
      const att = calculateSpatialAudioAttenuation(cameraPos, 0, locusPos)

      expect(att.stereoPan).toBeLessThan(-0.7) // Panned left
    })
  })

  describe('generateArchetypeLoci', () => {
    const cards = [
      { id: 10, title: 'Concept Alpha' },
      { id: 20, title: 'Concept Beta' },
      { id: 30, title: 'Concept Gamma' },
      { id: 40, title: 'Concept Delta' },
    ]

    it('generates circular peristyle loci for roman_villa archetype', () => {
      const loci = generateArchetypeLoci('roman_villa', cards)
      expect(loci.length).toBe(4)
      expect(loci[0].assetType).toBe('pedestal_plaque')
      // Positions should have non-zero x/z along radius 6m
      expect(Math.abs(loci[0].position[0]) + Math.abs(loci[0].position[2])).toBeGreaterThan(0)
    })

    it('generates dual-wall gallery loci for modern_gallery archetype', () => {
      const loci = generateArchetypeLoci('modern_gallery', cards)
      expect(loci.length).toBe(4)
      expect(loci[0].assetType).toBe('wall_canvas')
      // Alternates between left (-3.5m) and right (+3.5m) walls
      expect(loci[0].position[0]).toBe(-3.5)
      expect(loci[1].position[0]).toBe(3.5)
    })

    it('generates concentric holographic tiers for cyber_sanctum archetype', () => {
      const loci = generateArchetypeLoci('cyber_sanctum', cards)
      expect(loci.length).toBe(4)
      expect(loci[0].assetType).toBe('holographic_orb')
    })
  })
})
