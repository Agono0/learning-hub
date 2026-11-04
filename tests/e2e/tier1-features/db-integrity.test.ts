import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

describe('Tier 1: Database Integrity & Schema Pragmas', () => {
  const getSqlite = () => new Database(process.env.LEARNING_HUB_DB!)

  it('configures SQLite foreign keys and WAL mode', () => {
    const sqlite = getSqlite()
    try {
      const journalMode = sqlite.pragma('journal_mode', { simple: true })
      const foreignKeys = sqlite.pragma('foreign_keys', { simple: true })

      expect(String(journalMode).toLowerCase()).toBe('wal')
      expect(Number(foreignKeys)).toBe(1)
    } finally {
      sqlite.close()
    }
  })

  it('provides required analytical SQL views', () => {
    const sqlite = getSqlite()
    try {
      const views = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'view'")
        .all()
        .map((r: any) => r.name)

      expect(views).toContain('v_true_retention')
      expect(views).toContain('v_daily_reviews')
      expect(views).toContain('v_xp_daily')

      // Query views without error
      const trueRetention = sqlite.prepare('SELECT * FROM v_true_retention').all()
      const dailyReviews = sqlite.prepare('SELECT * FROM v_daily_reviews').all()
      const xpDaily = sqlite.prepare('SELECT * FROM v_xp_daily').all()

      expect(Array.isArray(trueRetention)).toBe(true)
      expect(Array.isArray(dailyReviews)).toBe(true)
      expect(Array.isArray(xpDaily)).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  it('enforces foreign key integrity on card insertion', () => {
    const sqlite = getSqlite()
    try {
      // Attempting to insert a card with non-existent deckId = 999999 must fail foreign key check
      expect(() => {
        sqlite.prepare(`
          INSERT INTO cards (deck_id, type, content, tags, due, created_at)
          VALUES (999999, 'basic', '{"basic":{"front":"test","back":"test"}}', '[]', '2026-11-04T00:00:00.000Z', '2026-11-04T00:00:00.000Z')
        `).run()
      }).toThrow(/FOREIGN KEY/i)
    } finally {
      sqlite.close()
    }
  })

  it('has required core tables present in schema', () => {
    const sqlite = getSqlite()
    try {
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r: any) => r.name)

      const expectedTables = [
        'decks',
        'cards',
        'revlog',
        'streaks',
        'xp_events',
        'elo_events',
        'mastery',
        'notes',
        'note_links',
        'note_bullets',
        'ideas',
        'idea_links',
        'focus_sessions',
        'friction_events',
        'quotes',
        'goals',
        'habits',
        'habit_logs',
        'user_settings',
      ]

      for (const table of expectedTables) {
        expect(tables).toContain(table)
      }
    } finally {
      sqlite.close()
    }
  })
})
