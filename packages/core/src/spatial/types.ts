/**
 * Learning HUB — Spatial Memory Palace types and Zod schemas.
 *
 * Leaf module: only depends on zod, never on the barrel. The engines
 * (`./palace-engine`, `./spatial-rotation-engine`) and `./index` all import
 * from here so no module self-barrels through `./index` (load-order fragile).
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
