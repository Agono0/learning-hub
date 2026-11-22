/**
 * generate-apk-delta.mjs — per-ABI APK delta generation for the OTA stretch
 * goal O1-21 (docs/updates.md §"Android sideload consent flow").
 *
 * Wraps the `bsdiff` CLI (installed in CI via the native.yml request in
 * docs/SHARED_CHANGES.md) to produce a binary delta between the PREVIOUS
 * release's APK and the NEW per-ABI APK, and writes a machine-readable size
 * report next to the patches. The CLIENT currently always falls back to the
 * full APK (O1-13 full install) — the measured sizes decide whether the
 * on-device patch apply path is worth building at all; that decision belongs
 * to docs/updates.md + the nightly release notes, not to this script.
 *
 * Usage (CI nightly / manual measurement):
 * ```
 * node scripts/generate-apk-delta.mjs \
 *   --base prev/app-arm64-v8a.apk --target new/app-arm64-v8a.apk \
 *   --out dist/delta --report dist/delta/delta-report.json \
 *   --label arm64-v8a
 * ```
 *
 * - `--bsdiff-bin` overrides the binary (tests inject a stub; production uses
 *   the PATH-installed `bsdiff`).
 * - Sizes are reported in bytes AND KB; the ratio makes the keep/skip call
 *   obvious (< ~40% of the target is usually worth shipping as a delta).
 * - Exits non-zero when bsdiff fails or produces an empty/nonexistent patch —
 *   a broken delta must never ship; the release falls back to the full APK.
 */
import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Parse + validate CLI flags; throws on missing/invalid options. */
export function parseArgs(argv) {
  const opts = { bsdiffBin: 'bsdiff' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    const eq = arg.indexOf('=')
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2)
    const value = eq >= 0 ? arg.slice(eq + 1) : argv[++i]
    if (value === undefined) throw new Error(`Missing value for --${key}`)
    switch (key) {
      case 'base':
        opts.base = value
        break
      case 'target':
        opts.target = value
        break
      case 'out':
        opts.out = value
        break
      case 'report':
        opts.report = value
        break
      case 'label':
        opts.label = value
        break
      case 'bsdiff-bin':
        opts.bsdiffBin = value
        break
      default:
        throw new Error(`Unknown option --${key}`)
    }
  }
  for (const required of ['base', 'target', 'out']) {
    if (opts[required] === undefined) throw new Error(`Missing required option --${required}`)
  }
  return opts
}

/** Byte size of a file (0 when it cannot be stat'ed). */
async function fileSize(file) {
  try {
    return (await stat(file)).size
  } catch {
    return 0
  }
}

/** Format bytes as a calm KB string for logs. */
export function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

/**
 * Generate one APK delta and its size report.
 *
 * Returns the report object:
 * `{ label, base: {path, bytes}, target: {path, bytes}, patch: {path, bytes, kb}, ratio }`
 * where `ratio = patchBytes / targetBytes` (lower = more worth shipping).
 */
export async function generateApkDelta(options) {
  const { base, target, out, label = 'delta', bsdiffBin = 'bsdiff' } = options
  const baseBytes = await fileSize(base)
  const targetBytes = await fileSize(target)
  if (baseBytes === 0) throw new Error(`base APK missing or empty: ${base}`)
  if (targetBytes === 0) throw new Error(`target APK missing or empty: ${target}`)

  await mkdir(path.resolve(out), { recursive: true })
  const patchPath = path.join(out, `delta-${label}.patch`)

  try {
    await execFileAsync(bsdiffBin, [path.resolve(base), path.resolve(target), patchPath])
  } catch (error) {
    // Distinguish "the tool isn't there / can't run" from "bsdiff ran and
    // failed": a missing binary must never masquerade as a broken delta —
    // CI skips the delta step and ships the full APK (O1-13) with a clear
    // reason in the log instead of an "empty patch" red herring.
    const code = error && typeof error.code === 'string' ? error.code : ''
    if (['ENOENT', 'EACCES', 'EINVAL', 'ENOEXEC'].includes(code)) {
      throw new Error(
        `bsdiff unavailable ("${bsdiffBin}", ${code}) — full APK fallback; install bsdiff or pass --bsdiff-bin`,
      )
    }
    throw new Error(`bsdiff failed (${bsdiffBin}): ${error.message}`)
  }

  const patchBytes = await fileSize(patchPath)
  if (patchBytes === 0) {
    throw new Error(`bsdiff produced an empty patch — refusing to ship; fall back to the full APK`)
  }

  const report = {
    label,
    base: { path: base, bytes: baseBytes },
    target: { path: target, bytes: targetBytes },
    patch: { path: patchPath, bytes: patchBytes, kb: Number((patchBytes / 1024).toFixed(1)) },
    ratio: Number((patchBytes / targetBytes).toFixed(4)),
  }
  return report
}

/**
 * CLI entry: parse → generate → write the report JSON (when --report given) →
 * print a human summary with the keep/skip hint. Exit code 0 on success.
 */
export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv)
  const report = await generateApkDelta(opts)
  if (opts.report) {
    await mkdir(path.dirname(path.resolve(opts.report)), { recursive: true })
    await writeFile(opts.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  console.log(
    `delta ${report.label}: ${formatKb(report.patch.bytes)} vs full ${formatKb(report.target.bytes)} (ratio ${report.ratio})`,
  )
  console.log(
    report.ratio <= 0.4
      ? 'worth shipping as a delta (ratio ≤ 0.4)'
      : 'delta likely not worth shipping — keep the full-APK fallback (O1-13)',
  )
  return report
}

// Direct invocation support (imported-by-tests stays side-effect free).
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
