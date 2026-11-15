import { describe, it, expect } from 'vitest'
import { callRoute } from '../helpers/api-client'
import type { FocusSessionRow, FrictionEventRow, GoalRow, HabitRow } from '../helpers/rows'
import * as goalsRoute from '../../../apps/web/app/api/goals/route'
import * as focusRoute from '../../../apps/web/app/api/focus/route'
import * as focusIdRoute from '../../../apps/web/app/api/focus/[id]/route'
import * as frictionRoute from '../../../apps/web/app/api/friction/route'
import * as habitsRoute from '../../../apps/web/app/api/habits/route'
import * as checkinRoute from '../../../apps/web/app/api/habits/checkin/route'

describe('Tier 1: Focus Sessions, Goals, Friction & Habits API', () => {
  let sessionId: number
  let habitId: number

  it('creates and lists WOOP goals via /api/goals', async () => {
    const postRes = await callRoute<{ goal: GoalRow }>(goalsRoute.POST, {
      method: 'POST',
      body: {
        wish: 'Complete Spaced Repetition Research Paper',
        outcome: 'Deep understanding and published synthesis',
        obstacle: 'Phone notifications during deep focus blocks',
        ifThenPlan: 'If my phone rings, then I will silence it and continue',
      },
    })

    expect(postRes.status).toBe(201)
    expect(postRes.data.goal.id).toBeDefined()
    expect(postRes.data.goal.wish).toBe('Complete Spaced Repetition Research Paper')

    const getRes = await callRoute<{ goals: GoalRow[] }>(goalsRoute.GET)
    expect(getRes.status).toBe(200)
    expect(Array.isArray(getRes.data.goals)).toBe(true)
    expect(
      getRes.data.goals.some((g) => g.wish === 'Complete Spaced Repetition Research Paper'),
    ).toBe(true)
  })

  it('starts, logs distraction friction, and completes a focus session', async () => {
    // 1. Start session
    const startRes = await callRoute<{ session: FocusSessionRow }>(focusRoute.POST, {
      method: 'POST',
      body: {
        plannedMinutes: 25,
        type: 'pomodoro',
        task: 'FSRS scheduler implementation review',
      },
    })

    expect(startRes.status).toBe(201)
    expect(startRes.data.session.id).toBeDefined()
    expect(startRes.data.session.completed).toBe(false)
    sessionId = startRes.data.session.id

    // 2. Log friction event (distraction resisted: proceeded = false)
    const frictionRes = await callRoute<{ event: FrictionEventRow }>(frictionRoute.POST, {
      method: 'POST',
      body: {
        trigger: 'distraction',
        proceeded: false,
        sessionId,
      },
    })
    expect(frictionRes.status).toBe(201)
    expect(frictionRes.data.event.id).toBeDefined()
    expect(frictionRes.data.event.proceeded).toBe(false)

    // 3. Complete session
    const completeRes = await callRoute<{ session: FocusSessionRow; xpAwarded: number }>(
      focusIdRoute.PATCH,
      {
        method: 'PATCH',
        params: { id: String(sessionId) },
        body: {
          actualMinutes: 25,
          completed: true,
          leaks: 0,
          mood: 5,
          notes: 'High flow state throughout the session',
        },
      },
    )

    expect(completeRes.status).toBe(200)
    expect(completeRes.data.session.completed).toBe(true)
    expect(completeRes.data.xpAwarded).toBeGreaterThan(0)
  })

  it('never restores or pays XP for an abandoned session', async () => {
    const startRes = await callRoute<{ session: FocusSessionRow }>(focusRoute.POST, {
      method: 'POST',
      body: { plannedMinutes: 25, task: 'abandon me' },
    })
    const id = startRes.data.session.id

    // running while open
    expect(
      (await callRoute<{ running: FocusSessionRow | null }>(focusRoute.GET)).data.running?.id,
    ).toBe(id)

    // abandon it
    const abandon = await callRoute<{ session: FocusSessionRow; xpAwarded: number }>(
      focusIdRoute.PATCH,
      {
        method: 'PATCH',
        params: { id: String(id) },
        body: { actualMinutes: 3, completed: false },
      },
    )
    expect(abandon.data.xpAwarded).toBe(0)
    const endedAt = abandon.data.session.endedAt
    expect(endedAt).toBeTruthy()

    // no longer "running", so the page won't restore it on reload
    expect(
      (await callRoute<{ running: FocusSessionRow | null }>(focusRoute.GET)).data.running,
    ).toBeNull()

    // a late "completed" PATCH (stale tab / restored timer) pays nothing and keeps it ended
    const late = await callRoute<{ session: FocusSessionRow; xpAwarded: number }>(
      focusIdRoute.PATCH,
      {
        method: 'PATCH',
        params: { id: String(id) },
        body: { completed: true, mood: 4 },
      },
    )
    expect(late.status).toBe(200)
    expect(late.data.xpAwarded).toBe(0)
    expect(late.data.session.completed).toBe(false)
    expect(late.data.session.endedAt).toBe(endedAt)
    expect(late.data.session.mood).toBe(4) // mood/notes can still be added
  })

  it('creates a habit and performs daily check-in', async () => {
    // 1. Create habit
    const createRes = await callRoute<{ habit: HabitRow }>(habitsRoute.POST, {
      method: 'POST',
      body: {
        name: 'Evening Journaling',
        cue: 'After closing laptop at 6 PM',
        cueType: 'time',
        craving: 'Clarity of mind before dinner',
        response: 'Write 3 small wins and 1 gratitude',
        reward: 'Feeling grounded and accomplished',
      },
    })

    expect(createRes.status).toBe(201)
    expect(createRes.data.habit.id).toBeDefined()
    expect(createRes.data.habit.name).toBe('Evening Journaling')
    habitId = createRes.data.habit.id

    // 2. Perform check-in
    const checkinRes = await callRoute<{ ok: boolean; alreadyDone: boolean; xpAwarded: number }>(
      checkinRoute.POST,
      {
        method: 'POST',
        body: {
          habitId,
          note: 'Completed successfully',
        },
      },
    )

    expect(checkinRes.status).toBe(201)
    expect(checkinRes.data.ok).toBe(true)
    expect(checkinRes.data.alreadyDone).toBe(false)
    expect(checkinRes.data.xpAwarded).toBeGreaterThan(0)

    // 3. Second check-in on same day is idempotent
    const checkinAgain = await callRoute<{ ok: boolean; alreadyDone: boolean; xpAwarded: number }>(
      checkinRoute.POST,
      {
        method: 'POST',
        body: { habitId },
      },
    )
    expect(checkinAgain.status).toBe(200)
    expect(checkinAgain.data.alreadyDone).toBe(true)
  })
})
