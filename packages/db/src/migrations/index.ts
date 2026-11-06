/**
 * The ordered migration registry. To change the schema of EXISTING databases:
 *
 * 1. Edit `schema.ts` (the source of truth — fresh databases get it directly).
 * 2. Add `NNN-short-name.ts` here exporting a {@link Migration} whose steps
 *    bring older databases up to that schema, using only the idempotent
 *    helpers (`addColumn`, `createIndex`, …).
 * 3. Append it to {@link MIGRATIONS} — never reorder, renumber or edit a
 *    migration that has shipped.
 *
 * See AGENTS.md → "Change the database".
 */
import { baseline } from './001-baseline'
import { curriculumV2 } from './002-curriculum-v2'
import { ftsSearch } from './003-fts-search'
import { fsrsAndUndo } from './004-fsrs-and-undo'
import { syncAndOnboarding } from './005-sync-and-onboarding'
import { sq3rReading } from './006-sq3r-reading'
import { maxFocus } from './007-max-focus'
import { reminders } from './008-reminders'
import { visualLearning } from './009-visual-learning'
import { social } from './010-social'
import { online } from './011-online'
import { audioVoice } from './012-audio-voice'
import { powerTools } from './013-power-tools'
import { knowledgeGraph } from './014-knowledge-graph'
import { guildsSeasons } from './015-guilds-seasons'
import { forestWorldEconomy } from './016-forest-world-economy'
import type { Migration } from './runner'

export const MIGRATIONS: readonly Migration[] = [
  baseline,
  curriculumV2,
  ftsSearch,
  fsrsAndUndo,
  syncAndOnboarding,
  sq3rReading,
  maxFocus,
  reminders,
  visualLearning,
  social,
  online,
  audioVoice,
  powerTools,
  knowledgeGraph,
  guildsSeasons,
  forestWorldEconomy,
]

export { createMigrationContext, runMigrations, assertMigrationOrder } from './runner'
export type { Migration, MigrationContext, MigrationReport } from './runner'
