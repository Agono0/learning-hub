/**
 * 033 — max-focus-sessions (M2-03): extend focus_sessions with the Max Focus
 * lock-state columns the session state machine (packages/core focus-lock
 * session.ts) persists:
 *
 * - `state` — lock phase: locked|cooldown|can_confirm|ended.
 * - `tier` — enforcement tier reached: owner (Device Owner + Lock Task),
 *   accessibility (Tier 2), windows-admin (hooks + DisableTaskMgr),
 *   windows-basic (hooks + refocus only).
 * - `exit_reason` — logged reason for an early exit (PIN-gated flow).
 * - `hard_cap_at` — absolute hard-cap timestamp (ISO); the session auto-
 *   unlocks past it regardless of PIN/timer state (safety guarantee).
 *
 * Additive and idempotent (`addColumn` no-ops when present). Never edit after
 * it has shipped to any device (AGENTS.md rule 4).
 */
import type { Migration } from './runner'

export const maxFocusSessions: Migration = {
  id: 33,
  name: 'max-focus-sessions',
  up(ctx) {
    ctx.addColumn('focus_sessions', 'state', 'TEXT')
    ctx.addColumn('focus_sessions', 'tier', 'TEXT')
    ctx.addColumn('focus_sessions', 'exit_reason', 'TEXT')
    ctx.addColumn('focus_sessions', 'hard_cap_at', 'TEXT')
  },
}
