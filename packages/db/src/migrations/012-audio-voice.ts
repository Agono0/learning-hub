/**
 * 012 — Audio & Voice Commute Mode:
 * - `audio_sessions` tracks hands-free voice review & commute podcast sessions.
 */
import type { Migration } from './runner'

export const audioVoice: Migration = {
  id: 12,
  name: 'audio-voice',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "audio_sessions" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "deck_id" INTEGER,
      "mode" TEXT NOT NULL DEFAULT 'handsfree_review',
      "card_count" INTEGER NOT NULL DEFAULT 0,
      "duration_seconds" INTEGER NOT NULL DEFAULT 0,
      "speech_engine" TEXT NOT NULL DEFAULT 'webspeech',
      "created_at" TEXT NOT NULL
    );`)
  },
}
