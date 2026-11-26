import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import { setDb, type RawSqliteHandle } from '../src/index'
import { backupAll } from '../src/backup'
import { mergeBackup } from '../src/sync'
import {
  createCounterRow,
  createHabit,
  createQuote,
  createTaskItem,
  createTaskProjectRow,
  createTaskTag,
  deleteCounterRow,
  deleteHabit,
  deleteQuote,
  deleteTaskItem,
  deleteTaskProjectRow,
  deleteTaskTag,
} from '../src/index'

function device() {
  const sqlite = new Database(':memory:')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema })
  return { sqlite, raw, db }
}
const n = (d: ReturnType<typeof device>, t: string) =>
  (d.sqlite.prepare(`SELECT count(*) c FROM "${t}"`).get() as { c: number }).c

describe('deleting a row on one device is not undone by the next sync', () => {
  it('quotes, habits, tasks (with subtasks), tags, projects and counters', async () => {
    const a = device()
    const b = device()
    setDb(a.db)
    const quote = createQuote({ text: 'Stay curious', author: 'Anon' })
    const habit = createHabit({ name: 'Read' } as never)
    const project = createTaskProjectRow({ title: 'P' })
    const tag = createTaskTag({ name: 'deep' })
    const counter = createCounterRow({ label: 'Pushups' })
    const parent = createTaskItem({ title: 'Parent' } as never)
    createTaskItem({ title: 'Child', parentId: parent.id } as never)

    // Device B syncs everything while it still exists.
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, 'quotes')).toBe(1)
    expect(n(b, 'task_items')).toBe(2)

    // Device A deletes them.
    deleteQuote(quote.id)
    deleteHabit(habit.id)
    deleteTaskItem(parent.id)
    deleteTaskTag(tag.id)
    deleteTaskProjectRow(project.id)
    deleteCounterRow(counter.id)
    expect(n(a, 'sync_tombstones')).toBeGreaterThanOrEqual(7)

    await mergeBackup(backupAll(a.raw), b.raw)
    expect(n(b, 'quotes')).toBe(0)
    expect(n(b, 'habits')).toBe(0)
    expect(n(b, 'task_items')).toBe(0)
    expect(n(b, 'task_tags')).toBe(0)
    expect(n(b, 'task_projects')).toBe(0)
    expect(n(b, 'simple_counters')).toBe(0)

    // And B cannot resurrect them on A either (B's snapshot has no rows, tombstones persist).
    await mergeBackup(backupAll(b.raw), a.raw)
    expect(n(a, 'quotes')).toBe(0)
    expect(n(a, 'task_items')).toBe(0)
  })
})
