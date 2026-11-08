import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
import { backupAll } from '../src/backup'
import { mergeBackup } from '../src/sync'
import { generateTmrEarcon } from '@learning-hub/core'

function createDeviceDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema })
  return { sqlite, raw, db }
}

describe('Cognitive tables sync & merge semantics', () => {
  it('unions append-only cognitive telemetry and circadian sessions across two devices', () => {
    const devA = createDeviceDb()
    const devB = createDeviceDb()

    // Shared deck + card
    devA.db.insert(schema.decks).values({ id: 1, name: 'Neuroscience' }).run()
    devA.db
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        content: { basic: { front: 'What is LTP?', back: 'Long term potentiation' } },
        type: 'basic',
        due: '2026-01-01',
      })
      .run()

    devB.db.insert(schema.decks).values({ id: 1, name: 'Neuroscience' }).run()
    devB.db
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        content: { basic: { front: 'What is LTP?', back: 'Long term potentiation' } },
        type: 'basic',
        due: '2026-01-01',
      })
      .run()

    // Device A logs a telemetry event and a circadian session
    devA.db
      .insert(schema.cognitiveTelemetryEvents)
      .values({
        id: 1,
        cardId: 1,
        responseLatencyMs: 1450,
        estimatedCli: 0.42,
        flowZone: 'optimal_flow',
        createdAt: '2026-11-08T10:00:00.000Z',
      })
      .run()

    devA.db
      .insert(schema.circadianAudioSessions)
      .values({
        id: 1,
        sessionMode: 'commute',
        deckId: 1,
        cardsReviewed: 10,
        durationSeconds: 300,
        binauralMode: 'gamma_40hz',
        createdAt: '2026-11-08T10:05:00.000Z',
      })
      .run()

    // Device B logs different telemetry and circadian session
    devB.db
      .insert(schema.cognitiveTelemetryEvents)
      .values({
        id: 1, // Same local autoincrement ID on device B!
        cardId: 1,
        responseLatencyMs: 2800,
        estimatedCli: 0.85,
        flowZone: 'overload',
        createdAt: '2026-11-08T11:00:00.000Z',
      })
      .run()

    devB.db
      .insert(schema.circadianAudioSessions)
      .values({
        id: 1, // Same local autoincrement ID on device B!
        sessionMode: 'wind_down',
        deckId: 1,
        cardsReviewed: 5,
        durationSeconds: 150,
        binauralMode: 'alpha_10hz',
        createdAt: '2026-11-08T11:05:00.000Z',
      })
      .run()

    // Merge A into B
    const backupA = backupAll(devA.raw)
    mergeBackup(backupA, devB.raw)

    const allTelemetry = devB.db.select().from(schema.cognitiveTelemetryEvents).all()
    expect(allTelemetry.length).toBe(2)
    expect(allTelemetry.some((t) => t.flowZone === 'optimal_flow')).toBe(true)
    expect(allTelemetry.some((t) => t.flowZone === 'overload')).toBe(true)

    const allSessions = devB.db.select().from(schema.circadianAudioSessions).all()
    expect(allSessions.length).toBe(2)
    expect(allSessions.some((s) => s.sessionMode === 'commute')).toBe(true)
    expect(allSessions.some((s) => s.sessionMode === 'wind_down')).toBe(true)
  })

  it('merges tmr_cues counters via MAX and updates lastSleepCueAt', () => {
    const devA = createDeviceDb()
    const devB = createDeviceDb()

    devA.db.insert(schema.decks).values({ id: 1, name: 'Physics' }).run()
    devA.db
      .insert(schema.cards)
      .values({
        id: 10,
        deckId: 1,
        content: { basic: { front: 'F=ma', back: 'Newtons second law' } },
        type: 'basic',
        due: '2026-01-01',
      })
      .run()

    devB.db.insert(schema.decks).values({ id: 1, name: 'Physics' }).run()
    devB.db
      .insert(schema.cards)
      .values({
        id: 10,
        deckId: 1,
        content: { basic: { front: 'F=ma', back: 'Newtons second law' } },
        type: 'basic',
        due: '2026-01-01',
      })
      .run()

    const sig = generateTmrEarcon(10)

    // Device A: cued awake 5 times, sleep 1 time
    devA.db
      .insert(schema.tmrCues)
      .values({
        cardId: 10,
        earconSignature: sig,
        timesCuedAwake: 5,
        timesCuedSleep: 1,
        lastSleepCueAt: '2026-11-07T03:00:00.000Z',
      })
      .run()

    // Device B: cued awake 2 times, sleep 4 times (newer sleep cue)
    devB.db
      .insert(schema.tmrCues)
      .values({
        cardId: 10,
        earconSignature: sig,
        timesCuedAwake: 2,
        timesCuedSleep: 4,
        lastSleepCueAt: '2026-11-08T04:00:00.000Z',
      })
      .run()

    const backupA = backupAll(devA.raw)
    mergeBackup(backupA, devB.raw)

    const cue = devB.db.select().from(schema.tmrCues).where(eq(schema.tmrCues.cardId, 10)).get()
    expect(cue).toBeDefined()
    // MAX of 5 and 2 is 5
    expect(cue!.timesCuedAwake).toBe(5)
    // MAX of 1 and 4 is 4
    expect(cue!.timesCuedSleep).toBe(4)
    // Later date preserved
    expect(cue!.lastSleepCueAt).toBe('2026-11-08T04:00:00.000Z')
  })

  it('merges palace_3d_scenes using LWW by updated_at', () => {
    const devA = createDeviceDb()
    const devB = createDeviceDb()

    // Same palace on both devices: palaces sync by (name, created_at), so the
    // shared identity must be explicit — two now() calls can land in
    // different milliseconds and correctly read as two distinct palaces.
    const createdAt = '2026-11-01T00:00:00.000Z'
    devA.db.insert(schema.palaces).values({ id: 1, name: 'Villa', createdAt }).run()
    devB.db.insert(schema.palaces).values({ id: 1, name: 'Villa', createdAt }).run()

    // Device A updated earlier
    devA.db
      .insert(schema.palace3dScenes)
      .values({
        palaceId: 1,
        environmentArchetype: 'roman_villa',
        updatedAt: '2026-11-08T08:00:00.000Z',
      })
      .run()

    // Device B updated later with cyber_sanctum
    devB.db
      .insert(schema.palace3dScenes)
      .values({
        palaceId: 1,
        environmentArchetype: 'cyber_sanctum',
        updatedAt: '2026-11-08T12:00:00.000Z',
      })
      .run()

    // Merging A into B: B is newer, so B should keep cyber_sanctum
    const backupA = backupAll(devA.raw)
    mergeBackup(backupA, devB.raw)

    let scene = devB.db
      .select()
      .from(schema.palace3dScenes)
      .where(eq(schema.palace3dScenes.palaceId, 1))
      .get()
    expect(scene!.environmentArchetype).toBe('cyber_sanctum')

    // Now merge B into A: A should receive cyber_sanctum because B is newer
    const backupB = backupAll(devB.raw)
    mergeBackup(backupB, devA.raw)

    scene = devA.db
      .select()
      .from(schema.palace3dScenes)
      .where(eq(schema.palace3dScenes.palaceId, 1))
      .get()
    expect(scene!.environmentArchetype).toBe('cyber_sanctum')
  })
})
