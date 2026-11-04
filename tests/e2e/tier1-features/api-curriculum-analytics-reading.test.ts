import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import * as curriculumRoute from '../../../apps/web/app/api/curriculum/route'
import * as analyticsRoute from '../../../apps/web/app/api/analytics/route'
import * as readingRoute from '../../../apps/web/app/api/reading/route'
import * as highlightsRoute from '../../../apps/web/app/api/reading/highlights/route'
import * as achievementsRoute from '../../../apps/web/app/api/achievements/route'
import * as settingsRoute from '../../../apps/web/app/api/settings/route'
import * as streaksRoute from '../../../apps/web/app/api/streaks/route'
import { db, tracks, courses, units, lessons } from '@learning-hub/db'

describe('Tier 1: Curriculum, Analytics, Reading & System APIs', () => {
  let createdSourceId: number
  let createdHighlightId: number

  it('queries curriculum tree and marks a lesson complete', async () => {
    // Ensure at least one track/course/unit/lesson exists for test
    const [track] = await db.insert(tracks).values({ title: 'Cognitive Science' }).returning()
    const [course] = await db.insert(courses).values({ trackId: track!.id, title: 'Memory Architecture' }).returning()
    const [unit] = await db.insert(units).values({ courseId: course!.id, title: 'Spaced Retrieval' }).returning()
    const [lesson] = await db.insert(lessons).values({ unitId: unit!.id, title: 'FSRS Formulae' }).returning()

    const treeRes = await callRoute(curriculumRoute.GET)
    expect(treeRes.status).toBe(200)
    expect(Array.isArray(treeRes.data.tracks)).toBe(true)

    const patchRes = await callRoute(curriculumRoute.PATCH, {
      method: 'PATCH',
      body: { lessonId: lesson!.id, complete: true },
    })
    expect(patchRes.status).toBe(200)
    expect(patchRes.data.ok).toBe(true)
    expect(patchRes.data.completed).toBe(true)
  })

  it('fetches comprehensive learning analytics via GET /api/analytics', async () => {
    const res = await callRoute(analyticsRoute.GET)

    expect(res.status).toBe(200)
    expect(res.data.forecast).toBeDefined()
    expect(res.data.calibration).toBeDefined()
    expect(res.data.heatmap).toBeDefined()
    expect(res.data.timeOfDay).toBeDefined()
    expect(res.data.learningScore).toBeDefined()
  })

  it('manages reading library and extracts/triages highlights', async () => {
    // 1. Add reading source
    const postSrc = await callRoute(readingRoute.POST, {
      method: 'POST',
      body: {
        title: 'Ebbinghaus Forgetting Curve (1885)',
        kind: 'paste',
        content:
          'Research shows that memory decay is exponential because review is omitted. The first principle of spaced retrieval was discovered in 1885.',
      },
    })
    expect(postSrc.status).toBe(200)
    expect(postSrc.data.source.id).toBeDefined()
    createdSourceId = postSrc.data.source.id

    // 2. Extract highlights
    const postHl = await callRoute(highlightsRoute.POST, {
      method: 'POST',
      body: {
        sourceId: createdSourceId,
        max: 5,
      },
    })
    expect(postHl.status).toBe(200)
    expect(postHl.data.ok).toBe(true)
    expect(postHl.data.created).toBeGreaterThanOrEqual(1)

    // 3. List highlights for this source
    const listHl = await callRoute(highlightsRoute.GET, {
      query: { sourceId: createdSourceId },
    })
    expect(listHl.status).toBe(200)
    expect(listHl.data.highlights.length).toBeGreaterThanOrEqual(1)
    createdHighlightId = listHl.data.highlights[0].id

    // 4. Triage highlight: keep
    const patchHl = await callRoute(highlightsRoute.PATCH, {
      method: 'PATCH',
      body: {
        id: createdHighlightId,
        action: 'keep',
      },
    })
    expect(patchHl.status).toBe(200)
    expect(patchHl.data.ok).toBe(true)
    expect(patchHl.data.triaged).toBe(1)
  })

  it('retrieves achievements catalog with real-time aggregates', async () => {
    const res = await callRoute(achievementsRoute.GET)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.catalog)).toBe(true)
    expect(res.data.catalog.length).toBeGreaterThanOrEqual(5)
    expect(res.data.stats).toBeDefined()
    expect(typeof res.data.stats.totalReviews).toBe('number')
  })

  it('retrieves and updates user settings', async () => {
    const getRes = await callRoute(settingsRoute.GET)
    expect(getRes.status).toBe(200)
    expect(getRes.data.settings).toBeDefined()

    const putRes = await callRoute(settingsRoute.PUT, {
      method: 'PUT',
      body: {
        desiredRetention: 0.88,
        sessionMinutes: 20,
        theme: 'dark',
      },
    })
    expect(putRes.status).toBe(200)
    expect(putRes.data.ok).toBe(true)
    expect(putRes.data.settings.desiredRetention).toBe(0.88)
    expect(putRes.data.settings.sessionMinutes).toBe(20)
    expect(putRes.data.settings.theme).toBe('dark')
  })

  it('fetches streak level and records daily activity', async () => {
    const getRes = await callRoute(streaksRoute.GET)
    expect(getRes.status).toBe(200)
    expect(getRes.data.streak).toBeDefined()
    expect(getRes.data.xp).toBeDefined()

    const postRes = await callRoute(streaksRoute.POST)
    expect(postRes.status).toBe(200)
    expect(postRes.data.ok).toBe(true)
    expect(postRes.data.streak).toBeDefined()
  })
})
