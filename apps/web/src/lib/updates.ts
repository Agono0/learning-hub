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
import { updateChannelSchema, type UpdateChannel } from '@learning-hub/core/update'

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
