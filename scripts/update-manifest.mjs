/**
 * update-manifest.mjs — OTA manifest generator (Epic O1-07).
 *
 * Hashes a `.next-tauri` web export into the content-addressed
 * {@link UpdateManifestLike} format defined by
 * `packages/core/src/update/index.ts` (O1-01), and emits delta "hot update"
 * patch bundles against up to 5 previous manifests (consumed by O1-19).
 *
 * Usage (CI nightly workflow, O1-08):
 * ```
 * node scripts/update-manifest.mjs \
 *   --dir apps/web/.next-tauri \
 *   --out dist/nightly/manifest.json \
 *   --channel nightly \
 *   --version 20261122-abc1234 \
 *   --build-sha abc1234567 \
 *   --min-native-version 0.5.2 \
 *   --requires-native=false \
 *   --full-package-url https://github.com/<owner>/<repo>/releases/download/.../setup.exe \
 *   --prev dist/prev/manifest-1.json \
 *   --prev dist/prev/manifest-2.json
 * ```
 *
 * Outputs, written next to `--out`:
 * - `manifest.json` — the manifest (to be signed, then uploaded to GitHub Releases)
 * - `patch-<fromVersion>-<version>.zip` — one zip per previous manifest that has
 *   changed files; contains ONLY the added/changed files at their export-relative
 *   paths. The client (O1-03) downloads a patch, verifies its sha256 + signature,
 *   unpacks into the inactive slot, and reconciles against the full manifest.
 *
 * Design law notes:
 * - sha256 digests are lowercase hex (the schema in core enforces it).
 * - Every emitted URL is https — enforced here AND re-enforced by the zod
 *   schema at the client boundary; never disable either check.
 * - The manifest itself is unsigned; signing is a separate CI step (O1-08/O1-09)
 *   so the signer never needs filesystem hashing code.
 * - No network access: this script only reads the export dir and prev manifests,
 *   and writes local files.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { zipSync } from 'fflate'

/** Maximum number of delta patches per manifest (matches O1-19 "last 5"). */
export const MAX_PATCHES = 5

/** Valid update channels (mirrors `updateChannelSchema` in core). */
const CHANNELS = ['nightly', 'beta', 'stable']

/**
 * Hash every file under `dir` recursively.
 *
 * Returns entries sorted by path (deterministic manifests), with
 * forward-slash repo-style paths relative to `dir` and lowercase hex sha256.
 * Skips non-regular entries (symlinks, fifos); throws if the directory is
 * empty — an empty export can never be a valid release.
 */
export async function hashTree(dir) {
  const entries = []
  await walk(dir, '')
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (entries.length === 0) {
    throw new Error(`No files found under "${dir}" — refusing to emit an empty manifest`)
  }
  return entries

  async function walk(absDir, relPrefix) {
    for (const dirent of await readdir(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, dirent.name)
      const rel = relPrefix === '' ? dirent.name : `${relPrefix}/${dirent.name}`
      if (dirent.isDirectory()) {
        await walk(abs, rel)
      } else if (dirent.isFile()) {
        const { sha256, size } = await hashFile(abs)
        entries.push({ path: rel, sha256, size })
      }
    }
  }
}

/** Stream-hash one file: lowercase hex sha256 + byte size. */
async function hashFile(absPath) {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(absPath)) {
    hash.update(chunk)
    size += chunk.length
  }
  return { sha256: hash.digest('hex'), size }
}

/**
 * Compute which files changed between a previous manifest and the next file
 * list: anything present in `nextFiles` that is missing from `prevManifest`
 * or whose sha256/size differs. Deleted files are intentionally NOT included
 * — the client reconciles deletions against the full manifest.
 */
export function diffManifests(prevManifest, nextFiles) {
  const prevByPath = new Map()
  for (const f of prevManifest?.files ?? []) prevByPath.set(f.path, f)
  return nextFiles.filter((f) => {
    const old = prevByPath.get(f.path)
    return old === undefined || old.sha256 !== f.sha256 || old.size !== f.size
  })
}

/**
 * Build the zip patch bundle containing exactly `changedFiles` from `dir`.
 *
 * Defensive: each path is resolved and MUST stay inside `dir` — a hostile
 * previous manifest can never make us read outside the export directory.
 */
export async function buildPatchBundle(dir, changedFiles) {
  const root = path.resolve(dir)
  const content = {}
  for (const file of changedFiles) {
    if (file.path.includes('\\') || file.path.includes('\0')) {
      throw new Error(`Suspicious path in manifest: "${file.path}"`)
    }
    const abs = path.resolve(root, file.path)
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new Error(`Path escapes export dir: "${file.path}"`)
    }
    content[file.path] = new Uint8Array(await readFile(abs))
  }
  if (Object.keys(content).length === 0) {
    throw new Error('Refusing to build an empty patch bundle')
  }
  return zipSync(content)
}

/** sha256 of in-memory bytes (lowercase hex) — used for patch bundle digests. */
export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Derive the patch upload base URL (directory of `fullPackageUrl`, with a
 * trailing slash). Returns null when a base cannot be derived.
 */
export function derivePatchBaseUrl(fullPackageUrl) {
  const slash = fullPackageUrl.lastIndexOf('/')
  return slash > 'https://'.length ? fullPackageUrl.slice(0, slash + 1) : null
}

/** Sanitize a version string for use in a patch filename. */
function safeNameSegment(version) {
  return String(version).replace(/[^A-Za-z0-9._-]/g, '-')
}

/**
 * Generate the manifest + patch bundles (pure build step, no filesystem
 * writes — see {@link writeOutputs} / {@link main}).
 *
 * `prev` paths point at previous manifests, newest first; at most
 * {@link MAX_PATCHES} patches are emitted, and previous builds with no changed
 * files produce no patch entry.
 */
export async function generateManifest(options) {
  const {
    dir,
    channel = 'nightly',
    version,
    buildSha,
    minNativeVersion,
    requiresNative = false,
    fullPackageUrl,
    prev = [],
    patchBaseUrl,
    createdAt,
  } = options

  assertNonEmpty(version, 'version')
  assertNonEmpty(buildSha, 'buildSha')
  assertNonEmpty(minNativeVersion, 'minNativeVersion')
  assertHttpsUrl(fullPackageUrl, 'fullPackageUrl')
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Invalid channel "${channel}" — expected one of ${CHANNELS.join(', ')}`)
  }
  const base = patchBaseUrl ?? derivePatchBaseUrl(fullPackageUrl)
  assertHttpsUrl(base, 'patchBaseUrl')

  const files = await hashTree(dir)
  const manifest = {
    manifestVersion: 1,
    channel,
    version,
    buildSha,
    createdAt: createdAt ?? new Date().toISOString(),
    minNativeVersion,
    requiresNative,
    files,
    patches: [],
    fullPackageUrl,
  }

  const patchArtifacts = []
  for (const prevPath of prev.slice(0, MAX_PATCHES)) {
    const prevManifest = JSON.parse(await readFile(prevPath, 'utf8'))
    const changed = diffManifests(prevManifest, files)
    if (changed.length === 0) continue // identical build on that path — no patch
    const bytes = await buildPatchBundle(dir, changed)
    const filename = `patch-${safeNameSegment(prevManifest.version)}-${safeNameSegment(version)}.zip`
    const url = `${base}${filename}`
    assertHttpsUrl(url, 'patch url')
    manifest.patches.push({
      fromVersion: prevManifest.version,
      url,
      sha256: sha256Hex(bytes),
      size: bytes.length,
    })
    patchArtifacts.push({ fromVersion: prevManifest.version, filename, bytes })
  }

  return { manifest, patchArtifacts }
}

/**
 * Write the manifest JSON and all patch bundles produced by
 * {@link generateManifest}. The manifest is written to `outPath`; patch zips
 * land in the same directory. Returns the absolute manifest path.
 */
export async function writeOutputs(outPath, { manifest, patchArtifacts }) {
  const absOut = path.resolve(outPath)
  const outDir = path.dirname(absOut)
  await mkdir(outDir, { recursive: true })
  await writeFile(absOut, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  for (const artifact of patchArtifacts) {
    await writeFile(path.join(outDir, artifact.filename), artifact.bytes)
  }
  return absOut
}

/**
 * Parse and validate CLI flags (see the header for the full usage). Throws on
 * missing/invalid options so CI fails loudly instead of publishing garbage.
 */
export function parseArgs(argv) {
  const opts = { prev: [], channel: 'nightly', requiresNative: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    const eq = arg.indexOf('=')
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2)
    let value
    if (eq >= 0) {
      value = arg.slice(eq + 1)
    } else if (key === 'prev') {
      value = argv[++i]
    } else if (key === 'requires-native') {
      // Boolean flag: `--requires-native` alone means true.
      const next = argv[i + 1]
      value = next !== undefined && !next.startsWith('--') ? argv[++i] : 'true'
    } else {
      value = argv[++i]
    }
    if (value === undefined) throw new Error(`Missing value for --${key}`)
    switch (key) {
      case 'dir':
      case 'out':
      case 'channel':
      case 'version':
        opts[key] = value
        break
      case 'build-sha':
        opts.buildSha = value
        break
      case 'min-native-version':
        opts.minNativeVersion = value
        break
      case 'full-package-url':
        opts.fullPackageUrl = value
        break
      case 'patch-base-url':
        opts.patchBaseUrl = value
        break
      case 'created-at':
        opts.createdAt = value
        break
      case 'requires-native':
        opts.requiresNative = String(value) === 'true'
        break
      case 'prev':
        opts.prev.push(value)
        break
      default:
        throw new Error(`Unknown option --${key}`)
    }
  }
  const requiredFlags = [
    ['dir', 'dir'],
    ['out', 'out'],
    ['version', 'version'],
    ['buildSha', 'build-sha'],
    ['minNativeVersion', 'min-native-version'],
    ['fullPackageUrl', 'full-package-url'],
  ]
  for (const [prop, flag] of requiredFlags) {
    if (opts[prop] === undefined) throw new Error(`Missing required option --${flag}`)
  }
  if (!CHANNELS.includes(opts.channel)) {
    throw new Error(`Invalid channel "${opts.channel}" — expected one of ${CHANNELS.join(', ')}`)
  }
  assertHttpsUrl(opts.fullPackageUrl, 'full-package-url')
  if (opts.buildSha.length < 7 || opts.buildSha.length > 40) {
    throw new Error('--build-sha must be 7–40 characters')
  }
  if (opts.createdAt !== undefined && Number.isNaN(Date.parse(opts.createdAt))) {
    throw new Error('--created-at must be an RFC 3339 timestamp')
  }
  if (opts.patchBaseUrl !== undefined) {
    assertHttpsUrl(opts.patchBaseUrl, 'patch-base-url')
    if (!opts.patchBaseUrl.endsWith('/')) opts.patchBaseUrl += '/'
  }
  return opts
}

/**
 * CLI entry point: parse → generate → write → print a summary. Returns the
 * generation result (with `outPath`) so tests can drive it in-process.
 */
export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv)
  const { manifest, patchArtifacts } = await generateManifest(opts)
  const outPath = await writeOutputs(opts.out, { manifest, patchArtifacts })
  const totalBytes = manifest.files.reduce((sum, f) => sum + f.size, 0)
  console.log(
    `manifest: ${manifest.version} (${manifest.channel}) — ${manifest.files.length} files, ${(totalBytes / 1024).toFixed(1)} KB`,
  )
  for (const patch of manifest.patches) {
    console.log(
      `  patch from ${patch.fromVersion}: ${(patch.size / 1024).toFixed(1)} KB -> ${patch.url}`,
    )
  }
  if (patchArtifacts.length === 0) console.log('  no changed files vs previous manifests')
  console.log(`wrote ${outPath} + ${patchArtifacts.length} patch bundle(s)`)
  return { manifest, patchArtifacts, outPath }
}

/** Throw unless `url` is an absolute https URL (mirrors core's assertHttps). */
function assertHttpsUrl(url, label) {
  try {
    if (new URL(url).protocol !== 'https:') throw new Error('not https')
  } catch {
    throw new Error(`${label} must be an absolute https:// URL (got: ${url})`)
  }
}

/** Throw when a required string option is missing/empty. */
function assertNonEmpty(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
}
