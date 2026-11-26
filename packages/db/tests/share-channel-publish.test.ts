import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { verifyManifest } from '@learning-hub/core'
import { lhcfCourseSchema } from '@learning-hub/core/curriculum/lhcf/schema'
import * as schema from '../src/schema'
import { decks } from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import { setDb, type LearningHubDB, type RawSqliteHandle } from '../src/index'
import { createBasicCards, findOrCreateDeck } from '../src/repos/cards'
import { importCurriculum } from '../src/repos/curriculum'
import {
  publishCourseAsChannel,
  publishDeckAsChannel,
  publishDeckUpdateFromLibrary,
} from '../src/repos/share-channel-publish'

function createInMemoryDb(): LearningHubDB {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema }) as unknown as LearningHubDB
  setDb(db)
  return db
}

describe('publishDeckAsChannel', () => {
  let db: LearningHubDB

  beforeEach(() => {
    db = createInMemoryDb()
  })

  it('turns a deck into a valid channel manifest at v1', () => {
    const deck = findOrCreateDeck('Physics', { db })
    createBasicCards(deck.id, 'Speed of light? :: c\nUnit of force? :: newton', { db })
    const result = publishDeckAsChannel({
      deckId: deck.id,
      channelId: 'ch-phys',
      title: 'Physics Deck',
      authorHandle: 'heron',
      visibility: 'link',
      database: db,
    })
    expect(result.ok).toBe(true)
    expect(result.manifest?.versions[0].items).toHaveLength(2)
    expect(result.manifest?.versions[0].items[0].id).toMatch(/^card-\d+$/)
    expect(verifyManifest(result.manifest!).ok).toBe(true)
  })

  it('updates carry a truthful change summary for subscribers', () => {
    const deck = findOrCreateDeck('Physics', { db })
    createBasicCards(deck.id, 'Q1? :: A1\nQ2? :: A2', { db })
    const first = publishDeckAsChannel({
      deckId: deck.id,
      channelId: 'ch-phys',
      title: 'Physics Deck',
      authorHandle: 'heron',
      visibility: 'link',
      database: db,
    })
    // Creator adds a card and republishes from the library.
    createBasicCards(deck.id, 'Q3? :: A3', { db })
    const second = publishDeckUpdateFromLibrary({
      deckId: deck.id,
      manifest: first.manifest!,
      changelog: 'Added Q3',
      database: db,
    })
    expect(second.ok).toBe(true)
    expect(second.manifest?.currentVersion).toBe(2)
    expect(second.changeSummary?.added).toHaveLength(1)
    expect(second.changeSummary?.removed).toHaveLength(0)
    expect(second.changeSummary?.changed).toHaveLength(0)
    expect(verifyManifest(second.manifest!).ok).toBe(true)
  })

  it('refuses decks with no transportable cards', () => {
    const deck = findOrCreateDeck('Empty', { db })
    const result = publishDeckAsChannel({
      deckId: deck.id,
      channelId: 'ch-empty',
      title: 'Empty',
      authorHandle: 'heron',
      visibility: 'link',
      database: db,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no transportable cards')
  })
})

describe('publishCourseAsChannel', () => {
  it('turns a curriculum course into a course channel', () => {
    const db = createInMemoryDb()
    const report = importCurriculum(
      lhcfCourseSchema.parse({
        lhcf: 1,
        slug: 'bio-101',
        title: 'Biology 101',
        modules: [
          {
            slug: 'foundations',
            title: 'Foundations',
            lessons: [
              {
                slug: 'cells',
                title: 'Cells',
                objective: 'Explain cell structure',
                theory: [{ heading: 'Cells', body: 'Cells are the unit of life.' }],
              },
              {
                slug: 'dna',
                title: 'DNA',
                objective: 'Describe DNA replication',
                summary: 'Replication basics',
                theory: [],
              },
            ],
          },
        ],
      }),
      db,
    )
    const result = publishCourseAsChannel({
      courseId: report.courseId,
      channelId: 'ch-bio',
      authorHandle: 'heron',
      visibility: 'invite',
      database: db,
    })
    expect(result.ok).toBe(true)
    expect(result.manifest?.type).toBe('course')
    expect(result.manifest?.title).toBe('Biology 101')
    expect(result.manifest?.versions[0].items).toHaveLength(2)
    expect(result.manifest?.versions[0].items[0].id).toBe('lesson-cells')
    const body = result.manifest?.versions[0].items[0].content.body as string
    expect(body).toContain('unit of life')
    expect(verifyManifest(result.manifest!).ok).toBe(true)
  })
})
