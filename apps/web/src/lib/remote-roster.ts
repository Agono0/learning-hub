/**
 * Read model for a remote league's public state. The parser lives in core so
 * the CLI shows exactly what the panel shows; this file keeps the web import
 * path stable.
 */
export {
  MAX_MOD_ROWS,
  MAX_ROSTER_ROWS,
  cleanName,
  parseRemoteRoster,
  type ModerationRow,
  type RemoteRoster,
  type RosterMember,
} from '@learning-hub/core/leagues'
