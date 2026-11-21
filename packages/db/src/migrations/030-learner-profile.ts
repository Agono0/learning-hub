/**
 * 030 — learner-profile: the onboarding "readiness" profile.
 *
 * `user_settings.learner_profile` holds the profile derived from the
 * first-run questionnaire or chosen preset (packages/core/src/learner-profile):
 * trait vector, archetype, and the knob snapshot the profile recommended
 * (`appliedKnobs` — display/undo only; the knobs themselves live in their own
 * columns). JSON column, no backfill needed: absent = no profile yet, every
 * consumer must treat it as optional.
 *
 * Additive and idempotent. Never edit after it has shipped to any device
 * (AGENTS.md rule 4).
 */
import type { Migration } from './runner'

export const learnerProfileMigration: Migration = {
  id: 30,
  name: 'learner-profile',
  up(ctx) {
    ctx.addColumn('user_settings', 'learner_profile', 'TEXT')
  },
}
