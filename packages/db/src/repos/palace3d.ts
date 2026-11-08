/**
 * Learning HUB — 3D Spatial Memory Palace DB Repository.
 */
import { asc, eq } from 'drizzle-orm'
import type { SpatialLocus } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { palace3dScenes, palaceItems, palaces } from '../schema'

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

/** The 2D palace a 3D scene belongs to (scenes FK onto `palaces`), or undefined. */
export function getPalaceForScene(
  palaceId: number,
  database?: LearningHubDB,
): typeof palaces.$inferSelect | undefined {
  const db = database ?? getDb()
  return db.select().from(palaces).where(eq(palaces.id, palaceId)).get()
}

/**
 * The palace's own loci (`palace_items`) in walk order, shaped for
 * `generateArchetypeLoci`: the item id keys the locus and the item's real card
 * link (or null) is kept — a 3D scene never invents card ids.
 */
export function listPalaceLociSources(
  palaceId: number,
  database?: LearningHubDB,
): Array<{ id: number; title: string; cardId: number | null }> {
  const db = database ?? getDb()
  return db
    .select({ id: palaceItems.id, title: palaceItems.name, cardId: palaceItems.cardId })
    .from(palaceItems)
    .where(eq(palaceItems.palaceId, palaceId))
    .orderBy(asc(palaceItems.lociIndex), asc(palaceItems.id))
    .all()
}
