import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addRoutineStep,
  createDistractionApp,
  createRoutine,
  deleteDistractionApp,
  deleteRoutine,
  deleteRoutineStep,
  distractionApps,
  getDistractionApp,
  getRoutine,
  initDb,
  listDistractionApps,
  listRoutines,
  routines,
  routineSteps,
  setDb,
  updateRoutine,
  updateRoutineStep,
  type LearningHubDB,
} from '../src/index'

let testDb: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-focus-extras-'))
  testDb = await initDb({ path: join(tmp, 'focus-extras.db') })
  setDb(testDb)
})

beforeEach(() => {
  testDb.delete(routineSteps).run()
  testDb.delete(routines).run()
  testDb.delete(distractionApps).run()
})

afterAll(() => {
  try {
    ;(testDb as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

describe('focus-extras repository — distraction apps', () => {
  it('creates, retrieves, lists, and deletes distraction apps', () => {
    const created = createDistractionApp({
      name: 'DoomScroll App',
      kind: 'app',
    })
    expect(created).not.toBeNull()
    expect(created?.name).toBe('DoomScroll App')
    expect(created?.kind).toBe('app')

    // Conflict detection: duplicate name returns null
    const duplicate = createDistractionApp({
      name: 'DoomScroll App',
      kind: 'app',
    })
    expect(duplicate).toBeNull()

    const retrieved = getDistractionApp(created!.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.id).toBe(created!.id)

    const list = listDistractionApps()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created!.id)

    const deleted = deleteDistractionApp(created!.id)
    expect(deleted).toBe(true)
    expect(getDistractionApp(created!.id)).toBeNull()
  })
})

describe('focus-extras repository — routines and steps', () => {
  it('creates routines with nested steps atomically and lists them', () => {
    const routine = createRoutine({
      name: 'Morning Prime',
      steps: [
        { name: 'Hydrate & Light', minutes: 5, order: 0 },
        { name: 'Quick Review', minutes: 15, order: 1 },
      ],
    })

    expect(routine.id).toBeGreaterThan(0)
    expect(routine.name).toBe('Morning Prime')
    expect(routine.steps).toHaveLength(2)
    expect(routine.steps[0].name).toBe('Hydrate & Light')
    expect(routine.steps[1].minutes).toBe(15)

    const fetched = getRoutine(routine.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.steps).toHaveLength(2)

    const all = listRoutines()
    expect(all).toHaveLength(1)
    expect(all[0].steps).toHaveLength(2)

    // Add another step
    const addedStep = addRoutineStep(routine.id, {
      name: 'Journal Reflection',
      minutes: 10,
      order: 2,
    })
    expect(addedStep.id).toBeGreaterThan(0)

    const updatedFetched = getRoutine(routine.id)
    expect(updatedFetched?.steps).toHaveLength(3)

    // Update routine and step
    const updatedRoutine = updateRoutine(routine.id, { name: 'Morning Protocol' })
    expect(updatedRoutine?.name).toBe('Morning Protocol')

    const updatedStep = updateRoutineStep(addedStep.id, { minutes: 12 })
    expect(updatedStep?.minutes).toBe(12)

    // Delete single step
    deleteRoutineStep(addedStep.id)
    expect(getRoutine(routine.id)?.steps).toHaveLength(2)

    // Delete routine cascades to all steps
    const deleted = deleteRoutine(routine.id)
    expect(deleted).toBe(true)
    expect(getRoutine(routine.id)).toBeNull()
    expect(listRoutines()).toHaveLength(0)
  })
})
