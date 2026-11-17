import { describe, expect, it } from 'vitest'
import {
  GET as studyPlanGet,
  POST as studyPlanPost,
  DELETE as studyPlanDelete,
} from '../src/server/handlers/study-plan/route'

describe('Study Planner Matrix Integration Suite', () => {
  it('builds, saves, retrieves, and exports weekly study plan with ICS format', async () => {
    // 1. Build & save study plan
    const buildReq = new Request('http://localhost/api/study-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weeklyMinutes: 240,
        restDay: 0, // Sunday rest
      }),
    })

    const buildRes = await studyPlanPost(buildReq)
    expect(buildRes.status).toBe(200)
    const buildData = await buildRes.json()
    expect(buildData.ok).toBe(true)
    expect(buildData.plan).toBeDefined()
    expect(buildData.plan.weeklyMinutes).toBe(240)
    expect(buildData.plan.restDay).toBe(0)

    // 2. GET /api/study-plan returns saved plan and course metadata
    const getReq = new Request('http://localhost/api/study-plan', { method: 'GET' })
    const getRes = await studyPlanGet(getReq)
    expect(getRes.status).toBe(200)
    const getData = await getRes.json()
    expect(getData.savedPlan).toBeDefined()
    expect(getData.savedPlan.weeklyMinutes).toBe(240)
    expect(Array.isArray(getData.courses)).toBe(true)

    // 3. GET /api/study-plan?format=ics returns valid iCalendar file
    const icsReq = new Request('http://localhost/api/study-plan?format=ics', { method: 'GET' })
    const icsRes = await studyPlanGet(icsReq)
    expect(icsRes.status).toBe(200)
    expect(icsRes.headers.get('Content-Type')).toContain('text/calendar')
    const icsText = await icsRes.text()
    expect(icsText).toContain('BEGIN:VCALENDAR')
    expect(icsText).toContain('END:VCALENDAR')

    // 4. DELETE /api/study-plan removes the plan
    const deleteReq = new Request('http://localhost/api/study-plan', { method: 'DELETE' })
    const deleteRes = await studyPlanDelete(deleteReq)
    expect(deleteRes.status).toBe(200)
    const deleteData = await deleteRes.json()
    expect(deleteData.ok).toBe(true)

    // Verify removed
    const verifyReq = new Request('http://localhost/api/study-plan', { method: 'GET' })
    const verifyRes = await studyPlanGet(verifyReq)
    const verifyData = await verifyRes.json()
    expect(verifyData.savedPlan).toBeNull()
  })
})
