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
import { companionDecor } from './017-companion-decor'
import { ftsOmni } from './018-fts-omni'
import { embeddingsOmni } from './019-embeddings-omni'
import { pushSubscriptions } from './020-push-subscriptions'
import { syncDevices } from './021-sync-devices'
import { goalIfThen } from './022-goal-if-then'
import { deckDelayedFeedback } from './023-deck-delayed-feedback'
import { ultimateCognitiveExpansion } from './024-ultimate-cognitive-expansion'
import { cognitiveUpsertKeys } from './025-cognitive-upsert-keys'
import { exposureEventsMigration } from './026-exposure-events'
import { hapticsSetting } from './027-haptics-setting'
import { notificationCenter } from './028-notification-center'
import { prototypeExemplarSessionsMigration } from './029-prototype-exemplar'
import { learnerProfileMigration } from './030-learner-profile'
import { spTasks } from './031-sp-tasks'
import { spViews } from './032-sp-views'
import { maxFocusSessions } from './033-max-focus-sessions'
import { spTaskColumns } from './034-sp-task-columns'
import { taskFts } from './035-task-fts'
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
  companionDecor,
  ftsOmni,
  embeddingsOmni,
  pushSubscriptions,
  syncDevices,
  goalIfThen,
  deckDelayedFeedback,
  ultimateCognitiveExpansion,
  cognitiveUpsertKeys,
  exposureEventsMigration,
  hapticsSetting,
  notificationCenter,
  prototypeExemplarSessionsMigration,
  learnerProfileMigration,
  spTasks,
  spViews,
  maxFocusSessions,
  spTaskColumns,
  taskFts,
]

export { createMigrationContext, runMigrations, assertMigrationOrder } from './runner'
export type { Migration, MigrationContext, MigrationReport } from './runner'
