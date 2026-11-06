/**
 * 018 — FTS omniverse ("Search Everything"): extends the migration-003 shadow
 * table pattern to twelve more user-facing stores — journal entries, quotes,
 * reading sources, projects, mindmaps, canvases, memory palaces, WOOP goals,
 * habits, quick captures, SQ3R sessions and tutor/feynman chat sessions.
 *
 * Same contract as 003: standalone FTS5 shadow tables kept in sync by triggers,
 * backfilled once here (DELETE+INSERT, idempotent), graceful bail-out when a
 * build lacks FTS5 (search degrades to LIKE), `IF NOT EXISTS` everywhere.
 */
import type { Migration } from './runner'

interface FtsSpec {
  table: string
  fts: string
  /** searchable text expression; `p` prefixes column refs ('' backfill, 'new.'/'old.' triggers) */
  text: (p: string) => string
}

const SPECS: FtsSpec[] = [
  {
    table: 'journal_entries',
    fts: 'fts_journal',
    text: (p) =>
      `coalesce(${p}date, '') || ' ' || coalesce(${p}small_wins, '') || ' ' || coalesce(${p}gratitude, '') || ' ' || coalesce(${p}worry_dump, '') || ' ' || coalesce(${p}ai_insight, '')`,
  },
  {
    table: 'quotes',
    fts: 'fts_quotes',
    text: (p) =>
      `coalesce(${p}text, '') || ' ' || coalesce(${p}author, '') || ' ' || coalesce(${p}context, '') || ' ' || coalesce(${p}tags, '')`,
  },
  {
    table: 'sources',
    fts: 'fts_sources',
    text: (p) => `coalesce(${p}title, '') || ' ' || coalesce(${p}content, '')`,
  },
  {
    table: 'projects',
    fts: 'fts_projects',
    text: (p) => `coalesce(${p}title, '') || ' ' || coalesce(${p}description, '')`,
  },
  {
    table: 'mindmaps',
    fts: 'fts_mindmaps',
    text: (p) => `coalesce(${p}title, '') || ' ' || coalesce(${p}nodes_json, '')`,
  },
  {
    table: 'canvases',
    fts: 'fts_canvases',
    text: (p) => `coalesce(${p}title, '') || ' ' || coalesce(${p}items, '')`,
  },
  {
    table: 'palaces',
    fts: 'fts_palaces',
    text: (p) => `coalesce(${p}name, '') || ' ' || coalesce(${p}description, '')`,
  },
  {
    table: 'goals',
    fts: 'fts_goals',
    text: (p) =>
      `coalesce(${p}wish, '') || ' ' || coalesce(${p}outcome, '') || ' ' || coalesce(${p}obstacle, '') || ' ' || coalesce(${p}if_then_plan, '')`,
  },
  {
    table: 'habits',
    fts: 'fts_habits',
    text: (p) =>
      `coalesce(${p}name, '') || ' ' || coalesce(${p}cue, '') || ' ' || coalesce(${p}craving, '') || ' ' || coalesce(${p}response, '') || ' ' || coalesce(${p}reward, '')`,
  },
  {
    table: 'quick_captures',
    fts: 'fts_captures',
    text: (p) =>
      `coalesce(${p}text, '') || ' ' || coalesce(${p}source_title, '') || ' ' || coalesce(${p}tags, '')`,
  },
  {
    table: 'sq3r_sessions',
    fts: 'fts_sq3r',
    text: (p) =>
      `coalesce(${p}survey_headings, '') || ' ' || coalesce(${p}questions, '') || ' ' || coalesce(${p}recite_notes, '')`,
  },
  {
    table: 'chat_sessions',
    fts: 'fts_chats',
    text: (p) => `coalesce(${p}title, '') || ' ' || coalesce(${p}messages, '')`,
  },
]

export const ftsOmni: Migration = {
  id: 18,
  name: 'fts-omni',
  up(ctx) {
    // feature-detect FTS5 once — skip everything (search degrades to LIKE)
    try {
      ctx.raw.exec('CREATE VIRTUAL TABLE IF NOT EXISTS fts_fts5probe18 USING fts5(x)')
      ctx.raw.exec('DROP TABLE IF EXISTS fts_fts5probe18')
    } catch {
      return
    }

    for (const spec of SPECS) {
      if (!ctx.hasTable(spec.table)) continue
      const { table, fts, text } = spec
      ctx.raw.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ${fts} USING fts5(ref UNINDEXED, text)`)
      for (const suffix of ['ai', 'au', 'ad']) {
        ctx.raw.exec(`DROP TRIGGER IF EXISTS ${fts}_${suffix}`)
      }
      ctx.raw.exec(`CREATE TRIGGER ${fts}_ai AFTER INSERT ON "${table}" BEGIN
        INSERT INTO ${fts}(ref, text) VALUES (new.id, ${text('new.')});
      END;`)
      ctx.raw.exec(`CREATE TRIGGER ${fts}_au AFTER UPDATE ON "${table}" BEGIN
        DELETE FROM ${fts} WHERE ref = old.id;
        INSERT INTO ${fts}(ref, text) VALUES (new.id, ${text('new.')});
      END;`)
      ctx.raw.exec(`CREATE TRIGGER ${fts}_ad AFTER DELETE ON "${table}" BEGIN
        DELETE FROM ${fts} WHERE ref = old.id;
      END;`)
      ctx.raw.exec(`DELETE FROM ${fts};`)
      ctx.raw.exec(`INSERT INTO ${fts}(ref, text) SELECT id, ${text('')} FROM "${table}";`)
    }
  },
}
