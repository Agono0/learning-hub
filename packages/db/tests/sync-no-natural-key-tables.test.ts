import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
import { backupAll } from '../src/backup'
import { mergeBackup } from '../src/sync'

function device() {
  const s = new Database(':memory:')
  const raw = s as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  return { s, raw }
}
const count = (d: ReturnType<typeof device>, t: string) =>
  (d.s.prepare(`SELECT count(*) c FROM "${t}"`).get() as { c: number }).c

/** Insert one row, filling required columns with a recognisable value per type. */
function fillRow(s: Database.Database, t: string, tag: string, ts: string) {
  const cols = s.prepare(`pragma table_info("${t}")`).all() as {
    name: string
    type: string
    notnull: number
    dflt_value: unknown
    pk: number
  }[]
  const names: string[] = []
  const vals: unknown[] = []
  for (const c of cols) {
    if (c.pk && c.name === 'id') continue
    if (c.dflt_value !== null && !/_at$/.test(c.name)) continue
    if (!c.notnull) continue
    names.push(`"${c.name}"`)
    if (/_at$|^day$/.test(c.name)) vals.push(ts)
    else if (/INT|REAL/i.test(c.type)) vals.push(1)
    else vals.push(tag + c.name)
  }
  s.prepare(
    `INSERT INTO "${t}" (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
  ).run(...vals)
}

const TABLES_WITHOUT_KEY_BEFORE = [
  'study_plans',
  'reminder_log',
  'reminder_clicks',
  'notification_log',
  'mindmaps',
  'boss_battles',
  'online_servers',
  'online_inbox',
  'audio_sessions',
  'quick_captures',
  'concept_dependencies',
  'review_duels',
  'exposure_events',
  'prototype_exemplar_sessions',
  'task_projects',
  'task_repeat_cfgs',
  'task_items',
  'task_sections',
  'simple_counters',
  'task_views',
]

describe('merging the same snapshot twice never duplicates rows', () => {
  it.each(TABLES_WITHOUT_KEY_BEFORE)('%s (ids collide across devices)', async (table) => {
    const a = device()
    const b = device()
    a.s.pragma('foreign_keys = OFF')
    b.s.pragma('foreign_keys = OFF')
    fillRow(a.s, table, 'a-', '2026-01-01T00:00:00.000Z')
    fillRow(b.s, table, 'b-', '2026-02-01T00:00:00.000Z')
    const snapshot = backupAll(a.raw)
    await mergeBackup(snapshot, b.raw)
    const afterFirst = count(b, table)
    expect(afterFirst).toBe(2)
    await mergeBackup(snapshot, b.raw)
    await mergeBackup(snapshot, b.raw)
    expect(count(b, table)).toBe(afterFirst)
  })
})

describe('task system keeps its links across devices', () => {
  it('remaps subtask, project, tag, time-log and attachment ids when ids collide', async () => {
    const a = device()
    const b = device()
    const ins = (d: ReturnType<typeof device>, sql: string, ...args: unknown[]) =>
      d.s.prepare(sql).run(...args)
    const T1 = '2026-03-01T10:00:00.000Z'
    const T2 = '2026-03-02T10:00:00.000Z'
    const T1b = '2026-03-01T10:00:00.500Z'

    // Device B already has its own project / task / tag with the same small ids.
    ins(
      b,
      `INSERT INTO task_projects (title, created_at, updated_at) VALUES ('B proj', ?, ?)`,
      T2,
      T2,
    )
    ins(
      b,
      `INSERT INTO task_items (title, project_id, created_at, updated_at) VALUES ('B task', 1, ?, ?)`,
      T2,
      T2,
    )
    ins(b, `INSERT INTO task_tags (name, created_at) VALUES ('b-tag', ?)`, T2)

    // Device A: project 1, parent task 1 with subtask 2, tag 1 on subtask, log + attachment.
    ins(
      a,
      `INSERT INTO task_projects (title, created_at, updated_at) VALUES ('A proj', ?, ?)`,
      T1,
      T1,
    )
    ins(
      a,
      `INSERT INTO task_items (title, project_id, created_at, updated_at) VALUES ('A parent', 1, ?, ?)`,
      T1,
      T1,
    )
    ins(
      a,
      `INSERT INTO task_items (title, parent_id, project_id, created_at, updated_at) VALUES ('A child', 1, 1, ?, ?)`,
      T1b,
      T1b,
    )
    ins(a, `INSERT INTO task_tags (name, created_at) VALUES ('a-tag', ?)`, T1)
    ins(a, `INSERT INTO task_item_tags (item_id, tag_id) VALUES (2, 1)`)
    ins(
      a,
      `INSERT INTO task_time_logs (task_id, day, session_ms, created_at) VALUES (2, '2026-03-01', 60000, ?)`,
      T1,
    )
    ins(
      a,
      `INSERT INTO task_attachments (task_id, type, value, created_at) VALUES (2, 'url', 'https://a.example', ?)`,
      T1,
    )

    const snapshot = backupAll(a.raw)
    await mergeBackup(snapshot, b.raw)
    await mergeBackup(snapshot, b.raw)

    const item = (title: string) =>
      b.s.prepare(`SELECT * FROM task_items WHERE title = ?`).get(title) as Record<string, number>
    const proj = (title: string) =>
      b.s.prepare(`SELECT id FROM task_projects WHERE title = ?`).get(title) as { id: number }

    expect(count(b, 'task_items')).toBe(3)
    expect(count(b, 'task_projects')).toBe(2)
    const parent = item('A parent')!
    const child = item('A child')!
    expect(item('B task')!.project_id).toBe(proj('B proj').id)
    expect(parent.project_id).toBe(proj('A proj').id)
    expect(child.project_id).toBe(proj('A proj').id)
    expect(child.parent_id).toBe(parent.id)

    const tag = b.s.prepare(`SELECT id FROM task_tags WHERE name = 'a-tag'`).get() as { id: number }
    const links = b.s.prepare(`SELECT * FROM task_item_tags`).all() as {
      item_id: number
      tag_id: number
    }[]
    expect(links).toEqual([{ item_id: child.id, tag_id: tag.id }])
    const log = b.s.prepare(`SELECT task_id FROM task_time_logs`).all() as { task_id: number }[]
    expect(log).toEqual([{ task_id: child.id }])
    const att = b.s.prepare(`SELECT task_id FROM task_attachments`).all() as { task_id: number }[]
    expect(att).toEqual([{ task_id: child.id }])
  })

  it('does not copy per-device online prefs (singleton) into another device', async () => {
    const a = device()
    const b = device()
    a.s.prepare(`INSERT INTO online_prefs (active_room_code) VALUES ('ROOM-A')`).run()
    const before = count(b, 'online_prefs')
    await mergeBackup(backupAll(a.raw), b.raw)
    expect(count(b, 'online_prefs')).toBe(before)
  })
})
