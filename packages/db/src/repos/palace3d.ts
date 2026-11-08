/**
 * Learning HUB — 3D Spatial Memory Palace DB Repository.
 */
import { eq } from 'drizzle-orm'
import type { SpatialLocus } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { palace3dScenes } from '../schema'

export function upsertPalace3dScene(
  scene: {
    palaceId: number
    environmentArchetype?: string
    cameraStartPos?: { x: number; y: number; z: number; pitch: number; yaw: number }
    walkPath?: Array<[number, number, number]>
    spatialLoci: SpatialLocus[]
    audioPanningEnabled?: boolean
  },
  database?: LearningHubDB,
): typeof palace3dScenes.$inferSelect {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(palace3dScenes)
    .values({
      palaceId: scene.palaceId,
      environmentArchetype: scene.environmentArchetype ?? 'roman_villa',
      cameraStartPos: scene.cameraStartPos,
      walkPath: scene.walkPath,
      spatialLoci: scene.spatialLoci,
      audioPanningEnabled: scene.audioPanningEnabled ?? true,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: palace3dScenes.palaceId,
      set: {
        environmentArchetype: scene.environmentArchetype ?? 'roman_villa',
        cameraStartPos: scene.cameraStartPos,
        walkPath: scene.walkPath,
        spatialLoci: scene.spatialLoci,
        audioPanningEnabled: scene.audioPanningEnabled ?? true,
        updatedAt: nowIso,
      },
    })
    .returning()
    .all()

  return row!
}

export function getPalace3dScene(
  palaceId: number,
  database?: LearningHubDB,
): typeof palace3dScenes.$inferSelect | undefined {
  const db = database ?? getDb()
  return db.select().from(palace3dScenes).where(eq(palace3dScenes.palaceId, palaceId)).get()
}
