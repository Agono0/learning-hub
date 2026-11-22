/**
 * Client-side update service — the build-flavor reader, Play-Store gate,
 * device-local settings store, changelog fetch, and background check
 * scheduler for the OTA delta-update system (mega-run Epic 1; contract in
 * `@learning-hub/core/update`, ops docs in `docs/updates.md`).
 *
 * Why this lives here and not in core: core only defines the data shapes
 * (`UpdateChannel = nightly | beta | stable`). The **build flavor** is a build
 * artifact of this app — CI bakes `LH_UPDATE_CHANNEL=play` into store-distributed
 * Android builds (see O1-30 / docs/updates.md Play policy), and store policy
 * forbids self-updating. Sideload/dev builds omit the variable (or set a real
 * channel) and keep self-update on. That decision must be *baked at build
 * time*, not fetched, so a Play build can never grow a network path to the
 * updater by accident.
 *
 * Mechanics: `next.config.ts` forwards the CI-set `LH_UPDATE_CHANNEL` through
 * its `env` map, which inlines it into every bundle (web dev server, static
 * `.next-tauri` export, webview worker). This module evaluates it exactly once
 * at import time and exposes the resolved constants {@link UPDATE_BUILD_FLAVOR}
 * and {@link SELF_UPDATE_ENABLED} for O1-14 (Settings > Updates) and O1-15
 * (update banner) — both must check `SELF_UPDATE_ENABLED` before offering any
 * update action.
 *
 * Runtime-neutral: no node builtins — `process.env.X` references are replaced
 * at build time (same pattern as `transport.ts`).
 */
import {
  compareVersions,
  updateChannelSchema,
  updateSettingsSchema,
  type UpdateChannel,
  type UpdateSettings,
} from '@learning-hub/core/update'
import { apiGet, isTauri } from '@/lib/transport'

/**
 * Build-time env variable carrying the update flavor (`LH_UPDATE_CHANNEL`).
 *
 * Values understood by {@link resolveUpdateState}: `play` (store build, no
 * self-update), `nightly` / `beta` / `stable` (release channels, self-update
 * on). Matching is case-insensitive and whitespace-trimmed. Anything else —
 * including empty or unset — falls back to `nightly` with self-update enabled
 * (the sideload/dev default).
 */
export const UPDATE_CHANNEL_ENV = 'LH_UPDATE_CHANNEL'

/**
 * The update flavor a build was produced with: a release channel
 * (`nightly | beta | stable`) or the store-only `play` flavor.
 */
export type UpdateBuildFlavor = UpdateChannel | 'play'

/** The update state resolved from a build-time env value. */
export interface UpdateBuildState {
  /** Resolved flavor; unknown/missing values fall back to `nightly`. */
  flavor: UpdateBuildFlavor
  /**
   * Whether this build may self-update. `false` **only** for the `play`
   * flavor (store policy: updates go through the store). Every UI entry
   * point (Settings > Updates, update banner) must gate on this.
   */
  selfUpdateEnabled: boolean
}

/**
 * Resolve an update flavor from a raw build-time env value.
 *
 * Pure and total: never throws, never returns `undefined`. The fallback for
 * unknown input is `nightly` + self-update **on** — an unknown value can only
 * come from a misconfigured sideload build, which is allowed to self-update;
 * the restrictive case (`play`) must be spelled exactly (modulo case/whitespace)
 * so a typo can never accidentally disable the updater, and — more importantly —
 * a typo can never accidentally *enable* it on a store build that set the
 * variable correctly.
 */
export function resolveUpdateState(raw: string | undefined | null): UpdateBuildState {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (value === 'play') return { flavor: 'play', selfUpdateEnabled: false }
  const parsed = updateChannelSchema.safeParse(value)
  return parsed.success
    ? { flavor: parsed.data, selfUpdateEnabled: true }
    : { flavor: 'nightly', selfUpdateEnabled: true }
}

/** Resolved exactly once, at import time, from the build-time env value. */
const BUILD_STATE: UpdateBuildState = resolveUpdateState(process.env.LH_UPDATE_CHANNEL)

/**
 * This build's flavor, resolved once from the inlined `LH_UPDATE_CHANNEL`
 * (`''` in dev builds → `nightly`). Read-only constant; import it in UI to
 * show the active channel picker value.
 */
export const UPDATE_BUILD_FLAVOR: UpdateBuildFlavor = BUILD_STATE.flavor

/**
 * Whether this build may self-update. Baked at build time: `false` only when
 * CI set `LH_UPDATE_CHANNEL=play`. Gate every update action on this — do not
 * re-derive it from runtime state, so the store gate cannot be flipped at
 * runtime.
 */
export const SELF_UPDATE_ENABLED: boolean = BUILD_STATE.selfUpdateEnabled

/**
 * The app version baked at build time from `apps/web/package.json` (wired
 * through `next.config.ts` `env` → `LH_APP_VERSION`). Empty string when the
 * version could not be read at config time (e.g. some vitest runs) — UI
 * should fall back to a neutral "dev" label in that case.
 */
export const APP_VERSION: string = process.env.LH_APP_VERSION ?? ''

// ── Device-local update settings ────────────────────────────────────────────

/**
 * localStorage key for the device-local update settings
 * (`{ channel, autoCheckIntervalHours, wifiOnly, lastCheckedAt? }`).
 *
 * Update policy is intentionally **per device**, like the sync roster
 * (`device.ts`): it controls THIS device's updater, and until the settings
 * row gains update columns (requested in `docs/SHARED_CHANGES.md`) there is
 * no server home for it. The device-local record is validated through the
 * core {@link updateSettingsSchema} at every read — zod at the boundary — so
 * a corrupted or stale record silently falls back to the calm defaults
 * instead of poisoning the updater.
 */
const UPDATE_SETTINGS_KEY = 'lh-update-settings'

/**
 * Read the device-local update settings.
 *
 * Hydration-safe: a plain function guarded on `window` (never a module-level
 * read), mirroring `device.ts`. Returns the schema defaults when storage is
 * unavailable (SSR, tests, private-mode quota errors) or the stored JSON does
 * not validate — the user-visible behavior is "settings reset to defaults",
 * never a crash.
 */
export function loadUpdateSettings(): UpdateSettings {
  if (typeof window === 'undefined') return updateSettingsSchema.parse({})
  try {
    const raw = window.localStorage.getItem(UPDATE_SETTINGS_KEY)
    const parsed = updateSettingsSchema.safeParse(raw ? JSON.parse(raw) : {})
    return parsed.success ? parsed.data : updateSettingsSchema.parse({})
  } catch {
    return updateSettingsSchema.parse({})
  }
}

/**
 * Persist the device-local update settings (validated through the core
 * schema first — invalid input throws rather than being written). Fails
 * silently on storage errors (Safari private mode) because there is no
 * recovery action; the next {@link loadUpdateSettings} returns defaults.
 */
export function saveUpdateSettings(settings: UpdateSettings): void {
  if (typeof window === 'undefined') return
  const valid = updateSettingsSchema.parse(settings)
  try {
    window.localStorage.setItem(UPDATE_SETTINGS_KEY, JSON.stringify(valid))
  } catch {
    // storage unavailable (private mode / quota) — settings stay session-local
  }
}

// ── Channel changelog (O1-26) ───────────────────────────────────────────────

/** Release notes for a channel, as served by the /api/update/notes proxy. */
export interface ChannelNotes {
  /** Version the channel currently points at. */
  version: string
  /** RFC 3339 pointer publication timestamp. */
  publishedAt: string
  /** Notes body (may be null when the pointer carries no notes). */
  notes: string | null
}

/**
 * Fetch the changelog (release notes) for a channel through the hub transport
 * (O1-26) — never fetch the pointer cross-origin from UI code (rule 1); the
 * /api/update/notes handler proxies it and validates it through the core
 * `parseUpdatePointer` (O1-28). Returns `null` when the pointer is
 * unavailable or invalid — the UI shows an honest empty state, not an error
 * dialog, since this is information, not a failed user action.
 */
export async function fetchChannelNotes(channel: UpdateChannel): Promise<ChannelNotes | null> {
  const res = await apiGet<{
    notes?: string | null
    version?: string
    publishedAt?: string
    reason?: string
  }>('/api/update/notes', { channel })
  if (!res || typeof res.version !== 'string' || res.version === '') return null
  return {
    version: res.version,
    publishedAt: typeof res.publishedAt === 'string' ? res.publishedAt : '',
    notes: typeof res.notes === 'string' ? res.notes : null,
  }
}

// ── Check scheduler (O1-25) ─────────────────────────────────────────────────

/**
 * Why the scheduler did or did not run a background check. Surfaced for tests
 * and honest UI copy — the scheduler itself stays silent (calm by default).
 *
 * - `due` — all gates passed; run the check.
 * - `self-update-disabled` — play flavor (baked at build time, O1-12): never.
 * - `not-due` — `lastCheckedAt` is younger than `autoCheckIntervalHours`.
 * - `metered-connection` — `wifiOnly` is on and the probe reports a metered
 *   network. An **unknown** connection state does NOT defer the check: the
 *   pointer read is a few hundred bytes and ask-first (nothing downloads
 *   without consent), so staying silent would hide updates from users whose
 *   webview exposes no Network Information API.
 */
export type UpdateCheckDecisionReason =
  'due' | 'self-update-disabled' | 'not-due' | 'metered-connection'

/** The scheduler's verdict for one wake-up. */
export interface UpdateCheckDecision {
  shouldCheck: boolean
  reason: UpdateCheckDecisionReason
}

/** Inputs for the pure scheduling decision — everything injected, no clocks. */
export interface DecideUpdateCheckInput {
  /** Device-local update settings (the interval + wifi-only policy). */
  settings: UpdateSettings
  /** Current epoch ms — injected so tests own the clock. */
  nowMs: number
  /** ISO timestamp of the last successful check; invalid/absent = never. */
  lastCheckedAt?: string
  /** Unmetered-network probe result: `true`/`false`, `null` when unknown. */
  unmetered: boolean | null
}

/**
 * Decide whether a background update check should run now (O1-25).
 *
 * Pure and total: honors the build-time Play gate first (a store build never
 * checks, whatever the settings say), then the Wi-Fi-only policy (only when
 * the connection is *known* metered — see {@link isConnectionUnmetered}), and
 * finally the interval: a check is due when `lastCheckedAt` is missing,
 * unparsable, or older than `autoCheckIntervalHours`.
 */
export function decideUpdateCheck(input: DecideUpdateCheckInput): UpdateCheckDecision {
  if (!SELF_UPDATE_ENABLED) return { shouldCheck: false, reason: 'self-update-disabled' }
  if (input.settings.wifiOnly && input.unmetered === false) {
    return { shouldCheck: false, reason: 'metered-connection' }
  }
  const last = Date.parse(input.lastCheckedAt ?? '')
  if (Number.isFinite(last)) {
    const intervalMs = input.settings.autoCheckIntervalHours * 60 * 60 * 1000
    if (input.nowMs - last < intervalMs) return { shouldCheck: false, reason: 'not-due' }
  }
  return { shouldCheck: true, reason: 'due' }
}

/**
 * Minimal shape of the Network Information API entry the scheduler reads.
 * Declared locally (not in lib.dom): only Android/Chromium webviews ship it,
 * and the rest of the app must not depend on it.
 */
interface NavigatorConnection {
  /** Best-guess connection type; absent on several engines. */
  type?: string
  /** True when the user asked the browser to minimize data usage. */
  saveData?: boolean
}

/**
 * Probe whether the current connection is unmetered (Wi-Fi-only policy, O1-25).
 *
 * `host` is injectable so tests (and platform bridges) don't have to fight
 * global-stub semantics for `navigator` — undefined reads the real global.
 *
 * Returns `null` when the platform exposes no information (desktop Firefox/
 * Safari, SSR, a global without the Network Information API): callers MUST
 * treat `null` as "unknown", not as a denial — see {@link decideUpdateCheck}
 * for the asymmetry (unknown allows the cheap pointer check but still gates
 * the download in {@link requestUpdateDownload}, which is the byte-heavy
 * operation the setting actually protects). `saveData` is honored as
 * metered: the user told the browser to save data, which outranks our guess.
 */
export function isConnectionUnmetered(
  host?: { connection?: NavigatorConnection } | undefined,
): boolean | null {
  const nav: { connection?: NavigatorConnection } | undefined =
    host ??
    (typeof navigator === 'undefined'
      ? undefined
      : (navigator as { connection?: NavigatorConnection }))
  const conn = nav?.connection
  if (!conn) return null
  if (conn.saveData === true) return false
  if (conn.type === 'wifi' || conn.type === 'ethernet') return true
  if (conn.type === 'cellular') return false
  return null
}

/** What a check concluded. */
export type UpdateCheckStatus = 'up-to-date' | 'available' | 'unavailable'

/** A newer build the channel pointer names (what the banner needs). */
export interface UpdateOfferInfo {
  /** Version the channel points at, e.g. `nightly-20261122-abc1234`. */
  version: string
  /** Release notes body, or `null` when the pointer carries none. */
  notes: string | null
}

/** Result of one update check (manual "Check now" or scheduler tick). */
export interface UpdateCheckResult {
  status: UpdateCheckStatus
  /** Channel's current version, or `null` when the pointer was unavailable. */
  pointerVersion: string | null
  /** Present only when `status === 'available'`. */
  offer: UpdateOfferInfo | null
  /** Honest reason for `unavailable` (pointer fetch failed / invalid). */
  reason?: string
}

/**
 * Run one update check against the configured channel (O1-25).
 *
 * Reads the device-local settings, fetches the channel pointer through the
 * `/api/update/notes` proxy (rule 1 — no raw fetch), compares the pointer's
 * version against this build's {@link APP_VERSION} with the core
 * {@link compareVersions} (nightly-tag aware), and — on a successful pointer
 * read — persists `lastCheckedAt` so the interval policy starts from THIS
 * check (a failed check does not reset the cadence). Dev/test builds with an
 * empty `APP_VERSION` never self-offer: a source build tracks the repo, not
 * releases.
 */
export async function checkForUpdate(options?: {
  /** Channel override (defaults to the stored setting). */
  channel?: UpdateChannel
  /** Clock override for tests; defaults to `Date.now()`. */
  nowMs?: number
}): Promise<UpdateCheckResult> {
  const settings = loadUpdateSettings()
  const channel = options?.channel ?? settings.channel
  const notes = await fetchChannelNotes(channel)
  if (!notes) {
    return {
      status: 'unavailable',
      pointerVersion: null,
      offer: null,
      reason: 'pointer-unavailable',
    }
  }
  const nowMs = options?.nowMs ?? Date.now()
  saveUpdateSettings(
    updateSettingsSchema.parse({ ...settings, lastCheckedAt: new Date(nowMs).toISOString() }),
  )
  const newer = APP_VERSION ? compareVersions(notes.version, APP_VERSION) > 0 : false
  if (newer) {
    return {
      status: 'available',
      pointerVersion: notes.version,
      offer: { version: notes.version, notes: notes.notes },
    }
  }
  return { status: 'up-to-date', pointerVersion: notes.version, offer: null }
}

/** Why a download consent did not start. */
export type UpdateDownloadBlockReason =
  'self-update-disabled' | 'native-shell-required' | 'metered-connection' | 'download-failed'

/** Outcome of the consented download start. */
export type UpdateDownloadStartResult =
  { started: true } | { started: false; reason: UpdateDownloadBlockReason }

/** One update artifact, as the Rust downloader command accepts it. */
export interface UpdateDownloadRequest {
  /** https URL of the artifact (manifest `files[].url` / fullPackageUrl). */
  url: string
  /** Destination path under `<app_data_dir>/updates` (native-validated). */
  dest: string
  /** Expected total size in bytes (drives the progress events, O1-27). */
  total: number
  /** Expected sha256 hex — the downloader rejects a mismatched artifact. */
  expectedSha256: string
}

/**
 * Start a consented update download by invoking the Rust
 * `update_download_file` command (O1-25's "invoke Tauri update commands").
 *
 * Gates, in order: the build-time Play gate (store builds never invoke the
 * updater — same constant the banner checks), the native shell (a browser tab
 * cannot download into app data), and the Wi-Fi-only policy — here the
 * **unknown** connection also defers, because this is the byte-heavy
 * transfer the setting exists to protect. `opts.unmetered` injects the
 * probe result (tests / platform bridges); undefined runs the real probe.
 * The Rust side re-validates the destination path and the sha256 (defense
 * in depth); progress events arrive via `update://download-progress`
 * (O1-27 glue).
 */
export async function requestUpdateDownload(
  file: UpdateDownloadRequest,
  opts?: { unmetered?: boolean | null },
): Promise<UpdateDownloadStartResult> {
  if (!SELF_UPDATE_ENABLED) return { started: false, reason: 'self-update-disabled' }
  if (!isTauri) return { started: false, reason: 'native-shell-required' }
  const settings = loadUpdateSettings()
  const unmetered = opts && 'unmetered' in opts ? opts.unmetered : isConnectionUnmetered()
  if (settings.wifiOnly && unmetered !== true) {
    return { started: false, reason: 'metered-connection' }
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('update_download_file', {
      url: file.url,
      dest: file.dest,
      total: file.total,
      expectedSha256: file.expectedSha256,
    })
    return { started: true }
  } catch {
    return { started: false, reason: 'download-failed' }
  }
}

/** How often the scheduler wakes to re-evaluate due-ness (15 minutes). */
const SCHEDULER_POLL_MS = 15 * 60 * 1000

/** Options for the background check loop. */
export interface UpdateSchedulerOptions {
  /**
   * Wake-up cadence in ms (default 15 min — the *policy* interval is the
   * settings' `autoCheckIntervalHours`; this is just how often the loop
   * re-reads it, so a settings change takes effect without a restart).
   */
  pollIntervalMs?: number
  /** Called when a tick finds a newer version (banner / notification glue). */
  onOffer?: (offer: UpdateOfferInfo) => void
  /** Called with every completed tick result (honest logging surfaces). */
  onResult?: (result: UpdateCheckResult) => void
  /** Overrides the unmetered probe (platform bridges / tests). */
  unmeteredOverride?: boolean | null
  /** Overrides the check itself (tests / manual-mode wiring). */
  checkOverride?: () => Promise<UpdateCheckResult>
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start the background update check loop (O1-25). Single instance: starting
 * twice replaces the previous loop. The loop wakes every
 * `pollIntervalMs` (and once immediately), asks {@link decideUpdateCheck}
 * whether the device-local settings say a check is due (Play gate, interval,
 * Wi-Fi-only), and runs it through {@link checkForUpdate}. A failed tick is
 * silent — the next wake retries on cadence; a play-flavored build never
 * starts a loop at all (returns a no-op stop).
 *
 * Returns a stop function (idempotent) for effect cleanup.
 */
export function startUpdateCheckScheduler(options: UpdateSchedulerOptions = {}): () => void {
  stopUpdateCheckScheduler()
  if (!SELF_UPDATE_ENABLED) return stopUpdateCheckScheduler

  const tick = (): void => {
    void (async () => {
      const settings = loadUpdateSettings()
      const decision = decideUpdateCheck({
        settings,
        nowMs: Date.now(),
        lastCheckedAt: settings.lastCheckedAt,
        unmetered: options.unmeteredOverride ?? isConnectionUnmetered(),
      })
      if (!decision.shouldCheck) return
      try {
        const result = options.checkOverride
          ? await options.checkOverride()
          : await checkForUpdate()
        options.onResult?.(result)
        if (result.status === 'available' && result.offer) options.onOffer?.(result.offer)
      } catch {
        // Background checks never surface errors — the next tick retries.
      }
    })()
  }

  tick()
  schedulerTimer = setInterval(tick, options.pollIntervalMs ?? SCHEDULER_POLL_MS)
  return stopUpdateCheckScheduler
}

/** Stop the background loop (idempotent; safe off-scheduler). */
export function stopUpdateCheckScheduler(): void {
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
}
