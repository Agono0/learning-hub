/**
 * 022 — Structured implementation intentions on goals: two optional free-text
 * columns splitting the if-then plan into its halves (cue + action), so the
 * goals editor can coach the "If … then …" frame
 * (Gollwitzer & Sheeran 2006 meta-analysis, d = 0.65). The free-text
 * `if_then_plan` stays as-is — purely additive, existing goals are untouched.
 */
import type { Migration } from './runner'

export const goalIfThen: Migration = {
  id: 22,
  name: 'goal-if-then',
  up(ctx) {
    ctx.addColumn('goals', 'if_condition', 'TEXT')
    ctx.addColumn('goals', 'then_action', 'TEXT')
  },
}
