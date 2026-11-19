/**
 * 029 — prototype-exemplar: append-only ledger of completed categorization
 * sessions (Rosch 1975 / Nosofsky 1986 studio history).
 *
 * One row per finished session: the raw submission (`trials_json`), the
 * engine's evaluation telemetry (`metrics_json`), and the hoisted
 * `accuracy` real for day-bucketed stats. Append-only (rule 8) — a completed
 * session is a completed event; there is no UPDATE/DELETE path anywhere, so
 * the History feed is an honest record of what the learner actually did.
 *
 * Additive and backfill-safe. Never edit after it has shipped to any device
 * (AGENTS.md rule 4).
 */
import type { Migration } from './runner'

export const prototypeExemplarSessionsMigration: Migration = {
  id: 29,
  name: 'prototype-exemplar',
  up(ctx) {
    ctx.raw.exec(`
      CREATE TABLE IF NOT EXISTS prototype_exemplar_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_id TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT 'complete',
        trials_json TEXT NOT NULL DEFAULT '[]',
        metrics_json TEXT NOT NULL DEFAULT '{}',
        accuracy REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `)
    ctx.raw.exec(
      'CREATE INDEX IF NOT EXISTS prototype_exemplar_sessions_created_idx ON prototype_exemplar_sessions (created_at);',
    )
  },
}
