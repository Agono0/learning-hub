/**
 * /api/spatial/palace-3d — 3D Spatial Memory Palace scenes, archetypes & loci layout.
 */
import { z } from 'zod'
import { generateArchetypeLoci, palace3dSceneSchema } from '@learning-hub/core'
import { getPalace3dScene, upsertPalace3dScene } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const palaceId = url.searchParams.get('palaceId')
    ? Number(url.searchParams.get('palaceId'))
    : undefined

  if (!palaceId) {
    return Response.json({ ok: false, error: 'palaceId query parameter required' }, { status: 400 })
  }

  let scene = getPalace3dScene(palaceId)

  // If no scene saved yet, generate an initial default layout
  if (!scene) {
    const defaultCards = [
      { id: 1, title: 'Atrium Entrance' },
      { id: 2, title: 'Central Fountain' },
      { id: 3, title: 'Library Alcove' },
      { id: 4, title: 'Peristyle Garden' },
      { id: 5, title: 'Treasury Vault' },
    ]
    const loci = generateArchetypeLoci('roman_villa', defaultCards)
    scene = upsertPalace3dScene({
      palaceId,
      environmentArchetype: 'roman_villa',
      cameraStartPos: { x: 0, y: 1.6, z: 5, pitch: 0, yaw: 0 },
      spatialLoci: loci,
      audioPanningEnabled: true,
    })
  }

  return Response.json({
    ok: true,
    scene,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, palace3dSceneSchema)

  const saved = upsertPalace3dScene({
    palaceId: body.palaceId,
    environmentArchetype: body.environmentArchetype,
    cameraStartPos: body.cameraStartPos,
    spatialLoci: body.loci,
    audioPanningEnabled: body.audioPanningEnabled,
  })

  return Response.json({
    ok: true,
    scene: saved,
  })
})
