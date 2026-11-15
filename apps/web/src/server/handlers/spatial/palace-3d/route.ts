/**
 * /api/spatial/palace-3d — 3D Spatial Memory Palace scenes, archetypes & loci layout.
 *
 * A 3D scene is a view of an existing 2D palace (`palaces` + `palace_items`):
 * its loci are the palace's own items with their real card links.
 *
 * GET `?palaceId=` → the saved scene, or (unsaved) a layout generated from the
 *     palace's items. `&archetype=` → a fresh layout in that archetype (preview
 *     only — nothing is written until POST). GET never writes.
 * POST → save a scene (404 when the palace does not exist).
 */
import { z } from 'zod'
import { generateArchetypeLoci, palace3dSceneSchema } from '@learning-hub/core'
import {
  getPalace3dScene,
  getPalaceForScene,
  listPalaceLociSources,
  upsertPalace3dScene,
} from '@learning-hub/db'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'

const archetypeSchema = z.enum(['roman_villa', 'modern_gallery', 'cyber_sanctum'])

const sceneQuerySchema = z.object({
  palaceId: z.coerce.number().int().positive(),
  archetype: archetypeSchema.optional(),
})

const DEFAULT_CAMERA = { x: 0, y: 1.6, z: 5, pitch: 0, yaw: 0 }

export const GET = withRoute(async (req: Request) => {
  const { palaceId, archetype } = readQuery(req, sceneQuerySchema)
  const palace = getPalaceForScene(palaceId)
  if (!palace) throw new ApiError(404, 'palace not found')

  const saved = getPalace3dScene(palaceId)
  if (saved && !archetype) {
    return Response.json({ ok: true, persisted: true, palaceName: palace.name, scene: saved })
  }

  const environmentArchetype = archetype ?? 'roman_villa'
  const scene = {
    palaceId,
    environmentArchetype,
    cameraStartPos: saved?.cameraStartPos ?? DEFAULT_CAMERA,
    spatialLoci: generateArchetypeLoci(environmentArchetype, listPalaceLociSources(palaceId)),
    audioPanningEnabled: saved?.audioPanningEnabled ?? true,
  }
  return Response.json({ ok: true, persisted: false, palaceName: palace.name, scene })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, palace3dSceneSchema)
  if (!getPalaceForScene(body.palaceId)) throw new ApiError(404, 'palace not found')

  const saved = upsertPalace3dScene({
    palaceId: body.palaceId,
    environmentArchetype: body.environmentArchetype,
    cameraStartPos: body.cameraStartPos,
    spatialLoci: body.loci,
    audioPanningEnabled: body.audioPanningEnabled,
  })

  return Response.json({ ok: true, persisted: true, scene: saved })
})
