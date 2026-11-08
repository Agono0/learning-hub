/**
 * Learning HUB — 3D Spatial Memory Palace & WebXR Engine Core Domain.
 *
 * Implements:
 * 1. 3D Spatial Loci positioning, coordinate math, and room archetypes (Simonides 477 BC; Dresler 2017).
 * 2. 3D Spatial Audio gain and stereo panning calculations for WebXR / Web Audio.
 * 3. Procedural spatial layout generators for Classical Villa, Modern Gallery, and Cyber Sanctum.
 */
import { z } from 'zod'

export type EnvironmentArchetype = 'roman_villa' | 'modern_gallery' | 'cyber_sanctum'

export const spatialVector3Schema = z.tuple([z.number(), z.number(), z.number()])
export type SpatialVector3 = z.infer<typeof spatialVector3Schema>

export const spatialLocusSchema = z.object({
  id: z.string().min(1),
  cardId: z.number().int().positive().optional(),
  title: z.string().default('Locus Anchor'),
  position: spatialVector3Schema, // [x, y, z] in meters
  rotationY: z.number().default(0), // Yaw angle in radians
  assetType: z
    .enum(['pedestal_plaque', 'wall_canvas', 'holographic_orb'])
    .default('pedestal_plaque'),
  contentPreview: z.string().optional(),
})
export type SpatialLocus = z.infer<typeof spatialLocusSchema>

export const palace3dSceneSchema = z.object({
  palaceId: z.number().int().positive(),
  title: z.string().min(1),
  environmentArchetype: z
    .enum(['roman_villa', 'modern_gallery', 'cyber_sanctum'])
    .default('roman_villa'),
  cameraStartPos: z.object({
    x: z.number().default(0),
    y: z.number().default(1.6), // Standard standing eye height (1.6m)
    z: z.number().default(5),
    pitch: z.number().default(0),
    yaw: z.number().default(0),
  }),
  loci: z.array(spatialLocusSchema).default([]),
  audioPanningEnabled: z.boolean().default(true),
})
export type Palace3dScene = z.infer<typeof palace3dSceneSchema>

// ─── Spatial Audio Positioning Math ─────────────────────────────────────────

export interface SpatialAudioAttenuation {
  distance: number // Distance in meters
  gain: number // Attenuation factor [0.0, 1.0]
  stereoPan: number // Stereo panning factor [-1.0 (Left) to +1.0 (Right)]
}

/**
 * Calculates distance attenuation (inverse square law clamped) and stereo pan
 * from camera to a spatial locus.
 */
export function calculateSpatialAudioAttenuation(
  cameraPos: SpatialVector3,
  cameraYaw: number,
  locusPos: SpatialVector3,
  referenceDistance = 2.0,
  maxDistance = 20.0,
): SpatialAudioAttenuation {
  const dx = locusPos[0] - cameraPos[0]
  const dy = locusPos[1] - cameraPos[1]
  const dz = locusPos[2] - cameraPos[2]

  const distance = Math.max(0.1, Math.sqrt(dx * dx + dy * dy + dz * dz))

  // Inverse distance clamped model
  let gain = 1.0
  if (distance > referenceDistance) {
    gain = referenceDistance / (referenceDistance + 1.2 * (distance - referenceDistance))
  }
  if (distance >= maxDistance) {
    gain = 0.0
  }
  const clampedGain = Math.max(0.0, Math.min(1.0, Math.round(gain * 100) / 100))

  // Stereo pan relative to camera orientation yaw
  // Rotate (dx, dz) into camera local coordinates
  const cosYaw = Math.cos(-cameraYaw)
  const sinYaw = Math.sin(-cameraYaw)
  const localX = dx * cosYaw - dz * sinYaw
  const localZ = dx * sinYaw + dz * cosYaw

  // Normalize local horizontal angle to pan factor [-1.0, 1.0]
  const angle = Math.atan2(localX, Math.max(0.1, localZ))
  const stereoPan = Math.max(-1.0, Math.min(1.0, Math.sin(angle)))

  return {
    distance: Math.round(distance * 100) / 100,
    gain: clampedGain,
    stereoPan: Math.round(stereoPan * 100) / 100,
  }
}

// ─── Procedural Spatial Scene Layout Generators ─────────────────────────────

/**
 * Generates an architectural 3D spatial loci layout for cards in a room archetype.
 */
export function generateArchetypeLoci(
  archetype: EnvironmentArchetype,
  cards: Array<{ id: number; title: string }>,
): SpatialLocus[] {
  const loci: SpatialLocus[] = []

  switch (archetype) {
    case 'roman_villa': {
      // Peristyle courtyard layout: pedestals arranged along colonnade perimeter
      const radius = 6.0
      const count = cards.length
      for (let i = 0; i < count; i++) {
        const theta = (i / Math.max(1, count)) * 2 * Math.PI
        const x = Math.round(Math.cos(theta) * radius * 100) / 100
        const z = Math.round(Math.sin(theta) * radius * 100) / 100
        loci.push({
          id: `locus-villa-${cards[i].id}`,
          cardId: cards[i].id,
          title: cards[i].title,
          position: [x, 0.8, z],
          rotationY: theta + Math.PI / 2,
          assetType: 'pedestal_plaque',
          contentPreview: cards[i].title,
        })
      }
      break
    }
    case 'modern_gallery': {
      // Linear dual-wall exhibition hall: left wall (-3.5m) and right wall (+3.5m)
      const spacing = 3.0
      for (let i = 0; i < cards.length; i++) {
        const isLeft = i % 2 === 0
        const x = isLeft ? -3.5 : 3.5
        const z = -Math.floor(i / 2) * spacing
        loci.push({
          id: `locus-gallery-${cards[i].id}`,
          cardId: cards[i].id,
          title: cards[i].title,
          position: [x, 1.6, z],
          rotationY: isLeft ? Math.PI / 2 : -Math.PI / 2,
          assetType: 'wall_canvas',
          contentPreview: cards[i].title,
        })
      }
      break
    }
    case 'cyber_sanctum': {
      // Cylindrical holographic array floating in concentric arcs
      const count = cards.length
      for (let i = 0; i < count; i++) {
        const tier = Math.floor(i / 8)
        const radius = 4.5 + tier * 2.0
        const indexInTier = i % 8
        const theta = (indexInTier / 8) * 2 * Math.PI
        const x = Math.round(Math.cos(theta) * radius * 100) / 100
        const y = Math.round((1.2 + tier * 0.8 + Math.sin(indexInTier) * 0.2) * 100) / 100
        const z = Math.round(Math.sin(theta) * radius * 100) / 100
        loci.push({
          id: `locus-cyber-${cards[i].id}`,
          cardId: cards[i].id,
          title: cards[i].title,
          position: [x, y, z],
          rotationY: -theta,
          assetType: 'holographic_orb',
          contentPreview: cards[i].title,
        })
      }
      break
    }
  }

  return loci
}
