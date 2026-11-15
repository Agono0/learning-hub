import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import * as palaceRoute from '../../../apps/web/app/api/palace/route'
import * as palace3dRoute from '../../../apps/web/app/api/spatial/palace-3d/route'

describe('Tier 3 E2E: Memory Palace Container & 3D Spatial Scene Synthesis', () => {
  it('creates palace container and synthesizes 3D spatial scene with locus coordinates', async () => {
    // 1. Create a memory palace with rooms
    const palaceRes = await callRoute<{
      ok: boolean
      palace: { id: number; name: string }
      items: unknown[]
    }>(palaceRoute.POST, {
      method: 'POST',
      body: {
        name: 'Classical Pantheon Memory Palace',
        description: 'Vast domed temple with perimeter alcoves for retrieval practice',
        rooms: [
          { name: 'Portico Columns', emoji: '🏛️' },
          { name: 'Rotunda Center', emoji: '⭕' },
          { name: 'Oculus Skylight', emoji: '☀️' },
        ],
      },
    })

    expect(palaceRes.status).toBe(201)
    expect(palaceRes.data.ok).toBe(true)
    const palaceId = palaceRes.data.palace.id
    expect(palaceId).toBeDefined()

    // 2. Query 3D scene preview for roman_villa archetype
    const previewRes = await callRoute<{
      ok: boolean
      persisted: boolean
      palaceName: string
      scene: {
        palaceId: number
        environmentArchetype: string
        spatialLoci: Array<{ id: string; x: number; y: number; z: number }>
      }
    }>(palace3dRoute.GET, {
      method: 'GET',
      query: { palaceId, archetype: 'roman_villa' },
    })

    expect(previewRes.status).toBe(200)
    expect(previewRes.data.ok).toBe(true)
    expect(previewRes.data.persisted).toBe(false)
    expect(previewRes.data.scene.environmentArchetype).toBe('roman_villa')
    expect(Array.isArray(previewRes.data.scene.spatialLoci)).toBe(true)

    // 3. Persist customized 3D scene
    const saveRes = await callRoute<{ ok: boolean; scene: { palaceId: number } }>(
      palace3dRoute.POST,
      {
        method: 'POST',
        body: {
          palaceId,
          title: 'Roman Villa Pantheon',
          environmentArchetype: 'roman_villa',
          cameraStartPos: { x: 0, y: 1.6, z: 4, pitch: 0, yaw: 0 },
          audioPanningEnabled: true,
          loci: [
            { id: 'locus-1', title: 'First Alcove', position: [-2.5, 1.2, 1.0] },
            { id: 'locus-2', title: 'Altar Center', position: [0, 1.0, 0] },
          ],
        },
      },
    )

    expect(saveRes.status).toBe(200)
    expect(saveRes.data.ok).toBe(true)

    // 4. Query back saved scene without archetype override (retrieves stored scene)
    const getSavedRes = await callRoute<{
      ok: boolean
      persisted: boolean
      scene: {
        palaceId: number
        environmentArchetype: string
        spatialLoci: Array<{ id: string; title?: string }>
      }
    }>(palace3dRoute.GET, {
      method: 'GET',
      query: { palaceId },
    })

    expect(getSavedRes.status).toBe(200)
    expect(getSavedRes.data.ok).toBe(true)
    expect(getSavedRes.data.persisted).toBe(true)
    expect(getSavedRes.data.scene.spatialLoci.length).toBe(2)
    expect(getSavedRes.data.scene.spatialLoci.some((l) => l.title === 'Altar Center')).toBe(true)
  })
})
