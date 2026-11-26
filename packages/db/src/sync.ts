/**
 * Learning HUB — non-destructive multi-device Smart Merge (`mergeBackup`) and
 * device-local Cloud Sync configuration repository.
 *
 * Guarantees:
 * 1. Append-only event tables (`revlog`, `revlog_undos`, `xp_events`,
 *    `elo_events`, `friction_events`, `course_exam_attempts`) are strictly
 *    union-merged — zero rows are ever deleted or overwritten (Hard Rule #8).
 * 2. Concurrent offline reviews on the same card union into `revlog` and replay
 *    chronologically through `rescheduleCardHistory` (`ts-fsrs` `Reschedule`),
 *    producing the exact FSRS-6 memory state from the combined review log.
 * 3. Colliding autoincrement IDs created independently offline remap cleanly via
 *    topological parent → child foreign-key `idMap` translation.
 * 4. Device-local secrets (`sync_configs`, `user_settings.ai_api_key`,
 *    `user_settings.ai_headers`, the `online_identity` key pair) never leave the device and are never wiped by
 *    incoming sync payloads.
 */
import {
  parseFsrsWeights,
  rescheduleCardHistory,
  type FsrsOptimizerRevlog,
} from '@learning-hub/core'
import {
  KNOWN_TABLES,
  aiSettingsOverlay,
  backupFileSchema,
  type LocalAiSettings,
  normalizeBackupValue,
  presentTables,
  topologicalOrder,
} from './backup'
import { getRawDb, type RawSqliteHandle } from './index'
import { ValidationError } from './review-service'

export interface MergeResult {
  tablesProcessed: number
  inserted: number
  updated: number
  tombstoned: number
  rescheduledCards: number
}

const APPEND_ONLY_TABLES = new Set([
  'revlog',
  'revlog_undos',
  'xp_events',
  'elo_events',
  'friction_events',
  'course_exam_attempts',
  'study_coin_ledger',
  'cognitive_telemetry_events',
  'circadian_audio_sessions',
  'dialectic_arena_debates',
  'exposure_events',
  'ei_attempts',
  'rif_audits',
])

const SKIP_TABLES = new Set([
  'schema_migrations',
  'sync_configs',
  'focus_bridge',
  // Device-local key pair: never merged in from another device's snapshot.
  'online_identity',
])

function str(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

function rowTimestamp(row: Record<string, unknown>): string {
  return (
    str(row['updated_at']) ||
    str(row['completed_at']) ||
    str(row['unlocked_at']) ||
    str(row['issued_at']) ||
    str(row['reviewed_at']) ||
    str(row['created_at']) ||
    ''
  )
}

/** Stable natural identity key used by `sync_tombstones` and deduplication. */
export function computeRecordNaturalKey(
  table: string,
  row: Record<string, unknown>,
): string | null {
  switch (table) {
    case 'decks':
      return `name:${str(row['name'])}`
    case 'cards':
      return row['source_key']
        ? `deck:${str(row['deck_id'])}:sk:${str(row['source_key'])}`
        : `deck:${str(row['deck_id'])}:type:${str(row['type'])}:c:${str(row['content'])}`
    case 'notes':
      return `title:${str(row['title'])}`
    case 'note_links':
      return `from:${str(row['from_note_id'])}:to:${str(row['to_note_id'])}`
    case 'note_bullets':
      return `note:${str(row['note_id'])}:pos:${str(row['position'])}:txt:${str(row['content'])}`
    case 'courses':
      return row['slug'] ? `slug:${str(row['slug'])}` : `title:${str(row['title'])}`
    case 'tracks':
      return `title:${str(row['title'])}`
    case 'units':
      return row['slug']
        ? `course:${str(row['course_id'])}:slug:${str(row['slug'])}`
        : `course:${str(row['course_id'])}:title:${str(row['title'])}`
    case 'lessons':
      return row['slug']
        ? `unit:${str(row['unit_id'])}:slug:${str(row['slug'])}`
        : `unit:${str(row['unit_id'])}:title:${str(row['title'])}`
    case 'skills':
      return row['slug']
        ? `slug:${str(row['slug'])}`
        : `track:${str(row['track_id'])}:name:${str(row['name'])}`
    case 'skill_edges':
      return `from:${str(row['from_skill_id'])}:to:${str(row['to_skill_id'])}`
    case 'mastery':
      return `skill:${str(row['skill_id'])}`
    case 'lesson_progress':
      return `lesson:${str(row['lesson_id'])}`
    case 'course_project_stages':
      return `course:${str(row['course_id'])}:proj:${str(row['project_slug'])}:stage:${str(row['stage_slug'])}`
    case 'certificates':
      return `course:${str(row['course_id'])}`
    case 'habits':
      return `name:${str(row['name'])}:created:${str(row['created_at'])}`
    case 'habit_logs':
      return `habit:${str(row['habit_id'])}:date:${str(row['date'])}`
    case 'journal_entries':
      return `date:${str(row['date'])}:type:${str(row['type'])}`
    case 'quests':
      return `date:${str(row['date'])}`
    case 'achievements':
      return `key:${str(row['key'])}`
    case 'distraction_apps':
      return `name:${str(row['name'])}`
    case 'physio_log':
      return `date:${str(row['date'])}`
    case 'mnemonic_tables':
      return `sys:${str(row['system'])}:code:${str(row['code'])}`
    case 'sources':
      return `title:${str(row['title'])}:created:${str(row['added_at'] || row['created_at'])}`
    case 'sq3r_sessions':
      return `src:${str(row['source_id'])}`
    case 'highlights':
      return `src:${str(row['source_id'])}:txt:${str(row['text'])}`
    case 'palaces':
      return `name:${str(row['name'])}:created:${str(row['created_at'])}`
    case 'palace_items':
      return `palace:${str(row['palace_id'])}:ord:${str(row['locus_order'])}:target:${str(row['target'])}`
    case 'ideas':
      return `title:${str(row['title'])}:created:${str(row['created_at'])}`
    case 'idea_links':
      return `from:${str(row['from_idea_id'])}:to:${str(row['to_idea_id'])}:type:${str(row['type'])}`
    case 'goals':
      return `title:${str(row['title'])}:created:${str(row['created_at'])}`
    case 'projects':
      return `title:${str(row['title'])}:created:${str(row['created_at'])}`
    case 'goals_quotes':
      return `goal:${str(row['goal_id'])}:quote:${str(row['quote_id'])}`
    case 'quotes':
      return `txt:${str(row['text'])}:author:${str(row['author'])}`
    case 'routines':
      return `name:${str(row['name'])}:created:${str(row['created_at'])}`
    case 'routine_steps':
      return `routine:${str(row['routine_id'])}:ord:${str(row['order'])}:name:${str(row['name'])}`
    case 'ifthen_plans':
      return `cond:${str(row['condition'])}:act:${str(row['action'])}`
    case 'commitments':
      return `pledge:${str(row['pledge'])}:created:${str(row['created_at'])}`
    case 'exam_dates':
      return `title:${str(row['title'])}:date:${str(row['exam_date'])}`
    case 'canvases':
      return `title:${str(row['title'])}:scope:${str(row['scope'])}:sid:${str(row['scope_id'])}`
    case 'chat_sessions':
      return `kind:${str(row['kind'])}:created:${str(row['created_at'])}`
    case 'focus_sessions':
      return `start:${str(row['started_at'])}:plan:${str(row['planned_minutes'])}:type:${str(row['type'])}`
    case 'images':
      return row['sha256']
        ? `sha:${str(row['sha256'])}`
        : `file:${str(row['filename'])}:created:${str(row['created_at'])}`
    case 'revlog':
      return `card:${str(row['card_id'])}:at:${str(row['reviewed_at'])}:r:${str(row['rating'])}`
    case 'revlog_undos':
      return `revlog:${str(row['revlog_id'])}`
    case 'xp_events':
      return `src:${str(row['source'])}:amt:${str(row['amount'])}:at:${str(row['created_at'])}:m:${str(row['meta'])}`
    case 'elo_events':
      return `skill:${str(row['skill_id'])}:at:${str(row['created_at'])}:after:${str(row['rating_after'])}`
    case 'friction_events':
      return `trig:${str(row['trigger'])}:at:${str(row['created_at'])}:ref:${str(row['reflection'])}`
    case 'course_exam_attempts':
      return `course:${str(row['course_id'])}:at:${str(row['taken_at'])}:score:${str(row['score'])}`
    case 'study_coin_ledger':
      return `sig:${str(row['signature'])}`
    case 'user_avatars':
      return `u:${str(row['user_id'])}`
    case 'user_world_settings':
      return `u:${str(row['user_id'])}`
    case 'market_items':
      return `id:${str(row['id'])}`
    case 'forest_plots':
      return `u:${str(row['user_id'])}:tree:${str(row['tree_type'])}:at:${str(row['created_at'])}`
    case 'circadian_audio_sessions':
      return `mode:${str(row['session_mode'])}:at:${str(row['created_at'])}`
    case 'cognitive_telemetry_events':
      return `card:${str(row['card_id'])}:at:${str(row['created_at'])}:load:${str(row['estimated_cli'])}`
    case 'dialectic_arena_debates':
      return `topic:${str(row['topic'])}:at:${str(row['created_at'])}`
    case 'concept_dag_nodes':
      return `id:${str(row['id'])}`
    case 'concept_dag_edges':
      return `prereq:${str(row['prerequisite_id'])}:dep:${str(row['dependent_id'])}`
    case 'tmr_cues':
      return `card:${str(row['card_id'])}`
    case 'palace_3d_scenes':
      return `palace:${str(row['palace_id'])}`
    // Elaborative interrogation: facts dedupe by their text across devices;
    // state is one row per fact; attempts are identified by fact, time and style.
    case 'ei_facts':
      return `stmt:${str(row['statement'])}`
    case 'ei_fact_states':
      return `fact:${str(row['fact_id'])}`
    case 'ei_attempts':
      return `fact:${str(row['fact_id'])}:at:${str(row['created_at'])}:style:${str(row['style'])}`
    case 'rif_audits':
      return `deck:${str(row['deck_id'])}:at:${str(row['created_at'])}`
    case 'rif_dismissals':
      return `card:${str(row['card_id'])}`
    default:
      return null
  }
}

interface UniqueIndexSpec {
  columns: string[]
}

function uniqueIndexesFor(database: RawSqliteHandle, table: string): UniqueIndexSpec[] {
  const list = database.pragma(`index_list("${table}")`) as {
    name: string
    unique: number
    origin: string
  }[]
  const specs: UniqueIndexSpec[] = []
  for (const idx of list) {
    if (idx.unique !== 1 || idx.origin === 'pk') continue
    const info = database.pragma(`index_info("${idx.name}")`) as { name: string }[]
    const cols = info.map((i) => i.name).filter(Boolean)
    if (cols.length > 0) specs.push({ columns: cols })
  }
  return specs
}

interface ForeignKeySpec {
  fromCol: string
  toTable: string
  strictParent: boolean
}

/**
 * Logical foreign keys that intentionally omit SQLite `REFERENCES` in `schema.ts`
 * (e.g. append-only `revlog.card_id` so history survives card deletion, or
 * optional cross-module links). Including them here ensures `mergeTableOrder`
 * processes parents before children AND remaps colliding offline IDs cleanly.
 */
const LOGICAL_FOREIGN_KEYS: Record<string, ForeignKeySpec[]> = {
  notes: [{ fromCol: 'deck_id', toTable: 'decks', strictParent: false }],
  note_links: [
    { fromCol: 'from_note_id', toTable: 'notes', strictParent: true },
    { fromCol: 'to_note_id', toTable: 'notes', strictParent: true },
  ],
  note_bullets: [{ fromCol: 'note_id', toTable: 'notes', strictParent: true }],
  cards: [
    { fromCol: 'note_id', toTable: 'notes', strictParent: false },
    { fromCol: 'bullet_id', toTable: 'note_bullets', strictParent: false },
    { fromCol: 'skill_id', toTable: 'skills', strictParent: false },
  ],
  revlog: [{ fromCol: 'card_id', toTable: 'cards', strictParent: false }],
  revlog_undos: [
    { fromCol: 'revlog_id', toTable: 'revlog', strictParent: false },
    { fromCol: 'card_id', toTable: 'cards', strictParent: false },
  ],
  palace_items: [{ fromCol: 'card_id', toTable: 'cards', strictParent: false }],
  highlights: [{ fromCol: 'card_id', toTable: 'cards', strictParent: false }],
  courses: [{ fromCol: 'deck_id', toTable: 'decks', strictParent: false }],
  lessons: [{ fromCol: 'skill_id', toTable: 'skills', strictParent: false }],
  skills: [{ fromCol: 'track_id', toTable: 'tracks', strictParent: false }],
  exam_dates: [{ fromCol: 'course_id', toTable: 'courses', strictParent: false }],
  projects: [
    { fromCol: 'idea_id', toTable: 'ideas', strictParent: false },
    { fromCol: 'track_id', toTable: 'tracks', strictParent: false },
  ],
  goals: [{ fromCol: 'quote_id', toTable: 'quotes', strictParent: false }],
  goals_quotes: [
    { fromCol: 'goal_id', toTable: 'goals', strictParent: true },
    { fromCol: 'quote_id', toTable: 'quotes', strictParent: true },
  ],
  elo_events: [{ fromCol: 'skill_id', toTable: 'skills', strictParent: false }],
  friction_events: [{ fromCol: 'session_id', toTable: 'focus_sessions', strictParent: false }],
}

function foreignKeysFor(database: RawSqliteHandle, table: string): ForeignKeySpec[] {
  const fks = database.pragma(`foreign_key_list("${table}")`) as {
    table: string
    from: string
  }[]
  const specs: ForeignKeySpec[] = fks.map((fk) => ({
    fromCol: fk.from,
    toTable: fk.table,
    strictParent: true,
  }))
  const seen = new Set(specs.map((s) => `${s.fromCol}->${s.toTable}`))
  for (const logical of LOGICAL_FOREIGN_KEYS[table] ?? []) {
    const key = `${logical.fromCol}->${logical.toTable}`
    if (!seen.has(key)) {
      specs.push(logical)
      seen.add(key)
    }
  }
  return specs
}

function mergeTableOrder(database: RawSqliteHandle, tables: string[]): string[] {
  const baseOrder = topologicalOrder(database, tables)
  const tableSet = new Set(baseOrder)
  const parents = new Map<string, Set<string>>()
  for (const t of baseOrder) {
    const set = new Set<string>()
    for (const fk of foreignKeysFor(database, t)) {
      if (fk.toTable !== t && tableSet.has(fk.toTable)) set.add(fk.toTable)
    }
    parents.set(t, set)
  }

  const ordered: string[] = []
  const done = new Set<string>()
  let pending = [...baseOrder]
  while (pending.length > 0) {
    const ready = pending.filter((t) => [...(parents.get(t) ?? [])].every((p) => done.has(p)))
    if (ready.length === 0) {
      ordered.push(...pending)
      break
    }
    ordered.push(...ready)
    for (const r of ready) done.add(r)
    pending = pending.filter((t) => !done.has(t))
  }
  return ordered
}

/**
 * Non-destructively merge a validated `BackupFile` envelope into `database`,
 * union-merging append-only histories, resolving mutable conflicts via LWW +
 * tombstones, remapping colliding offline IDs across FK chains, and replaying
 * FSRS-6 state on cards that gained new review log entries.
 */
export async function mergeBackup(
  data: unknown,
  database: RawSqliteHandle = getRawDb(),
): Promise<MergeResult> {
  const parsed = backupFileSchema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue ? issue.path.map(String).join('.') : '?'
    throw new ValidationError(
      `invalid backup file at "${path}": ${issue?.message ?? 'unexpected shape'}`,
    )
  }

  const incomingTables = parsed.data.tables
  const unknownTables = Object.keys(incomingTables).filter((name) => !KNOWN_TABLES.has(name))
  if (unknownTables.length > 0) {
    throw new ValidationError(`backup contains unknown table(s): ${unknownTables.join(', ')}`)
  }

  const present = presentTables(database)
  const presentSet = new Set(present)
  const order = mergeTableOrder(database, present)

  // Step 1: Run synchronous relational merge inside ONE atomic transaction
  const syncOutcome = database.transaction(() => {
    database.pragma('defer_foreign_keys = ON')

    let inserted = 0
    let updated = 0
    let tombstoned = 0
    let tablesProcessed = 0

    // 1a. Union-merge sync_tombstones first
    const tombstoneMap = new Map<string, string>() // `${table}::${recordKey}` -> deletedAt
    if (presentSet.has('sync_tombstones')) {
      const incomingTombs = incomingTables['sync_tombstones'] ?? []
      const upsertTomb = database.prepare(
        `INSERT INTO "sync_tombstones" (table_name, record_key, deleted_at)
         VALUES (?, ?, ?)
         ON CONFLICT(table_name, record_key) DO UPDATE SET
           deleted_at = CASE
             WHEN excluded.deleted_at > sync_tombstones.deleted_at THEN excluded.deleted_at
             ELSE sync_tombstones.deleted_at
           END`,
      )
      for (const t of incomingTombs) {
        const tName = str(t['table_name'])
        const rKey = str(t['record_key'])
        const dAt = str(t['deleted_at'])
        if (tName && rKey && dAt) upsertTomb.run(tName, rKey, dAt)
      }
      const allTombs = database
        .prepare('SELECT table_name, record_key, deleted_at FROM "sync_tombstones"')
        .all() as { table_name: string; record_key: string; deleted_at: string }[]
      for (const t of allTombs) {
        tombstoneMap.set(`${t.table_name}::${t.record_key}`, t.deleted_at)
      }
    }

    const idMaps = new Map<string, Map<number, number>>()
    const touchedCardIds = new Set<number>()

    for (const table of order) {
      if (SKIP_TABLES.has(table) || table === 'sync_tombstones') continue
      const incomingRows = incomingTables[table]
      const hasIncoming = Boolean(incomingRows && incomingRows.length > 0)

      // Even if incomingRows is empty (e.g. remote deleted the last row), prune tombstoned local rows
      if (!hasIncoming) {
        if (!APPEND_ONLY_TABLES.has(table) && tombstoneMap.size > 0) {
          const tInfo = database.pragma(`table_info("${table}")`) as { name: string; pk: number }[]
          const pkC = tInfo.filter((c) => c.pk > 0).map((c) => c.name)
          if (pkC.length === 1 && pkC[0] === 'id') {
            const locRows = database.prepare(`SELECT * FROM "${table}"`).all() as Record<
              string,
              unknown
            >[]
            const delStmt = database.prepare(`DELETE FROM "${table}" WHERE id = ?`)
            for (const lr of locRows) {
              const nk = computeRecordNaturalKey(table, lr)
              if (!nk) continue
              const deletedAt = tombstoneMap.get(`${table}::${nk}`)
              if (deletedAt && deletedAt > (rowTimestamp(lr) || '0')) {
                delStmt.run(Number(lr['id']))
                tombstoned += 1
              }
            }
          }
        }
        continue
      }
      tablesProcessed += 1

      const tableInfo = database.pragma(`table_info("${table}")`) as {
        name: string
        type: string
        pk: number
      }[]
      const columns = tableInfo.map((c) => c.name)
      const columnSet = new Set(columns)
      const pkCols = tableInfo.filter((c) => c.pk > 0)
      const singleIntPk =
        pkCols.length === 1 && pkCols[0]!.name === 'id' && /INT/i.test(pkCols[0]!.type)

      // Validate columns upfront
      for (const r of incomingRows) {
        const extraKey = Object.keys(r).find((k) => !columnSet.has(k))
        if (extraKey !== undefined) {
          throw new ValidationError(`backup row for "${table}" has unknown column "${extraKey}"`)
        }
      }

      // Special case: user_settings singleton (LWW, never overwrite local secrets with null)
      if (table === 'user_settings') {
        const inc = incomingRows[0]
        if (!inc) continue
        const local = database
          .prepare('SELECT * FROM "user_settings" WHERE id = ?')
          .get(str(inc['id']) || 'default') as Record<string, unknown> | undefined
        if (!local) {
          const insertStmt = database.prepare(
            `INSERT INTO "user_settings" (${columns.map((c) => `"${c}"`).join(', ')})
             VALUES (${columns.map(() => '?').join(', ')})`,
          )
          const fresh: Record<string, unknown> = { ...inc, ...aiSettingsOverlay(undefined) }
          insertStmt.run(...columns.map((c) => normalizeBackupValue(fresh[c] as never)))
          inserted += 1
        } else if (str(inc['updated_at']) > str(local['updated_at'])) {
          // Snapshot AI key/headers are ignored; a local key pins its endpoint (see aiSettingsOverlay).
          const merged: Record<string, unknown> = {
            ...inc,
            ...aiSettingsOverlay(local as unknown as LocalAiSettings),
          }
          const updateCols = columns.filter((c) => c !== 'id')
          database
            .prepare(
              `UPDATE "user_settings"
               SET ${updateCols.map((c) => `"${c}" = ?`).join(', ')}
               WHERE id = ?`,
            )
            .run(
              ...updateCols.map((c) => normalizeBackupValue(merged[c] as never)),
              local['id'] as string,
            )
          updated += 1
        }
        continue
      }

      // Special case: streaks singleton (monotonic best, LWW current/freezes)
      if (table === 'streaks') {
        const inc = incomingRows[0]
        if (!inc) continue
        const local = database.prepare('SELECT * FROM "streaks" LIMIT 1').get() as
          Record<string, unknown> | undefined
        if (!local) {
          const nonId = columns.filter((c) => c !== 'id')
          database
            .prepare(
              `INSERT INTO "streaks" (${nonId.map((c) => `"${c}"`).join(', ')})
               VALUES (${nonId.map(() => '?').join(', ')})`,
            )
            .run(...nonId.map((c) => normalizeBackupValue(inc[c] as never)))
          inserted += 1
        } else {
          const best = Math.max(Number(local['best'] ?? 0), Number(inc['best'] ?? 0))
          const incNewer =
            str(inc['last_active_date']) > str(local['last_active_date']) ||
            (str(inc['last_active_date']) === str(local['last_active_date']) &&
              str(inc['updated_at']) > str(local['updated_at']))
          const winner = incNewer ? inc : local
          if (incNewer || best > Number(local['best'] ?? 0)) {
            database
              .prepare(
                `UPDATE "streaks"
                 SET current = ?, best = ?, last_active_date = ?, freezes = ?, updated_at = ?
                 WHERE id = ?`,
              )
              .run(
                Number(winner['current'] ?? 0),
                best,
                (winner['last_active_date'] as string | null) ?? null,
                Number(winner['freezes'] ?? 2),
                str(winner['updated_at']) || new Date().toISOString(),
                Number(local['id']),
              )
            updated += 1
          }
        }
        continue
      }

      const idMap = new Map<number, number>()
      idMaps.set(table, idMap)
      const fks = foreignKeysFor(database, table)
      const uniqueSpecs = uniqueIndexesFor(database, table)

      const localRows = database.prepare(`SELECT * FROM "${table}"`).all() as Record<
        string,
        unknown
      >[]
      const localById = new Map<number, Record<string, unknown>>()
      const localByNaturalKey = new Map<string, Record<string, unknown>>()

      for (const lr of localRows) {
        if (singleIntPk && typeof lr['id'] === 'number') {
          localById.set(lr['id'], lr)
        }
        const nk = computeRecordNaturalKey(table, lr)
        if (nk) localByNaturalKey.set(nk, lr)
      }

      // Prune local mutable rows that have a newer deletion tombstone
      if (!APPEND_ONLY_TABLES.has(table) && singleIntPk && tombstoneMap.size > 0) {
        const delStmt = database.prepare(`DELETE FROM "${table}" WHERE id = ?`)
        for (const lr of localRows) {
          const nk = computeRecordNaturalKey(table, lr)
          if (!nk) continue
          const deletedAt = tombstoneMap.get(`${table}::${nk}`)
          if (deletedAt && deletedAt > (rowTimestamp(lr) || '0')) {
            delStmt.run(Number(lr['id']))
            localById.delete(Number(lr['id']))
            localByNaturalKey.delete(nk)
            tombstoned += 1
          }
        }
      }

      const insertWithAllCols = database.prepare(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
      )
      const nonIdCols = columns.filter((c) => c !== 'id')
      const insertAutoId =
        singleIntPk && nonIdCols.length > 0
          ? database.prepare(
              `INSERT INTO "${table}" (${nonIdCols.map((c) => `"${c}"`).join(', ')})
               VALUES (${nonIdCols.map(() => '?').join(', ')})`,
            )
          : null
      const updateById =
        singleIntPk && nonIdCols.length > 0
          ? database.prepare(
              `UPDATE "${table}"
               SET ${nonIdCols.map((c) => `"${c}" = ?`).join(', ')}
               WHERE id = ?`,
            )
          : null

      for (const rawInc of incomingRows) {
        // 1. Remap foreign keys using parent idMaps
        const remapped: Record<string, unknown> = { ...rawInc }
        let missingParent = false
        for (const fk of fks) {
          const val = remapped[fk.fromCol]
          if (typeof val === 'number') {
            const parentMap = idMaps.get(fk.toTable)
            if (parentMap && parentMap.has(val)) {
              remapped[fk.fromCol] = parentMap.get(val)!
            } else if (fk.strictParent && fk.toTable !== table) {
              // Ensure referenced strict parent exists locally
              const parentExists = database
                .prepare(`SELECT 1 FROM "${fk.toTable}" WHERE id = ?`)
                .get(val)
              if (!parentExists) {
                missingParent = true
                break
              }
            }
          }
        }
        if (missingParent) continue

        const nk = computeRecordNaturalKey(table, remapped)

        // 2. Skip incoming mutable rows tombstoned more recently
        if (!APPEND_ONLY_TABLES.has(table) && nk) {
          const deletedAt = tombstoneMap.get(`${table}::${nk}`)
          if (deletedAt && deletedAt >= (rowTimestamp(remapped) || '0')) {
            tombstoned += 1
            continue
          }
        }

        // 3. Match against existing local row
        let matchedLocal: Record<string, unknown> | undefined
        if (nk && localByNaturalKey.has(nk)) {
          matchedLocal = localByNaturalKey.get(nk)
        }
        if (!matchedLocal && uniqueSpecs.length > 0) {
          for (const spec of uniqueSpecs) {
            if (spec.columns.some((c) => remapped[c] === null || remapped[c] === undefined)) {
              continue
            }
            matchedLocal = localRows.find((lr) =>
              spec.columns.every(
                (c) =>
                  normalizeBackupValue(lr[c] as never) ===
                  normalizeBackupValue(remapped[c] as never),
              ),
            )
            if (matchedLocal) break
          }
        }
        if (
          !matchedLocal &&
          !APPEND_ONLY_TABLES.has(table) &&
          singleIntPk &&
          typeof remapped['id'] === 'number'
        ) {
          const byId = localById.get(remapped['id'])
          if (
            byId &&
            columnSet.has('created_at') &&
            str(byId['created_at']) !== '' &&
            str(byId['created_at']) === str(remapped['created_at'])
          ) {
            matchedLocal = byId
          }
        }

        // 4a. Append-only tables: union insert if absent, never mutate existing
        if (APPEND_ONLY_TABLES.has(table)) {
          if (matchedLocal) {
            if (
              singleIntPk &&
              typeof rawInc['id'] === 'number' &&
              typeof matchedLocal['id'] === 'number'
            ) {
              idMap.set(rawInc['id'], matchedLocal['id'])
            }
            continue
          }

          if (table === 'revlog') {
            // revlog uses explicit epoch-ms primary key (not AUTOINCREMENT)
            let targetId = typeof remapped['id'] === 'number' ? remapped['id'] : Date.now()
            while (localById.has(targetId)) {
              targetId += 1
            }
            remapped['id'] = targetId
            insertWithAllCols.run(...columns.map((c) => normalizeBackupValue(remapped[c] as never)))
            localById.set(targetId, remapped)
            if (nk) localByNaturalKey.set(nk, remapped)
            if (typeof rawInc['id'] === 'number') idMap.set(rawInc['id'], targetId)
            if (typeof remapped['card_id'] === 'number') {
              touchedCardIds.add(remapped['card_id'])
            }
            inserted += 1
          } else {
            const incId = typeof remapped['id'] === 'number' ? remapped['id'] : null
            if (incId !== null && !localById.has(incId)) {
              insertWithAllCols.run(
                ...columns.map((c) => normalizeBackupValue(remapped[c] as never)),
              )
              localById.set(incId, remapped)
              if (nk) localByNaturalKey.set(nk, remapped)
              if (typeof rawInc['id'] === 'number') idMap.set(rawInc['id'], incId)
            } else if (insertAutoId) {
              const info = insertAutoId.run(
                ...nonIdCols.map((c) => normalizeBackupValue(remapped[c] as never)),
              )
              const newId = Number(info.lastInsertRowid)
              const insertedRow = { ...remapped, id: newId }
              localById.set(newId, insertedRow)
              if (nk) localByNaturalKey.set(nk, insertedRow)
              if (typeof rawInc['id'] === 'number') idMap.set(rawInc['id'], newId)
            }
            if (table === 'revlog_undos' && typeof remapped['card_id'] === 'number') {
              touchedCardIds.add(remapped['card_id'])
            }
            inserted += 1
          }
          continue
        }

        // 4b. Mutable tables: matched local row -> domain/LWW update
        if (table === 'tmr_cues' && matchedLocal) {
          const cardId = matchedLocal['card_id'] as number
          const awakeA = Number(matchedLocal['times_cued_awake'] ?? 0)
          const awakeB = Number(remapped['times_cued_awake'] ?? 0)
          const sleepA = Number(matchedLocal['times_cued_sleep'] ?? 0)
          const sleepB = Number(remapped['times_cued_sleep'] ?? 0)
          const lastSleepA = str(matchedLocal['last_sleep_cue_at'])
          const lastSleepB = str(remapped['last_sleep_cue_at'])
          const merged: Record<string, unknown> = {
            ...matchedLocal,
            times_cued_awake: Math.max(awakeA, awakeB),
            times_cued_sleep: Math.max(sleepA, sleepB),
            last_sleep_cue_at: (lastSleepA > lastSleepB ? lastSleepA : lastSleepB) || null,
            overnight_gain_score:
              remapped['overnight_gain_score'] ?? matchedLocal['overnight_gain_score'],
          }
          const updateCols = columns.filter((c) => c !== 'card_id')
          database
            .prepare(
              `UPDATE "tmr_cues"
               SET ${updateCols.map((c) => `"${c}" = ?`).join(', ')}
               WHERE card_id = ?`,
            )
            .run(...updateCols.map((c) => normalizeBackupValue(merged[c] as never)), cardId)
          Object.assign(matchedLocal, merged)
          updated += 1
          continue
        }

        if (table === 'palace_3d_scenes' && matchedLocal) {
          const palaceId = matchedLocal['palace_id'] as number
          const incTs = str(remapped['updated_at'])
          const locTs = str(matchedLocal['updated_at'])
          if (incTs > locTs) {
            const updateCols = columns.filter((c) => c !== 'palace_id')
            database
              .prepare(
                `UPDATE "palace_3d_scenes"
                 SET ${updateCols.map((c) => `"${c}" = ?`).join(', ')}
                 WHERE palace_id = ?`,
              )
              .run(...updateCols.map((c) => normalizeBackupValue(remapped[c] as never)), palaceId)
            Object.assign(matchedLocal, { ...remapped, palace_id: palaceId })
            updated += 1
          }
          continue
        }

        if (table === 'ei_fact_states' && matchedLocal) {
          // One row per fact, keyed by fact_id: the more recently updated state wins.
          if (str(remapped['updated_at']) > str(matchedLocal['updated_at'])) {
            const factId = matchedLocal['fact_id'] as number
            const updateCols = columns.filter((c) => c !== 'fact_id')
            database
              .prepare(
                `UPDATE "ei_fact_states" SET ${updateCols.map((c) => `"${c}" = ?`).join(', ')} WHERE fact_id = ?`,
              )
              .run(...updateCols.map((c) => normalizeBackupValue(remapped[c] as never)), factId)
            Object.assign(matchedLocal, { ...remapped, fact_id: factId })
            updated += 1
          }
          continue
        }

        if (matchedLocal && singleIntPk && typeof matchedLocal['id'] === 'number') {
          const localId = matchedLocal['id']
          if (typeof rawInc['id'] === 'number') {
            idMap.set(rawInc['id'], localId)
          }

          if (table === 'achievements') {
            const localUnlocked = matchedLocal['unlocked_at'] as string | null
            const incUnlocked = remapped['unlocked_at'] as string | null
            if (!localUnlocked && incUnlocked && updateById) {
              const merged: Record<string, unknown> = { ...matchedLocal, unlocked_at: incUnlocked }
              updateById.run(
                ...nonIdCols.map((c) => normalizeBackupValue(merged[c] as never)),
                localId,
              )
              Object.assign(matchedLocal, merged)
              updated += 1
            }
            continue
          }

          if (table === 'mastery') {
            const localAttempts = Number(matchedLocal['attempts'] ?? 0)
            const incAttempts = Number(remapped['attempts'] ?? 0)
            const incWins =
              incAttempts > localAttempts ||
              (incAttempts === localAttempts &&
                str(remapped['updated_at']) > str(matchedLocal['updated_at']))
            if (incWins && updateById) {
              const merged: Record<string, unknown> = {
                ...remapped,
                id: localId,
                attempts: Math.max(localAttempts, incAttempts),
                correct: Math.max(
                  Number(matchedLocal['correct'] ?? 0),
                  Number(remapped['correct'] ?? 0),
                ),
              }
              updateById.run(
                ...nonIdCols.map((c) => normalizeBackupValue(merged[c] as never)),
                localId,
              )
              Object.assign(matchedLocal, merged)
              updated += 1
            }
            continue
          }

          const incTs = rowTimestamp(remapped)
          const locTs = rowTimestamp(matchedLocal)
          if (incTs && incTs > locTs && updateById) {
            updateById.run(
              ...nonIdCols.map((c) => normalizeBackupValue(remapped[c] as never)),
              localId,
            )
            Object.assign(matchedLocal, { ...remapped, id: localId })
            updated += 1
          }
          continue
        }

        // 4c. Unmatched mutable row -> insert (preserving ID if free, or remapping on collision)
        if (singleIntPk) {
          const desiredId = typeof remapped['id'] === 'number' ? remapped['id'] : null
          if (desiredId !== null && !localById.has(desiredId)) {
            insertWithAllCols.run(...columns.map((c) => normalizeBackupValue(remapped[c] as never)))
            localById.set(desiredId, remapped)
            localRows.push(remapped)
            if (nk) localByNaturalKey.set(nk, remapped)
            if (typeof rawInc['id'] === 'number') idMap.set(rawInc['id'], desiredId)
            inserted += 1
          } else if (insertAutoId) {
            const info = insertAutoId.run(
              ...nonIdCols.map((c) => normalizeBackupValue(remapped[c] as never)),
            )
            const newId = Number(info.lastInsertRowid)
            const created = { ...remapped, id: newId }
            localById.set(newId, created)
            localRows.push(created)
            if (nk) localByNaturalKey.set(nk, created)
            if (typeof rawInc['id'] === 'number') idMap.set(rawInc['id'], newId)
            inserted += 1
          }
        } else {
          // Composite PK or text PK table
          const insertOrIgnore = database.prepare(
            `INSERT OR IGNORE INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
             VALUES (${columns.map(() => '?').join(', ')})`,
          )
          const res = insertOrIgnore.run(
            ...columns.map((c) => normalizeBackupValue(remapped[c] as never)),
          )
          if (res.changes > 0) inserted += 1
        }
      }
    }

    // Gather active revlog histories for any card that received merged reviews
    const cardsToReplay: {
      cardId: number
      desiredRetention: number
      weights: number[] | null
      history: FsrsOptimizerRevlog[]
    }[] = []

    if (touchedCardIds.size > 0 && presentSet.has('cards') && presentSet.has('revlog')) {
      const settingsRow = presentSet.has('user_settings')
        ? (database
            .prepare('SELECT desired_retention, fsrs_weights FROM "user_settings" LIMIT 1')
            .get() as { desired_retention: number | null; fsrs_weights: string | null } | undefined)
        : undefined
      const globalRetention = settingsRow?.desired_retention ?? 0.9
      let globalWeights: number[] | null = null
      if (settingsRow?.fsrs_weights) {
        try {
          globalWeights = parseFsrsWeights(JSON.parse(settingsRow.fsrs_weights))
        } catch {
          globalWeights = null
        }
      }

      const cardDeckStmt = database.prepare(
        `SELECT d.desired_retention, d.fsrs_weights
         FROM "cards" c
         JOIN "decks" d ON d.id = c.deck_id
         WHERE c.id = ?`,
      )
      const hasUndos = presentSet.has('revlog_undos')
      const historyStmt = database.prepare(
        hasUndos
          ? `SELECT r.id AS id, r.card_id AS cardId, r.rating AS rating, r.reviewed_at AS reviewedAt, r.elapsed_days AS elapsedDays
             FROM "revlog" r
             WHERE r.card_id = ?
               AND NOT EXISTS (SELECT 1 FROM "revlog_undos" u WHERE u.revlog_id = r.id)
             ORDER BY r.reviewed_at ASC, r.id ASC`
          : `SELECT r.id AS id, r.card_id AS cardId, r.rating AS rating, r.reviewed_at AS reviewedAt, r.elapsed_days AS elapsedDays
             FROM "revlog" r
             WHERE r.card_id = ?
             ORDER BY r.reviewed_at ASC, r.id ASC`,
      )

      for (const cardId of touchedCardIds) {
        const deckRow = cardDeckStmt.get(cardId) as
          { desired_retention: number | null; fsrs_weights: string | null } | undefined
        if (!deckRow) continue
        const retention = deckRow.desired_retention ?? globalRetention
        let weights = globalWeights
        if (deckRow.fsrs_weights) {
          try {
            weights = parseFsrsWeights(JSON.parse(deckRow.fsrs_weights))
          } catch {
            // keep globalWeights
          }
        }
        const history = historyStmt.all(cardId) as FsrsOptimizerRevlog[]
        if (history.length > 0) {
          cardsToReplay.push({ cardId, desiredRetention: retention, weights, history })
        }
      }
    }

    return { tablesProcessed, inserted, updated, tombstoned, cardsToReplay }
  })()

  // Step 2: Async FSRS-6 history replay outside SQLite transaction (Hard Rule #6)
  const patches: {
    cardId: number
    patch: NonNullable<Awaited<ReturnType<typeof rescheduleCardHistory>>>
  }[] = []
  for (const item of syncOutcome.cardsToReplay) {
    const patch = await rescheduleCardHistory(item.history, {
      desiredRetention: item.desiredRetention,
      weights: item.weights,
    })
    if (patch) patches.push({ cardId: item.cardId, patch })
  }

  // Step 3: Commit replayed FSRS states in one synchronous transaction
  let rescheduledCards = 0
  if (patches.length > 0) {
    database.transaction(() => {
      const stmt = database.prepare(
        `UPDATE "cards"
         SET due = ?, stability = ?, difficulty = ?, scheduled_days = ?,
             learning_step = ?, reps = ?, lapses = ?, state = ?, last_review = ?
         WHERE id = ?`,
      )
      for (const { cardId, patch } of patches) {
        const res = stmt.run(
          patch.due,
          patch.stability,
          patch.difficulty,
          patch.scheduledDays,
          patch.learningStep,
          patch.reps,
          patch.lapses,
          patch.state,
          patch.lastReview,
          cardId,
        )
        if (res.changes > 0) rescheduledCards += 1
      }
    })()
  }

  return {
    tablesProcessed: syncOutcome.tablesProcessed,
    inserted: syncOutcome.inserted,
    updated: syncOutcome.updated,
    tombstoned: syncOutcome.tombstoned,
    rescheduledCards,
  }
}

// ─── Device-local Cloud Sync config & roster re-exports ─────────────────────

export {
  SECRET_CONFIG_KEYS,
  getSyncConfig,
  saveSyncConfig,
  upsertSyncDevice,
  touchSyncDevice,
  listSyncDevices,
  recordDeletionTombstone,
  recordTombstone,
  listTombstones,
  deleteTombstone,
  type SyncProviderKind,
  type SyncConfigRecord,
  type SyncDeviceInput,
  type SyncDeviceRow,
  type SyncTombstoneRow,
} from './repos/sync-meta'
