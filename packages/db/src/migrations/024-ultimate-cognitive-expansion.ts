/**
 * 024 — Ultimate Cognitive Expansion (Phases 1–5):
 * - `circadian_audio_sessions` for commute & sleep auditory reviews.
 * - `tmr_cues` for nocturnal slow-wave sleep acoustic reactivation (Rasch & Born 2007).
 * - `concept_dag_nodes` & `concept_dag_edges` for Bayesian Graph Knowledge Tracing (GKT).
 * - `cognitive_telemetry_events` append-only cognitive load telemetry (Sweller CLT).
 * - `palace_3d_scenes` for walkable WebXR 3D memory palaces with 3D loci anchors.
 * - `dialectic_arena_debates` for multi-agent courtroom debate sessions and verdicts.
 */
import type { Migration } from './runner'

export const ultimateCognitiveExpansion: Migration = {
  id: 24,
  name: 'ultimate-cognitive-expansion',
  up(ctx) {
    ctx.raw.exec(`
      CREATE TABLE IF NOT EXISTS "circadian_audio_sessions" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "session_mode" TEXT NOT NULL,
        "deck_id" INTEGER REFERENCES "decks"("id") ON DELETE SET NULL,
        "cards_reviewed" INTEGER NOT NULL DEFAULT 0,
        "duration_seconds" INTEGER NOT NULL DEFAULT 0,
        "binaural_mode" TEXT,
        "hands_free_inputs" TEXT,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "circadian_audio_sessions_mode_idx" ON "circadian_audio_sessions" ("session_mode");
      CREATE INDEX IF NOT EXISTS "circadian_audio_sessions_created_idx" ON "circadian_audio_sessions" ("created_at");

      CREATE TABLE IF NOT EXISTS "tmr_cues" (
        "card_id" INTEGER PRIMARY KEY NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
        "earcon_signature" TEXT NOT NULL,
        "times_cued_awake" INTEGER NOT NULL DEFAULT 0,
        "times_cued_sleep" INTEGER NOT NULL DEFAULT 0,
        "last_sleep_cue_at" TEXT,
        "overnight_gain_score" REAL,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "tmr_cues_card_idx" ON "tmr_cues" ("card_id");

      CREATE TABLE IF NOT EXISTS "concept_dag_nodes" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "course_id" INTEGER REFERENCES "courses"("id") ON DELETE CASCADE,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "mastery_prob" REAL NOT NULL DEFAULT 0.1,
        "slip_prob" REAL NOT NULL DEFAULT 0.1,
        "guess_prob" REAL NOT NULL DEFAULT 0.2,
        "transit_prob" REAL NOT NULL DEFAULT 0.15,
        "last_assessed_at" TEXT,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "concept_dag_nodes_course_idx" ON "concept_dag_nodes" ("course_id");

      CREATE TABLE IF NOT EXISTS "concept_dag_edges" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "prerequisite_id" TEXT NOT NULL REFERENCES "concept_dag_nodes"("id") ON DELETE CASCADE,
        "dependent_id" TEXT NOT NULL REFERENCES "concept_dag_nodes"("id") ON DELETE CASCADE,
        "weight" REAL NOT NULL DEFAULT 1.0,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "concept_dag_edges_prereq_idx" ON "concept_dag_edges" ("prerequisite_id");
      CREATE INDEX IF NOT EXISTS "concept_dag_edges_dep_idx" ON "concept_dag_edges" ("dependent_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "concept_dag_edges_pair_idx" ON "concept_dag_edges" ("prerequisite_id", "dependent_id");

      CREATE TABLE IF NOT EXISTS "cognitive_telemetry_events" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "card_id" INTEGER REFERENCES "cards"("id") ON DELETE CASCADE,
        "response_latency_ms" INTEGER NOT NULL,
        "hesitation_variance" REAL,
        "edit_churn_count" INTEGER NOT NULL DEFAULT 0,
        "estimated_cli" REAL NOT NULL,
        "flow_zone" TEXT NOT NULL,
        "intervention_applied" TEXT,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "cognitive_telemetry_card_idx" ON "cognitive_telemetry_events" ("card_id");
      CREATE INDEX IF NOT EXISTS "cognitive_telemetry_created_idx" ON "cognitive_telemetry_events" ("created_at");

      CREATE TABLE IF NOT EXISTS "palace_3d_scenes" (
        "palace_id" INTEGER PRIMARY KEY NOT NULL REFERENCES "palaces"("id") ON DELETE CASCADE,
        "environment_archetype" TEXT NOT NULL DEFAULT 'roman_villa',
        "camera_start_pos" TEXT,
        "walk_path" TEXT,
        "spatial_loci" TEXT NOT NULL DEFAULT '[]',
        "audio_panning_enabled" INTEGER NOT NULL DEFAULT 1,
        "updated_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "palace_3d_scenes_palace_idx" ON "palace_3d_scenes" ("palace_id");

      CREATE TABLE IF NOT EXISTS "dialectic_arena_debates" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "topic" TEXT NOT NULL,
        "thesis_agent_role" TEXT NOT NULL,
        "antithesis_agent_role" TEXT NOT NULL,
        "transcript" TEXT NOT NULL DEFAULT '[]',
        "learner_verdict" TEXT,
        "learner_score" INTEGER,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "dialectic_arena_debates_created_idx" ON "dialectic_arena_debates" ("created_at");
    `)
  },
}
