/**
 * Learning HUB — 3D Spatial Memory Palace & WebXR Engine Core Domain.
 *
 * Implements:
 * 1. 3D Spatial Loci positioning, coordinate math, and room archetypes (Simonides 477 BC; Dresler 2017).
 * 2. 3D Spatial Audio gain and stereo panning calculations for WebXR / Web Audio.
 * 3. Procedural spatial layout generators for Classical Villa, Modern Gallery, and Cyber Sanctum.
 */
import { z } from 'zod'

export type EnvironmentArchetype =
  'roman_villa' | 'modern_gallery' | 'cyber_sanctum' | 'renaissance_library' | 'zen_monastery'

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
    .enum([
      'roman_villa',
      'modern_gallery',
      'cyber_sanctum',
      'renaissance_library',
      'zen_monastery',
    ])
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

  // Stereo pan = sine of the source's azimuth relative to where the camera faces.
  // Convention (three.js): yaw is rotation about +Y; yaw 0 looks down -Z, so the
  // camera's right vector is (cos yaw, 0, -sin yaw). Projecting the horizontal
  // offset onto it and dividing by the horizontal distance gives sin(azimuth):
  // +1 hard right, -1 hard left, 0 straight ahead or behind.
  const yaw = Number.isFinite(cameraYaw) ? cameraYaw : 0
  const rightComponent = dx * Math.cos(yaw) - dz * Math.sin(yaw)
  const horizontal = Math.sqrt(dx * dx + dz * dz)
  const stereoPan = horizontal < 1e-6 ? 0 : Math.max(-1, Math.min(1, rightComponent / horizontal))

  return {
    distance: Math.round(distance * 100) / 100,
    gain: clampedGain,
    // `+ 0` normalises -0 (a source dead behind) to 0.
    stereoPan: Math.round(stereoPan * 100) / 100 + 0,
  }
}

/**
 * Walk the camera relative to where it faces (same three.js yaw convention as
 * {@link calculateSpatialAudioAttenuation}): `forward` metres along the view
 * direction (-Z at yaw 0) and `strafe` metres to the right. Height is unchanged;
 * x/z are rounded to centimetres and clamped to ±`bound` so the walker stays on
 * the floor plane.
 */
export function moveAlongYaw(
  position: SpatialVector3,
  yaw: number,
  forward: number,
  strafe: number,
  bound = 14,
): SpatialVector3 {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  const rx = Math.cos(yaw)
  const rz = -Math.sin(yaw)
  const clamp = (v: number) => Math.max(-bound, Math.min(bound, Math.round(v * 100) / 100))
  return [
    clamp(position[0] + fx * forward + rx * strafe) + 0,
    position[1],
    clamp(position[2] + fz * forward + rz * strafe) + 0,
  ]
}

// ─── Procedural Spatial Scene Layout Generators ─────────────────────────────

/** One thing to place in a palace: its stable id, label and (optional) linked card. */
export interface LocusSource {
  id: number
  title: string
  /**
   * Linked review card. Omitted → `id` is treated as the card id (the original
   * card-list call shape); `null` → the locus has no card.
   */
  cardId?: number | null
}

/** The card a source links to, per {@link LocusSource.cardId}'s rules. */
function linkedCardId(src: LocusSource): number | undefined {
  if (src.cardId === undefined) return src.id
  return src.cardId ?? undefined
}

/**
 * Generates an architectural 3D spatial loci layout for cards in a room archetype.
 * Deterministic: same archetype + sources → same coordinates (loci never jump
 * between visits, which would break the spatial memory they exist to build).
 */
export function generateArchetypeLoci(
  archetype: EnvironmentArchetype,
  sources: LocusSource[],
): SpatialLocus[] {
  const cards = sources.map((s) => ({
    id: s.id,
    title: s.title || 'Locus Anchor',
    cardId: linkedCardId(s),
  }))
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
          id: `locus-villa-${cards[i]!.id}`,
          ...(cards[i]!.cardId !== undefined ? { cardId: cards[i]!.cardId } : {}),
          title: cards[i]!.title,
          position: [x, 0.8, z],
          rotationY: theta + Math.PI / 2,
          assetType: 'pedestal_plaque',
          contentPreview: cards[i]!.title,
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
          id: `locus-gallery-${cards[i]!.id}`,
          ...(cards[i]!.cardId !== undefined ? { cardId: cards[i]!.cardId } : {}),
          title: cards[i]!.title,
          position: [x, 1.6, z],
          rotationY: isLeft ? Math.PI / 2 : -Math.PI / 2,
          assetType: 'wall_canvas',
          contentPreview: cards[i]!.title,
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
          id: `locus-cyber-${cards[i]!.id}`,
          ...(cards[i]!.cardId !== undefined ? { cardId: cards[i]!.cardId } : {}),
          title: cards[i]!.title,
          position: [x, y, z],
          rotationY: -theta,
          assetType: 'holographic_orb',
          contentPreview: cards[i]!.title,
        })
      }
      break
    }
    case 'renaissance_library': {
      // Tiered alcove reading carrels along perpendicular library wings
      const count = cards.length
      for (let i = 0; i < count; i++) {
        const wing = i % 4 // 4 cardinal wings
        const depth = Math.floor(i / 4) * 2.8 + 3.0
        let x = 0
        let z = 0
        let yaw = 0
        if (wing === 0) {
          x = -depth
          z = -2.5
          yaw = Math.PI / 2
        } else if (wing === 1) {
          x = depth
          z = -2.5
          yaw = -Math.PI / 2
        } else if (wing === 2) {
          x = -2.5
          z = depth
          yaw = 0
        } else {
          x = 2.5
          z = depth
          yaw = Math.PI
        }
        loci.push({
          id: `locus-library-${cards[i]!.id}`,
          ...(cards[i]!.cardId !== undefined ? { cardId: cards[i]!.cardId } : {}),
          title: cards[i]!.title,
          position: [Math.round(x * 100) / 100, 1.2, Math.round(z * 100) / 100],
          rotationY: yaw,
          assetType: 'pedestal_plaque',
          contentPreview: cards[i]!.title,
        })
      }
      break
    }
    case 'zen_monastery': {
      // Stepping stone perimeter path encircling a central contemplation garden
      const count = cards.length
      const r = 7.0
      for (let i = 0; i < count; i++) {
        const phi = (i / Math.max(1, count)) * 2 * Math.PI
        const x = Math.round(Math.cos(phi) * r * 100) / 100
        const z = Math.round(Math.sin(phi) * r * 100) / 100
        loci.push({
          id: `locus-zen-${cards[i]!.id}`,
          ...(cards[i]!.cardId !== undefined ? { cardId: cards[i]!.cardId } : {}),
          title: cards[i]!.title,
          position: [x, 0.6, z],
          rotationY: phi + Math.PI,
          assetType: 'wall_canvas',
          contentPreview: cards[i]!.title,
        })
      }
      break
    }
  }

  return loci
}

export * from './palace-engine'
export * from './spatial-rotation-engine'
