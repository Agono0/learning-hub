import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import { setDb, type RawSqliteHandle } from '../src/index'
import { backupAll } from '../src/backup'
import { mergeBackup } from '../src/sync'
import { addConceptDependency, removeConceptDependency } from '../src/repos/knowledge-graph'
import { deleteTaskItem } from '../src/repos/tasks'

function device() {
  const sqlite = new Database(':memory:')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema })
  return { sqlite, raw, db }
}
type Dev = ReturnType<typeof device>
const n = (d: Dev, t: string) =>
  (d.sqlite.prepare(`SELECT count(*) c FROM "${t}"`).get() as { c: number }).c

const T0 = '2026-04-01T10:00:00.000Z'
const T1 = '2026-04-02T10:00:00.000Z'

/** Table, insert SQL for the original row, SQL that renames/edits the editable field, count. */
const CASES: [string, string, string][] = [
  [
    'task_projects',
    `INSERT INTO task_projects (title, created_at, updated_at) VALUES ('Old', '${T0}', '${T0}')`,
    `UPDATE task_projects SET title = 'Renamed', updated_at = '${T1}'`,
  ],
  [
    'task_items',
    `INSERT INTO task_items (title, created_at, updated_at) VALUES ('Old', '${T0}', '${T0}')`,
    `UPDATE task_items SET title = 'Renamed', updated_at = '${T1}'`,
  ],
  [
    'task_sections',
    `INSERT INTO task_sections (name, created_at) VALUES ('Old', '${T0}')`,
    `UPDATE task_sections SET name = 'Renamed'`,
  ],
  [
    'mindmaps',
    `INSERT INTO mindmaps (title, nodes_json, edges_json, created_at, updated_at) VALUES ('Old', '[]', '[]', '${T0}', '${T0}')`,
    `UPDATE mindmaps SET title = 'Renamed', updated_at = '${T1}'`,
  ],
  [
    'simple_counters',
    `INSERT INTO simple_counters (label, created_at, updated_at) VALUES ('Old', '${T0}', '${T0}')`,
    `UPDATE simple_counters SET label = 'Renamed', updated_at = '${T1}'`,
  ],
  [
    'quick_captures',
    `INSERT INTO quick_captures (text, created_at) VALUES ('Old', '${T0}')`,
    `UPDATE quick_captures SET text = 'Renamed'`,
  ],
  [
    'task_views',
    `INSERT INTO task_views (name, created_at, updated_at) VALUES ('Old', '${T0}', '${T0}')`,
    `UPDATE task_views SET name = 'Renamed', updated_at = '${T1}'`,
  ],
]

describe('renaming a row on one device does not duplicate it on the next merge', () => {
  it.each(CASES)('%s: rename, merge twice', async (table, insert, rename) => {
    const a = device()
    const b = device()
    a.sqlite.prepare(insert).run()
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, table)).toBe(1)

    a.sqlite.prepare(rename).run()
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    await mergeBackup(snap, b.raw)
    expect(n(b, table)).toBe(1)
  })

  it.each(CASES)(
    '%s: delete after rename still reaches the other device',
    async (table, insert, rename) => {
      const a = device()
      const b = device()
      setDb(a.db)
      a.sqlite.prepare(insert).run()
      await mergeBackup(backupAll(a.raw), b.raw)
      a.sqlite.prepare(rename).run()
      // Delete through the repos so a tombstone is recorded for the renamed row.
      const id = (a.sqlite.prepare(`SELECT id FROM "${table}"`).get() as { id: number }).id
      const repos = await import('../src/index')
      const del: Record<string, (i: number) => unknown> = {
        task_projects: repos.deleteTaskProjectRow,
        task_items: deleteTaskItem,
        task_sections: repos.deleteSection,
        mindmaps: repos.deleteMindmap,
        simple_counters: repos.deleteCounterRow,
        quick_captures: repos.deleteQuickCapture,
        task_views: repos.deleteTaskViewRow,
      }
      del[table]!(id)
      expect(n(a, table)).toBe(0)
      await mergeBackup(backupAll(a.raw), b.raw)
      expect(n(b, table)).toBe(0)
    },
  )
})

describe('re-adding a deleted link syncs back', () => {
  it('concept dependency: delete, re-add, merge', async () => {
    const a = device()
    const b = device()
    setDb(a.db)
    const dep = addConceptDependency({ sourceConcept: 'x', targetConcept: 'y' } as never) as {
      id: number
    }
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, 'concept_dependencies')).toBe(1)

    removeConceptDependency(dep.id)
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, 'concept_dependencies')).toBe(0)

    // The same link is added again later: it must come back, not stay buried by the tombstone.
    await new Promise((r) => setTimeout(r, 5))
    addConceptDependency({ sourceConcept: 'x', targetConcept: 'y' } as never)
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, 'concept_dependencies')).toBe(1)
  })
})

describe('rows sharing a created_at are not merged into one', () => {
  it('two tasks created in the same millisecond both survive a merge', async () => {
    const a = device()
    const b = device()
    const ins = `INSERT INTO task_items (title, created_at, updated_at) VALUES (?, '${T0}', '${T0}')`
    a.sqlite.prepare(ins).run('first')
    a.sqlite.prepare(ins).run('second')
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, 'task_items')).toBe(2)
  })
})

describe('same-millisecond rows and old duplicates', () => {
  it('re-merging the same snapshot does not grow same-ms rows', async () => {
    const a = device()
    const b = device()
    const ins = `INSERT INTO task_items (title, created_at, updated_at) VALUES (?, '${T0}', '${T0}')`
    a.sqlite.prepare(ins).run('first')
    a.sqlite.prepare(ins).run('second')
    const snap = backupAll(a.raw)
    await mergeBackup(snap, b.raw)
    await mergeBackup(snap, b.raw)
    await mergeBackup(snap, b.raw)
    expect(n(b, 'task_items')).toBe(2)
  })

  it('collapses exact duplicate leaf rows left by older merges, keeps distinct ones', async () => {
    const a = device()
    const b = device()
    const ins = `INSERT INTO quick_captures (text, created_at) VALUES (?, ?)`
    for (let i = 0; i < 3; i++) b.sqlite.prepare(ins).run('same', T0)
    b.sqlite.prepare(ins).run('other', T0)
    a.sqlite.prepare(ins).run('same', T0)
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, 'quick_captures')).toBe(2)
  })
})
