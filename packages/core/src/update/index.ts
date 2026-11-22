/**
 * Learning HUB — Update domain (OTA delta-update contracts, pure + runtime-neutral).
 *
 * This module is the CONTRACT for the whole self-update system (docs/updates.md,
 * mega-run Epic 1 "O1"). Architecture, in one breath:
 *
 * 1. **Content-addressed manifest over the `.next-tauri` export.** CI builds the
 *    web bundle (`npm run web:tauri`), hashes every emitted file (sha256 + size),
 *    and publishes `manifest.json` to GitHub Releases. Because every file is
 *    addressed by content hash, a "hot update" is just: download the files whose
 *    hashes differ from the locally installed manifest.
 * 2. **Ed25519 minisign signatures.** Both the manifest and the official
 *    Tauri-updater `latest.json` are signed with an Ed25519 minisign key; the
 *    public key ships in `tauri.conf.json`. Verification happens in the native
 *    layer (O1-02) and is NEVER disabled — a manifest whose signature does not
 *    verify is treated as hostile, not as untrusted-but-usable.
 * 3. **A/B slots.** Updates download into the inactive slot under app data
 *    (O1-03); an atomic pointer file selects the active slot; boot-confirm
 *    rollback (O1-05) flips back when the new build never reports ready.
 * 4. **`nightly.json` pointer on GitHub Releases.** One small pointer document
 *    per channel (`UpdatePointer`) names the current version and the manifest
 *    URL. Clients check the pointer first; only on a newer version do they
 *    fetch (and verify) the manifest.
 * 5. **Channels: `nightly | beta | stable`.** Promotion (O1-11) re-points a
 *    channel at an already-published, already-verified build.
 * 6. **Play builds disable self-update.** Store-distributed Android builds bake
 *    in `LH_UPDATE_CHANNEL=play` and must never self-update (store policy).
 *    That gate lives in the client service layer (`apps/web/src/lib/updates.ts`,
 *    O1-12), NOT here — this module only defines the data shapes.
 *
 * Design-law notes (enforced by review + tests here):
 * - **https everywhere.** Every URL in a manifest, patch or pointer must be
 *   https — enforced by {@link assertHttps} inside the zod schemas, so a plain
 *   `http://` document fails validation before it can ever reach the downloader.
 * - **Signature verification is a native-layer invariant.** Nothing in this
 *   module can turn it off; these schemas only carry the data to verify.
 * - **Ask-first apply.** `updateSettingsSchema.autoApply` is a `z.literal(false)`
 *   so persisted settings can never opt into silent installs; forward-compat is
 *   preserved by widening the literal later, never by allowing `true` today.
 * - Semantics for "is there a newer build?" live in {@link compareVersions},
 *   which understands the CI nightly tag format (`nightly-YYYYMMDD-<sha>`,
 *   see O1-08) in addition to semver-ish release versions.
 *
 * Pure logic only: no I/O, no fetch, no node builtins (core rule).
 */
import { z } from 'zod'

// ── Channels ────────────────────────────────────────────────────────────────

/** Release channels, most-to-least volatile: `nightly` → `beta` → `stable`. */
export const updateChannelSchema = z.enum(['nightly', 'beta', 'stable'])

/** A release channel name. */
export type UpdateChannel = z.infer<typeof updateChannelSchema>

// ── Platforms ───────────────────────────────────────────────────────────────

/**
 * Platform/ABI keys used inside manifests. Windows builds are universal to the
 * x86_64 target; Android ships per-ABI APKs (matching the per-ABI CI matrix)
 * plus a `universal` APK used by the sideload installer when the device ABI is
 * unknown.
 */
export const platformSchema = z.enum([
  'windows-x86_64',
  'android-arm64-v8a',
  'android-armeabi-v7a',
  'android-x86_64',
  'android-universal',
])

/** A supported update platform key. */
export type UpdatePlatform = z.infer<typeof platformSchema>

// ── HTTPS enforcement ───────────────────────────────────────────────────────

/**
 * True when `url` parses as an absolute `https://` URL.
 *
 * Design law: update artifacts travel over https only. Every URL-bearing field
 * in this module `.refine()`s through this helper, so rejecting cleartext
 * happens at the boundary, before any downloader sees the value. Also exported
 * for the client service and handlers to re-check user-entered endpoints.
 */
export function assertHttps(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** An https-only URL string (used for manifests, patches, pointers). */
const httpsUrlSchema = z.string().url().refine(assertHttps, 'Update URLs must use https://')

/**
 * An RFC 3339 timestamp string (UTC `Z` or numeric offset both accepted).
 * Pointers and manifests are produced by CI, which emits `new Date().toISOString()`.
 */
const rfc3339Schema = z.string().datetime({ offset: true })

/** Lowercase hex sha-256 digest of a file's bytes (64 chars, content address). */
const sha256Schema = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/, 'Must be lowercase hex sha-256')

// ── Manifest ────────────────────────────────────────────────────────────────

/** One file inside a content-addressed manifest. */
export const updateFileSchema = z.object({
  /** Repo-root-relative path within the `.next-tauri` export (e.g. `_next/...`). */
  path: z.string().min(1),
  /** sha256 of the file bytes, lowercase hex — the content address. */
  sha256: sha256Schema,
  /** File size in bytes (positive integer). */
  size: z.number().int().positive(),
})

/** One file entry of {@link UpdateManifest}. */
export type UpdateFile = z.infer<typeof updateFileSchema>

/** One delta patch: fetches only what changed from `fromVersion` to this build. */
export const updatePatchSchema = z.object({
  /** Version the patch applies to; must equal the client's installed version. */
  fromVersion: z.string().min(1),
  /** https URL of the patch artifact on the release. */
  url: httpsUrlSchema,
  /** sha256 of the patch artifact bytes, lowercase hex. */
  sha256: sha256Schema,
  /** Patch artifact size in bytes (positive integer). */
  size: z.number().int().positive(),
})

/** One delta-patch entry of {@link UpdateManifest}. */
export type UpdatePatch = z.infer<typeof updatePatchSchema>

/**
 * The content-addressed build manifest (`manifest.json` on GitHub Releases).
 *
 * `files` lists every file of the `.next-tauri` export with its sha256 + size,
 * which is the ground truth for hot updates; `patches` (at most 5, matching
 * O1-19's "upgrade from any of the last 5 manifests") offers delta downloads
 * from recent versions; `fullPackageUrl` is the always-valid fallback.
 */
export const updateManifestSchema = z.object({
  /** Manifest contract version — bump only with an ADR + client fallback path. */
  manifestVersion: z.literal(1),
  /** Channel this build was published to. */
  channel: updateChannelSchema,
  /** Semver-ish build version (see {@link compareVersions}; nightly tags allowed). */
  version: z.string().min(1),
  /** Git commit the build was produced from (short-or-long sha, 7–40 chars). */
  buildSha: z.string().min(7).max(40),
  /** RFC 3339 publication timestamp. */
  createdAt: rfc3339Schema,
  /**
   * Minimum native shell version this web build runs against. If the installed
   * shell is older, the webview cannot hot-update itself and the user must be
   * routed to the full installer/APK.
   */
  minNativeVersion: z.string().min(1),
  /**
   * True when this release needs a new native installer/APK (shell, Rust code or
   * permissions changed) rather than a web-only hot update.
   */
  requiresNative: z.boolean(),
  /** Content-addressed file list of the `.next-tauri` export (≥ 1 file). */
  files: z.array(updateFileSchema).min(1),
  /** Delta patches from up to the 5 most recent previous versions. */
  patches: z.array(updatePatchSchema).max(5),
  /** https URL of the full package (NSIS installer / APK) — the patch fallback. */
  fullPackageUrl: httpsUrlSchema,
})

/** The parsed {@link updateManifestSchema} shape. */
export type UpdateManifest = z.infer<typeof updateManifestSchema>

// ── Pointer (nightly.json) ──────────────────────────────────────────────────

/**
 * The per-channel pointer document (`nightly.json` on GitHub Releases): one
 * tiny cacheable file clients check before downloading anything heavier.
 * `manifestUrl` points at the signed manifest; the manifest itself is the
 * security boundary (signature + per-file hashes).
 */
export const updatePointerSchema = z.object({
  /** Channel the pointer belongs to. */
  channel: updateChannelSchema,
  /** Current version on the channel (see {@link compareVersions}). */
  version: z.string().min(1),
  /** https URL of the signed manifest for this build. */
  manifestUrl: httpsUrlSchema,
  /** RFC 3339 timestamp of when the pointer was published. */
  publishedAt: rfc3339Schema,
  /** Optional human-facing release notes for the banner/changelog panel. */
  notes: z.string().optional(),
})

/** The parsed {@link updatePointerSchema} shape. */
export type UpdatePointer = z.infer<typeof updatePointerSchema>

// ── Tauri official-updater latest.json ──────────────────────────────────────

/** Per-platform entry of the official Tauri updater document. */
export const latestJsonPlatformSchema = z.object({
  /** https URL of the platform installer/patch artifact. */
  url: httpsUrlSchema,
  /** Minisign (Ed25519) signature of the artifact, as emitted by the signer. */
  signature: z.string().min(1),
})

/** The official Tauri updater `latest.json` shape consumed on Windows. */
export const latestJsonSchema = z.object({
  /** Version string of the update (semver-ish; compared by the native layer). */
  version: z.string().min(1),
  /** Release notes rendered by the updater dialog. */
  notes: z.string(),
  /** RFC 3339 publication date (Tauri's `pub_date`). */
  pub_date: rfc3339Schema,
  /** Platform → artifact map (Tauri target-triple-ish keys, e.g. `windows-x86_64`). */
  platforms: z.record(z.string(), latestJsonPlatformSchema),
})

/** The parsed {@link latestJsonSchema} shape. */
export type LatestJson = z.infer<typeof latestJsonSchema>

// ── Version comparison ──────────────────────────────────────────────────────

/**
 * Compare two semver-ish version strings.
 *
 * Returns `-1` when `a < b`, `0` when equal, `1` when `a > b`. Designed for the
 * version formats this system actually publishes:
 *
 * - Release versions: `1.2.3` (numeric dot segments; missing segments = 0, so
 *   `1.2` == `1.2.0`).
 * - Classic prereleases (semver §11): `1.2.3-beta.1 < 1.2.3-beta.2 < 1.2.3-rc.1
 *   < 1.2.3`.
 * - CI nightly tags, `nightly-YYYYMMDD-<sha>` (O1-08): the `nightly-` prefix is
 *   stripped, then the date is the numeric base and the short sha is the tag —
 *   so `20261122-abc1234` sorts AFTER the bare base `20261122` (same prefix),
 *   `20261121-…` sorts before `20261122-…`, and any nightly of a real date
 *   outranks old-style release numbers.
 * - Build metadata (`+…`) is ignored for ordering (semver §10).
 *
 * Defensive by design: `null`/`undefined`/empty coerce to the empty version,
 * non-numeric segments fall back to lexicographic order, and huge numeric
 * identifiers are compared length-then-lexicographically so precision loss can
 * never flip an ordering.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a)
  const pb = parseVersion(b)

  const base = compareBaseSegments(pa.base, pb.base)
  if (base !== 0) return sign(base)

  if (pa.suffix !== undefined && pb.suffix !== undefined) {
    return sign(compareSuffixIdentifiers(pa.suffix, pb.suffix))
  }
  // Equal release, exactly one side tagged. Nightly date-stamp builds are
  // *newer* than their bare base (20261122-abc1234 > 20261122); classic
  // semver prereleases are *older* than their release (1.2.3-beta.1 < 1.2.3).
  if (pa.suffix !== undefined) return pa.nightly ? 1 : -1
  if (pb.suffix !== undefined) return pb.nightly ? -1 : 1
  return 0
}

/** Parsed version used by {@link compareVersions}. */
interface ParsedVersion {
  /** Dot-separated base segments: numbers where numeric, strings otherwise. */
  base: (number | string)[]
  /** Text after the first `-` (prerelease / nightly sha), if present. */
  suffix?: string
  /** True when the base is a bare nightly date stamp like `20261122`. */
  nightly: boolean
}

/**
 * Parse a version string defensively: lowercase, drop `nightly-`/`v` prefixes,
 * ignore `+build` metadata, split base/suffix on the first `-`, and split the
 * base into dot segments (numeric where possible).
 */
function parseVersion(input: string): ParsedVersion {
  let v = String(input ?? '')
    .trim()
    .toLowerCase()
  v = v.replace(/^nightly-/, '').replace(/^v(?=\d)/, '')
  const plus = v.indexOf('+')
  if (plus >= 0) v = v.slice(0, plus)
  const dash = v.indexOf('-')
  const basePart = dash >= 0 ? v.slice(0, dash) : v
  const suffix = dash >= 0 ? v.slice(dash + 1) : undefined
  const base =
    basePart === '' ? [] : basePart.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg))
  const nightly =
    base.length === 1 && typeof base[0] === 'number' && /^\d{8,}$/.test(String(base[0]))
  return { base, suffix, nightly }
}

/** Compare base segments positionally; missing segments count as 0. */
function compareBaseSegments(a: (number | string)[], b: (number | string)[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1
    } else {
      // Mixed/identifer segment: deterministic lexicographic fallback.
      const xs = String(x)
      const ys = String(y)
      if (xs !== ys) return xs < ys ? -1 : 1
    }
  }
  return 0
}

/**
 * Compare dot-separated suffix identifiers (semver §11): numeric identifiers
 * compare numerically, alphanumeric lexicographically, and numeric identifiers
 * rank below alphanumeric ones; a longer identifier list wins when the common
 * prefix is equal.
 */
function compareSuffixIdentifiers(a: string, b: string): number {
  const as = a.split('.')
  const bs = b.split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const x = as[i]
    const y = bs[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNum = /^\d+$/.test(x)
    const yNum = /^\d+$/.test(y)
    if (xNum && yNum) {
      if (x.length !== y.length) return x.length < y.length ? -1 : 1
      if (x !== y) return x < y ? -1 : 1
    } else if (xNum) {
      return -1
    } else if (yNum) {
      return 1
    } else {
      if (x !== y) return x < y ? -1 : 1
    }
  }
  return 0
}

/** Normalize a numeric comparison result to the `-1 | 0 | 1` contract. */
function sign(n: number): -1 | 0 | 1 {
  return n < 0 ? -1 : n > 0 ? 1 : 0
}

// ── Patch selection ─────────────────────────────────────────────────────────

/**
 * Pick the delta patch in `manifest` that upgrades `fromVersion` to the
 * manifest's version.
 *
 * Matching is done via {@link compareVersions} equality (not raw string
 * equality), so `nightly-20261122-abc1234` still matches a patch published for
 * `20261122-abc1234`, and `1.0` matches `1.0.0`. Returns the first matching
 * patch, or `null` when none applies — `null` means "fall back to the full
 * package download" (`manifest.fullPackageUrl`), never an error.
 */
export function pickPatch(manifest: UpdateManifest, fromVersion: string): UpdatePatch | null {
  return manifest.patches.find((p) => compareVersions(p.fromVersion, fromVersion) === 0) ?? null
}

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * User-facing update settings (persisted by Settings > Updates, O1-14).
 *
 * Defaults are calm-by-default: check every 6h, only on unmetered (Wi-Fi)
 * connections, and never apply without asking — `autoApply` is locked to
 * `z.literal(false)` so persisted settings cannot opt into silent installs;
 * when a future auto-apply policy ships, this widens behind a migration, not
 * silently.
 */
export const updateSettingsSchema = z.object({
  /** Release channel to follow (default `nightly` — this is a self-update hub). */
  channel: updateChannelSchema.default('nightly'),
  /** Hours between background update checks (1–168). */
  autoCheckIntervalHours: z.number().int().min(1).max(168).default(6),
  /** Android: download only on unmetered networks (default on). */
  wifiOnly: z.boolean().default(true),
  /** Locked false: updates are ask-first, applied on restart after consent. */
  autoApply: z.literal(false).default(false),
  /** ISO timestamp of the last successful update check (informational). */
  lastCheckedAt: z.string().optional(),
})

/** The parsed {@link updateSettingsSchema} shape. */
export type UpdateSettings = z.infer<typeof updateSettingsSchema>
