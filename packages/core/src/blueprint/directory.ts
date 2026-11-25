/**
 * Boot-time blueprint loading from a directory, behind an injected file source.
 *
 * Core stays free of filesystem code: a host (see plugins/study-blueprints)
 * supplies a {@link BlueprintFileSource} that does the safe file access, and
 * this module applies the policy that does not depend on a filesystem: file
 * count and size limits, JSON parsing, validation, and collision rules.
 *
 * Nothing here evaluates content. A blueprint file is parsed as JSON and
 * validated against the schema; anything else is skipped and reported.
 * `bootBlueprints` never throws, so a bad file cannot stop a host starting.
 */
import { listPlugins } from '../plugin-loader'
import { BLUEPRINT_PLUGIN_PREFIX, installBlueprint } from './plugin'
import { SAMPLE_BLUEPRINTS } from './samples'
import type { Blueprint } from './schema'
import { validateBlueprint } from './validate'

/** Limits for directory loading. */
export const DIRECTORY_LIMITS = {
  maxFiles: 50,
  maxFileBytes: 64 * 1024,
  maxTotalBytes: 1024 * 1024,
} as const

/** What a host provides: safe listing and bounded reads. */
export interface BlueprintFileSource {
  /** Human-readable location, for logs. */
  readonly label: string
  /**
   * Candidate `.json` file names (no paths), sorted. Entries that are not
   * plain regular files inside the base directory are returned in `skipped`.
   */
  list(): Promise<{ files: string[]; skipped: { name: string; reason: string }[] }>
  /** Read one listed file as UTF-8, rejecting anything over `maxBytes`. */
  read(name: string, maxBytes: number): Promise<string>
}

/** One file that was not loaded, and why. */
export interface SkippedFile {
  file: string
  reason: string
}

/** Outcome of reading a directory (no registration yet). */
export interface DirectoryRead {
  blueprints: { file: string; blueprint: Blueprint }[]
  skipped: SkippedFile[]
}

/** Read, bound and validate every blueprint file a source offers. Never throws. */
export async function readBlueprintDirectory(
  source: BlueprintFileSource,
  limits: Partial<typeof DIRECTORY_LIMITS> = {},
): Promise<DirectoryRead> {
  const max = { ...DIRECTORY_LIMITS, ...limits }
  const out: DirectoryRead = { blueprints: [], skipped: [] }
  let listing: Awaited<ReturnType<BlueprintFileSource['list']>>
  try {
    listing = await source.list()
  } catch (err) {
    out.skipped.push({ file: source.label, reason: `could not list directory: ${message(err)}` })
    return out
  }
  out.skipped.push(...listing.skipped.map((s) => ({ file: s.name, reason: s.reason })))

  let total = 0
  const files = [...listing.files].sort()
  for (const [i, file] of files.entries()) {
    if (i >= max.maxFiles) {
      out.skipped.push({ file, reason: `more than ${max.maxFiles} files; the rest are ignored` })
      continue
    }
    let text: string
    try {
      text = await source.read(file, max.maxFileBytes)
    } catch (err) {
      out.skipped.push({ file, reason: `could not read: ${message(err)}` })
      continue
    }
    const bytes = new TextEncoder().encode(text).length
    if (bytes > max.maxFileBytes) {
      out.skipped.push({ file, reason: `larger than ${max.maxFileBytes} bytes` })
      continue
    }
    if (total + bytes > max.maxTotalBytes) {
      out.skipped.push({ file, reason: `total size limit of ${max.maxTotalBytes} bytes reached` })
      continue
    }
    total += bytes
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      out.skipped.push({ file, reason: 'not valid JSON' })
      continue
    }
    const res = validateBlueprint(json)
    if (!res.ok) {
      const first = res.issues[0]
      out.skipped.push({
        file,
        reason: `invalid blueprint (${res.issues.length} problem${res.issues.length === 1 ? '' : 's'}; first: ${first?.path}: ${first?.message})`,
      })
      continue
    }
    out.blueprints.push({ file, blueprint: res.blueprint })
  }
  return out
}

/** Outcome of {@link bootBlueprints}. */
export interface BootReport {
  /** Blueprint ids registered as plugins, samples first. */
  loaded: string[]
  skipped: SkippedFile[]
}

/**
 * Register the bundled samples, then any valid blueprint from `source`.
 * A directory blueprint cannot replace a sample, another directory blueprint,
 * or any plugin already registered under the same plugin name.
 */
export async function bootBlueprints(
  source: BlueprintFileSource | null,
  log: Pick<Console, 'info' | 'warn'> = console,
): Promise<BootReport> {
  const report: BootReport = { loaded: [], skipped: [] }
  const taken = () => new Set(listPlugins().map((p) => p.plugin.name))

  for (const sample of SAMPLE_BLUEPRINTS) {
    try {
      const res = await installBlueprint(sample)
      if (res.ok) report.loaded.push(sample.id)
      else
        report.skipped.push({
          file: `sample:${sample.id}`,
          reason: res.issues[0]?.message ?? 'not installed',
        })
    } catch (err) {
      report.skipped.push({ file: `sample:${sample.id}`, reason: message(err) })
    }
  }

  if (source) {
    let read: DirectoryRead
    try {
      read = await readBlueprintDirectory(source)
    } catch (err) {
      read = { blueprints: [], skipped: [{ file: source.label, reason: message(err) }] }
    }
    report.skipped.push(...read.skipped)
    for (const { file, blueprint } of read.blueprints) {
      const pluginName = `${BLUEPRINT_PLUGIN_PREFIX}${blueprint.id}`
      if (taken().has(pluginName)) {
        report.skipped.push({
          file,
          reason: `id "${blueprint.id}" is already in use by another blueprint or plugin`,
        })
        continue
      }
      try {
        const res = await installBlueprint(blueprint)
        if (res.ok) report.loaded.push(blueprint.id)
        else report.skipped.push({ file, reason: res.issues[0]?.message ?? 'not installed' })
      } catch (err) {
        report.skipped.push({ file, reason: message(err) })
      }
    }
  }

  log.info(`[blueprints] loaded ${report.loaded.length}: ${report.loaded.join(', ') || '(none)'}`)
  for (const s of report.skipped) log.warn(`[blueprints] skipped ${s.file}: ${s.reason}`)
  return report
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
