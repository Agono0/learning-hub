/**
 * Client-side update service — the build-flavor reader and Play-Store gate for
 * the OTA delta-update system (mega-run Epic 1; contract in
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
  updateChannelSchema,
  updateSettingsSchema,
  type UpdateChannel,
  type UpdateSettings,
} from '@learning-hub/core/update'
import { apiGet } from '@/lib/transport'

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
