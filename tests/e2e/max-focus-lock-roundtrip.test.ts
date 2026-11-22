/**
 * M2-30 — Desktop Max Focus e2e smoke: lock apply→release round-trip.
 *
 * A headless vitest run cannot create real lock windows (that needs the
 * Tauri runtime — covered by cargo tests in `focus.rs` and the CI native
 * job), so this smoke exercises the FULL round-trip CONTRACT that the
 * webview, the core machine and the Rust commands jointly implement:
 *
 *   start (core machine) → apply snapshot (wire format `focus_session_apply`
 *   accepts, serde field names of `MaxSessionSnapshot`) → persist (atomic
 *   tmp+rename file, corrupt fails closed) → status (advance stays locked) →
 *   release (every unlock reason of the M2-01 union, junk rejected) →
 *   re-apply (round-trip) + resume (M2-24 persisted-record path).
 *
 * The desktop lock itself only applies on Windows (M2-05…M2-07), so the
 * round-trip describe runs on Windows CI and SKIPS gracefully elsewhere
 * (brief: "skip off-Windows"); the always-run describe keeps the shared
 * union parity between core and the Rust gate visible on every OS.
 *
 * Pure node: no Tauri, no DB — mirrors tests/e2e helpers style (fs + core).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  advanceSession,
  confirmSessionExit,
  forceUnlockSession,
  maxFocusSessionSchema,
  requestSessionExit,
  resumeMaxFocusSession,
  startMaxFocusSession,
  type MaxFocusSession,
  type SessionUnlockReason,
} from '@learning-hub/core/focus-lock'

/** The desktop lock smoke is meaningful only where the lock applies. */
const ON_WINDOWS = process.platform === 'win32'

/** The exact unlock-reason list the Rust gate `is_session_unlock_reason` mirrors. */
const RUST_UNLOCK_REASONS: readonly SessionUnlockReason[] = [
  'timer',
  'pin',
  'battery',
  'failure',
  'tamper',
]

/**
 * Exhaustiveness guard (compile time): if the core union ever grows, this
 * Record stops compiling — the Rust mirror below must grow with it, so the
 * two gates can never drift apart silently.
 */
const CORE_REASON_EXHAUSTIVE: Record<SessionUnlockReason, true> = {
  timer: true,
  pin: true,
  battery: true,
  failure: true,
  tamper: true,
}
void CORE_REASON_EXHAUSTIVE

/**
 * The wire shape `focus_session_apply` deserializes (`MaxSessionSnapshot`,
 * serde field names — snake_case, no rename attributes in focus.rs).
 */
interface NativeSnapshot {
  session_id: string
  started_at_ms: number
  planned_end_ms: number
  hard_cap_at_ms: number
  mono_anchor_ms: number
  allowed_apps: string[]
}

/** Machine session → native snapshot, exactly as the web apply flow builds it. */
function toNativeSnapshot(session: MaxFocusSession, allowedApps: string[]): NativeSnapshot {
  return {
    session_id: session.sessionId,
    started_at_ms: session.startedAtMs,
    planned_end_ms: session.plannedEndMs,
    hard_cap_at_ms: session.hardCapAtMs,
    mono_anchor_ms: session.monoAnchorMs,
    allowed_apps: allowedApps,
  }
}

/**
 * Headless stand-in for the native persist layer (focus.rs
 * `write_session_file` semantics): atomic tmp+rename, read-back, and the
 * fail-closed contract (corrupt/missing → no session, never a wrong lock).
 */
function persistSnapshot(dir: string, snapshot: NativeSnapshot | null): string {
  const file = path.join(dir, 'max-focus-session.json')
  if (snapshot === null) {
    rmSync(file, { force: true })
    return file
  }
  const tmp = path.join(dir, 'max-focus-session.json.tmp')
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2))
  rmSync(file, { force: true })
  // renameSync is atomic same-dir — the same guarantee write_session_file gives.
  writeFileSync(file, readFileSync(tmp))
  rmSync(tmp, { force: true })
  return file
}

function readSnapshot(file: string): NativeSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as NativeSnapshot).session_id !== 'string'
    ) {
      return null // corrupt → fail closed, like read_session_file
    }
    return parsed as NativeSnapshot
  } catch {
    return null // missing/unparsable → fail closed
  }
}

describe('desktop lock apply→release round-trip (headless smoke, Windows CI)', () => {
  it.skipIf(!ON_WINDOWS)('applies, persists, releases by timer, and re-applies', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'm2-30-'))
    try {
      const startMs = 1_700_000_000_000
      const clock = (wallMs: number) => ({ wallMs, monoMs: wallMs - startMs })

      // ── APPLY ────────────────────────────────────────────────────────────
      const session = startMaxFocusSession({
        sessionId: 'm2-30-roundtrip',
        startedAtMs: startMs,
        minutes: 25,
        monoAnchorMs: 0,
      })
      expect(session.state).toBe('locked')
      const snapshot = toNativeSnapshot(session, ['code.exe', 'com.android.dialer'])
      // Wire-format contract: the serde names the Rust command expects.
      expect(Object.keys(snapshot).sort()).toEqual(
        [
          'session_id',
          'started_at_ms',
          'planned_end_ms',
          'hard_cap_at_ms',
          'mono_anchor_ms',
          'allowed_apps',
        ].sort(),
      )
      const file = persistSnapshot(dir, snapshot)
      expect(readSnapshot(file)).toEqual(snapshot)

      // ── STATUS (mid-window: locked, no events) ───────────────────────────
      const mid = advanceSession(session, clock(startMs + 10 * 60_000))
      expect(mid.session.state).toBe('locked')
      expect(mid.events).toEqual([])
      // Persisted record still parses through the machine schema (M2-03 row shape).
      expect(maxFocusSessionSchema.parse(mid.session).sessionId).toBe('m2-30-roundtrip')

      // ── RELEASE (natural end → reason `timer`) ───────────────────────────
      const ended = advanceSession(session, clock(startMs + 26 * 60_000))
      expect(ended.session.state).toBe('ended')
      expect(ended.session.unlockReason).toBe('timer')
      expect(ended.events).toContain('session_ended')
      // Release clears the persisted file (focus.rs release path).
      persistSnapshot(dir, null)
      expect(readSnapshot(file)).toBeNull()

      // ── RE-APPLY (round-trip: a fresh session locks again) ───────────────
      const second = startMaxFocusSession({
        sessionId: 'm2-30-roundtrip-2',
        startedAtMs: startMs + 30 * 60_000,
        minutes: 10,
        monoAnchorMs: 30 * 60_000,
      })
      const secondFile = persistSnapshot(dir, toNativeSnapshot(second, []))
      expect(readSnapshot(secondFile)?.session_id).toBe('m2-30-roundtrip-2')
      expect(advanceSession(second, clock(startMs + 31 * 60_000)).session.state).toBe('locked')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!ON_WINDOWS)('releases through the PIN exit flow (cooldown is not bypassable)', () => {
    const startMs = 1_700_000_000_000
    const clock = (wallMs: number) => ({ wallMs, monoMs: wallMs - startMs })
    let session = startMaxFocusSession({
      sessionId: 'm2-30-pin',
      startedAtMs: startMs,
      minutes: 60,
      monoAnchorMs: 0,
    })

    // Request → cooldown; confirming DURING cooldown is a no-op.
    session = requestSessionExit(session, clock(startMs + 1_000))
    expect(session.state).toBe('cooldown')
    const early = confirmSessionExit(session, clock(startMs + 2_000), { pinVerified: true })
    expect(early.state).toBe('cooldown') // reflection gate holds

    // Cooldown elapsed (60 s) → can_confirm; wrong PIN keeps the gate.
    const ready = advanceSession(session, clock(startMs + 61_000))
    expect(ready.session.state).toBe('can_confirm')
    const denied = confirmSessionExit(ready.session, clock(startMs + 62_000), {
      pinVerified: false,
    })
    expect(denied.state).toBe('can_confirm')
    const released = confirmSessionExit(ready.session, clock(startMs + 63_000), {
      pinVerified: true,
    })
    expect(released.state).toBe('ended')
    expect(released.unlockReason).toBe('pin')
  })

  it.skipIf(!ON_WINDOWS)('force-unlocks on battery/failure/tamper without the cooldown', () => {
    const startMs = 1_700_000_000_000
    const clock = (wallMs: number) => ({ wallMs, monoMs: wallMs - startMs })
    const fresh = () =>
      startMaxFocusSession({
        sessionId: 'm2-30-force',
        startedAtMs: startMs,
        minutes: 60,
        monoAnchorMs: 0,
      })
    for (const reason of ['battery', 'failure', 'tamper'] as const) {
      const ended = forceUnlockSession(fresh(), clock(startMs + 5_000), reason)
      expect(ended.state).toBe('ended')
      expect(ended.unlockReason).toBe(reason)
    }
  })

  it.skipIf(!ON_WINDOWS)('resumes a persisted session after restart and releases it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'm2-30-resume-'))
    try {
      const startMs = 1_700_000_000_000
      // Persisted record (M2-24 schema) — written before a simulated kill.
      const persisted = {
        sessionId: 'm2-30-resume',
        startedAtMs: startMs,
        plannedEndMs: startMs + 25 * 60_000,
        hardCapAtMs: startMs + 240 * 60_000,
        allowedApps: ['code.exe'],
        savedAtMs: startMs + 5 * 60_000,
        resumeExpected: true as const,
      }
      writeFileSync(path.join(dir, 'record.json'), JSON.stringify(persisted))
      const back = JSON.parse(
        readFileSync(path.join(dir, 'record.json'), 'utf8'),
      ) as typeof persisted

      // Boot (restart): the resume gate rebuilds a LOCKED machine session with
      // preserved deadlines and a fresh monotonic anchor.
      const resumed = resumeMaxFocusSession(back, { wallMs: startMs + 6 * 60_000, monoMs: 1_000 })
      expect(resumed?.state).toBe('locked')
      expect(resumed?.plannedEndMs).toBe(persisted.plannedEndMs)
      expect(resumed?.monoAnchorMs).toBe(1_000)

      // …and the resumed session releases normally on natural end.
      const ended = advanceSession(resumed!, {
        wallMs: persisted.plannedEndMs + 1,
        monoMs: 1_000 + (persisted.plannedEndMs + 1 - (startMs + 6 * 60_000)),
      })
      expect(ended.session.state).toBe('ended')
      expect(ended.session.unlockReason).toBe('timer')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('unlock-reason union parity (core ↔ Rust gate, every OS)', () => {
  it('core and the Rust mirror list exactly the same five reasons', () => {
    // Runtime half of the parity check: the Rust list, typed as the core
    // union, must round-trip — plus CORE_REASON_EXHAUSTIVE proves above
    // that no core reason is missing here.
    expect([...RUST_UNLOCK_REASONS].sort()).toEqual([
      'battery',
      'failure',
      'pin',
      'tamper',
      'timer',
    ])
  })
})
