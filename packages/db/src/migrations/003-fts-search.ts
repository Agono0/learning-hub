/**
 * 003 — FTS5 global search (M5): standalone FTS5 shadow tables for notes,
 * cards, lessons, highlights and ideas, kept in sync by triggers, backfilled
 * once here. Pure SQLite — runs identically on better-sqlite3 and the wasm
 * driver (both ship FTS5; the migration bails out safely if a future build
 * ever omits it, and search falls back to LIKE).
 *
 * Idempotent: `IF NOT EXISTS` everywhere, backfills are DELETE+INSERT.
 */
import type { Migration } from './runner'

export const ftsSearch: Migration = {
  id: 3,
  name: 'fts-search',
  up(ctx) {
    // feature-detect FTS5 once — skip everything (search degrades to LIKE)
    try {
      ctx.raw.exec('CREATE VIRTUAL TABLE IF NOT EXISTS fts_fts5probe USING fts5(x)')
      ctx.raw.exec('DROP TABLE IF EXISTS fts_fts5probe')
    } catch {
      return
    }

    // ── notes ────────────────────────────────────────────────────────────────
    if (ctx.hasTable('notes')) {
      ctx.raw.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes USING fts5(ref UNINDEXED, text)`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_notes_ai`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_notes_au`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_notes_ad`)
      ctx.raw.exec(`CREATE TRIGGER fts_notes_ai AFTER INSERT ON "notes" BEGIN
        INSERT INTO fts_notes(ref, text) VALUES (new.id, new.title || ' ' || coalesce(new.content, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_notes_au AFTER UPDATE ON "notes" BEGIN
        DELETE FROM fts_notes WHERE ref = old.id;
        INSERT INTO fts_notes(ref, text) VALUES (new.id, new.title || ' ' || coalesce(new.content, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_notes_ad AFTER DELETE ON "notes" BEGIN
        DELETE FROM fts_notes WHERE ref = old.id;
      END;`)
      ctx.raw.exec(`DELETE FROM fts_notes;`)
      ctx.raw.exec(
        `INSERT INTO fts_notes(ref, text) SELECT id, title || ' ' || coalesce(content, '') FROM "notes";`,
      )
    }

    // ── cards ────────────────────────────────────────────────────────────────
    if (ctx.hasTable('cards')) {
      ctx.raw.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_cards USING fts5(ref UNINDEXED, text)`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_cards_ai`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_cards_au`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_cards_ad`)
      // searchable text: tags + every format's front/question text (JSON1);
      // `${p}` prefixes the column refs ('' for backfill, 'new.' for triggers)
      const cardText = (p: string) => `coalesce(${p}tags, '') || ' ' ||
        coalesce(json_extract(${p}content, '$.basic.front'), '') || ' ' ||
        coalesce(json_extract(${p}content, '$.basic.back'), '') || ' ' ||
        coalesce(json_extract(${p}content, '$.cloze.text'), '') || ' ' ||
        coalesce(json_extract(${p}content, '$.mcq.question'), '') || ' ' ||
        coalesce(json_extract(${p}content, '$.typein.question'), '') || ' ' ||
        coalesce(json_extract(${p}content, '$.grammar.sentence'), '')`
      ctx.raw.exec(`CREATE TRIGGER fts_cards_ai AFTER INSERT ON "cards" BEGIN
        INSERT INTO fts_cards(ref, text) VALUES (new.id, ${cardText('new.')});
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_cards_au AFTER UPDATE ON "cards" BEGIN
        DELETE FROM fts_cards WHERE ref = old.id;
        INSERT INTO fts_cards(ref, text) VALUES (new.id, ${cardText('new.')});
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_cards_ad AFTER DELETE ON "cards" BEGIN
        DELETE FROM fts_cards WHERE ref = old.id;
      END;`)
      ctx.raw.exec(`DELETE FROM fts_cards;`)
      ctx.raw.exec(`INSERT INTO fts_cards(ref, text) SELECT id, ${cardText('')} FROM "cards";`)
    }

    // ── lessons ──────────────────────────────────────────────────────────────
    if (ctx.hasTable('lessons')) {
      ctx.raw.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_lessons USING fts5(ref UNINDEXED, text)`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_lessons_ai`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_lessons_au`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_lessons_ad`)
      ctx.raw.exec(`CREATE TRIGGER fts_lessons_ai AFTER INSERT ON "lessons" BEGIN
        INSERT INTO fts_lessons(ref, text) VALUES (new.id, new.title || ' ' || coalesce(json_extract(new.content, '$.body'), ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_lessons_au AFTER UPDATE ON "lessons" BEGIN
        DELETE FROM fts_lessons WHERE ref = old.id;
        INSERT INTO fts_lessons(ref, text) VALUES (new.id, new.title || ' ' || coalesce(json_extract(new.content, '$.body'), ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_lessons_ad AFTER DELETE ON "lessons" BEGIN
        DELETE FROM fts_lessons WHERE ref = old.id;
      END;`)
      ctx.raw.exec(`DELETE FROM fts_lessons;`)
      ctx.raw.exec(
        `INSERT INTO fts_lessons(ref, text) SELECT id, title || ' ' || coalesce(json_extract(content, '$.body'), '') FROM "lessons";`,
      )
    }

    // ── highlights ───────────────────────────────────────────────────────────
    if (ctx.hasTable('highlights')) {
      ctx.raw.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS fts_highlights USING fts5(ref UNINDEXED, text)`,
      )
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_highlights_ai`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_highlights_au`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_highlights_ad`)
      ctx.raw.exec(`CREATE TRIGGER fts_highlights_ai AFTER INSERT ON "highlights" BEGIN
        INSERT INTO fts_highlights(ref, text) VALUES (new.id, coalesce(new.text, '') || ' ' || coalesce(new.note, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_highlights_au AFTER UPDATE ON "highlights" BEGIN
        DELETE FROM fts_highlights WHERE ref = old.id;
        INSERT INTO fts_highlights(ref, text) VALUES (new.id, coalesce(new.text, '') || ' ' || coalesce(new.note, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_highlights_ad AFTER DELETE ON "highlights" BEGIN
        DELETE FROM fts_highlights WHERE ref = old.id;
      END;`)
      ctx.raw.exec(`DELETE FROM fts_highlights;`)
      ctx.raw.exec(
        `INSERT INTO fts_highlights(ref, text) SELECT id, coalesce(text, '') || ' ' || coalesce(note, '') FROM "highlights";`,
      )
    }

    // ── ideas ────────────────────────────────────────────────────────────────
    if (ctx.hasTable('ideas')) {
      ctx.raw.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_ideas USING fts5(ref UNINDEXED, text)`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_ideas_ai`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_ideas_au`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_ideas_ad`)
      ctx.raw.exec(`CREATE TRIGGER fts_ideas_ai AFTER INSERT ON "ideas" BEGIN
        INSERT INTO fts_ideas(ref, text) VALUES (new.id, new.title || ' ' || coalesce(new.content, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_ideas_au AFTER UPDATE ON "ideas" BEGIN
        DELETE FROM fts_ideas WHERE ref = old.id;
        INSERT INTO fts_ideas(ref, text) VALUES (new.id, new.title || ' ' || coalesce(new.content, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_ideas_ad AFTER DELETE ON "ideas" BEGIN
        DELETE FROM fts_ideas WHERE ref = old.id;
      END;`)
      ctx.raw.exec(`DELETE FROM fts_ideas;`)
      ctx.raw.exec(
        `INSERT INTO fts_ideas(ref, text) SELECT id, title || ' ' || coalesce(content, '') FROM "ideas";`,
      )
    }
  },
}
