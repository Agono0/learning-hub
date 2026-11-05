import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { validateLhcf } from '@learning-hub/core/curriculum'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { LearningHubDB, RawSqliteHandle } from '../src/index'
import {
  getStarterCatalogStatus,
  getStarterCourses,
  installStarterPack,
} from '../src/starter-catalog'

function createMemDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema }) as unknown as LearningHubDB
  return { sqlite, db }
}

describe('Starter Course Library, Curated Seed & SQ3R persistence', () => {
  it('validates all 3 built-in starter LHCF courses with zero errors and zero pedagogy warnings', () => {
    const courses = getStarterCourses()
    expect(courses.map((c) => c.slug)).toEqual([
      'learning-how-to-learn',
      'javascript-functions',
      'sql-essentials',
    ])
    for (const c of courses) {
      const check = validateLhcf(c)
      expect(check.ok).toBe(true)
      if (check.ok) {
        expect(check.warnings).toEqual([])
      }
    }
  })

  it('idempotently seeds curated data and installs starter courses without duplicates', () => {
    const { sqlite, db } = createMemDb()

    const before = getStarterCatalogStatus(db)
    expect(before.seededQuotes).toBe(0)
    expect(before.courses.every((c) => !c.installed)).toBe(true)

    const first = installStarterPack(
      {
        seedCore: true,
        courseSlugs: ['learning-how-to-learn', 'javascript-functions', 'sql-essentials'],
      },
      db,
    )
    expect(first.seedReport?.quotesAdded).toBeGreaterThan(50)
    expect(first.seedReport?.mnemonicsTotal).toBe(20) // 10 Major + 10 PAO
    expect(first.importedCourses).toHaveLength(3)
    expect(first.importedCourses.every((r) => r.created)).toBe(true)

    const after = getStarterCatalogStatus(db)
    expect(after.courses.every((c) => c.installed && c.courseId !== null)).toBe(true)
    const cardCountAfterFirst = db.select().from(schema.cards).all().length
    expect(cardCountAfterFirst).toBeGreaterThanOrEqual(12)

    // Re-running is 100% idempotent
    const second = installStarterPack(
      {
        seedCore: true,
        courseSlugs: ['learning-how-to-learn', 'javascript-functions', 'sql-essentials'],
      },
      db,
    )
    expect(second.seedReport?.quotesAdded).toBe(0)
    expect(second.importedCourses.every((r) => !r.created)).toBe(true)
    expect(db.select().from(schema.cards).all().length).toBe(cardCountAfterFirst)

    sqlite.close()
  })

  it('persists SQ3R sessions and cascades cleanly when a reading source is deleted', () => {
    const { sqlite, db } = createMemDb()

    const [src] = db
      .insert(schema.sources)
      .values({
        kind: 'markdown',
        title: 'SQ3R Test Article',
        content: '# Heading 1\n\nSome content.',
      })
      .returning()
      .all()

    db.insert(schema.sq3rSessions)
      .values({
        sourceId: src!.id,
        surveyHeadings: ['Heading 1'],
        questions: [{ id: 'q1', question: 'What is Heading 1?', answer: 'Some content.' }],
        reciteNotes: 'Recited from memory',
        completedSteps: ['survey', 'question', 'read', 'recite'],
      })
      .run()

    expect(db.select().from(schema.sq3rSessions).all()).toHaveLength(1)

    db.delete(schema.sources).where(eq(schema.sources.id, src!.id)).run()
    expect(db.select().from(schema.sq3rSessions).all()).toHaveLength(0)

    sqlite.close()
  })
})
