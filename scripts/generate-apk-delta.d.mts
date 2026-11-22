/** Type declarations for scripts/generate-apk-delta.mjs (O1-21). */

/** CLI options for {@link generateApkDelta} (kebab flags map 1:1). */
export interface ApkDeltaOptions {
  /** Previous release APK (base of the delta). */
  base: string
  /** New per-ABI APK (target of the delta). */
  target: string
  /** Output directory for `delta-<label>.patch`. */
  out: string
  /** ABI label used in the patch filename (default `delta`). */
  label?: string
  /** bsdiff binary (default `bsdiff` on PATH; tests inject a stub). */
  bsdiffBin?: string
}

/** Machine-readable size report emitted next to the patch. */
export interface ApkDeltaReport {
  label: string
  base: { path: string; bytes: number }
  target: { path: string; bytes: number }
  patch: { path: string; bytes: number; kb: number }
  /** `patch.bytes / target.bytes` — lower is more worth shipping. */
  ratio: number
}

/** Parsed CLI options ({@link ApkDeltaOptions} + optional report path). */
export interface ApkDeltaCliOptions extends ApkDeltaOptions {
  report?: string
}

/** Parse + validate CLI flags (throws on missing/unknown). */
export declare function parseArgs(argv: readonly string[]): ApkDeltaCliOptions

/** Calm KB formatting (one decimal). */
export declare function formatKb(bytes: number): string

/** Generate one delta patch + report (throws on empty/failed bsdiff output). */
export declare function generateApkDelta(options: ApkDeltaOptions): Promise<ApkDeltaReport>

/** CLI flow: parse → generate → write report (when given) → print summary. */
export declare function main(argv?: readonly string[]): Promise<ApkDeltaReport>
