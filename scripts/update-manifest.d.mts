/**
 * Type declarations for scripts/update-manifest.mjs — the OTA manifest
 * generator (O1-07). Shapes mirror `UpdateManifest` / `UpdatePatch` /
 * `UpdateFile` in `packages/core/src/update/index.ts`, but are kept
 * dependency-free so the script stays plain Node.
 */

/** One content-addressed file entry ({@link UpdateFile} shape). */
export interface ManifestFileEntry {
  path: string
  sha256: string
  size: number
}

/** One delta-patch entry ({@link UpdatePatch} shape). */
export interface ManifestPatchEntry {
  fromVersion: string
  url: string
  sha256: string
  size: number
}

/** The generated manifest ({@link UpdateManifest} shape). */
export interface UpdateManifestLike {
  manifestVersion: 1
  channel: string
  version: string
  buildSha: string
  createdAt: string
  minNativeVersion: string
  requiresNative: boolean
  files: ManifestFileEntry[]
  patches: ManifestPatchEntry[]
  fullPackageUrl: string
}

/** A built patch bundle, ready to be written as `filename`. */
export interface PatchArtifact {
  fromVersion: string
  filename: string
  bytes: Uint8Array
}

/** Options for {@link generateManifest} (CLI flags map 1:1, kebab→camel). */
export interface GenerateOptions {
  /** Directory of the `.next-tauri` export to hash. */
  dir: string
  /** Release channel; defaults to `nightly`. */
  channel?: 'nightly' | 'beta' | 'stable'
  /** Version/tag of this build (e.g. `20261122-abc1234`). */
  version: string
  /** Git commit the build was produced from (7–40 chars). */
  buildSha: string
  /** Minimum native shell version for this web build. */
  minNativeVersion: string
  /** True when a new installer/APK is required (default false). */
  requiresNative?: boolean
  /** https URL of the full package (patch fallback). */
  fullPackageUrl: string
  /** Previous manifest file paths, newest first (max 5 used). */
  prev?: string[]
  /** https base URL for patch uploads; derived from fullPackageUrl when omitted. */
  patchBaseUrl?: string
  /** Fixed RFC 3339 timestamp (defaults to now); for deterministic tests. */
  createdAt?: string
}

/** Result of {@link generateManifest}. */
export interface GenerateResult {
  manifest: UpdateManifestLike
  patchArtifacts: PatchArtifact[]
}

/** Result of {@link main}. */
export interface MainResult extends GenerateResult {
  outPath: string
}

/** Parsed CLI options ({@link CliOptions}): {@link GenerateOptions} + out path. */
export interface CliOptions extends GenerateOptions {
  out: string
}

/** Maximum number of delta patches per manifest (O1-19 "last 5 manifests"). */
export declare const MAX_PATCHES: number

/** Recursively hash `dir` into sorted, forward-slashed file entries. */
export declare function hashTree(dir: string): Promise<ManifestFileEntry[]>

/** Files in `nextFiles` that are new or changed vs `prevManifest`. */
export declare function diffManifests(
  prevManifest: UpdateManifestLike,
  nextFiles: ManifestFileEntry[],
): ManifestFileEntry[]

/** Zip exactly `changedFiles` from `dir` (paths must stay inside it). */
export declare function buildPatchBundle(
  dir: string,
  changedFiles: ManifestFileEntry[],
): Promise<Uint8Array>

/** Lowercase hex sha256 of in-memory bytes. */
export declare function sha256Hex(bytes: Uint8Array): string

/** Directory part of `fullPackageUrl` with trailing slash, or null. */
export declare function derivePatchBaseUrl(fullPackageUrl: string): string | null

/** Build the manifest + patch bundles (pure; writes nothing). */
export declare function generateManifest(options: GenerateOptions): Promise<GenerateResult>

/** Write manifest.json + patch zips; returns the absolute manifest path. */
export declare function writeOutputs(outPath: string, result: GenerateResult): Promise<string>

/** Parse CLI flags (syntax + per-flag format validation; no presence check). */
export declare function parseArgs(argv: readonly string[]): CliOptions

/** Required-option presence check — CI runs this right after parseArgs. */
export declare function validateOpts(opts: CliOptions): CliOptions

/** Full CLI flow: parse → generate → write → print summary. */
export declare function main(argv?: readonly string[]): Promise<MainResult>
