/**
 * Plain-language summary of an /api/import result, built only from the fields the API returns:
 * `imported`, `rejectedCards` (cards that failed validation) and `skippedModels` (note types
 * the importer does not support, so their notes were not imported). The API does not say how
 * many notes a skipped type held or why a card was rejected, so none of that is invented.
 */
export interface ImportResultFields {
  imported?: number
  rejectedCards?: number
  skippedModels?: string[]
}

export interface ImportSummary {
  headline: string
  /** Null when everything in the file was imported. */
  warning: string | null
}

const MAX_NAMES = 5
const MAX_NAME_CHARS = 40

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

function shortName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim()
  return clean.length > MAX_NAME_CHARS ? `${clean.slice(0, MAX_NAME_CHARS - 1)}…` : clean
}

export function summarizeImport(res: ImportResultFields): ImportSummary {
  const imported = res.imported ?? 0
  const rejected = res.rejectedCards ?? 0
  const models = (res.skippedModels ?? []).filter((m) => typeof m === 'string' && m.trim() !== '')

  const parts: string[] = []
  if (rejected > 0) {
    parts.push(
      `${rejected} ${plural(rejected, 'card was', 'cards were')} not imported because ${plural(rejected, 'it', 'they')} failed validation.`,
    )
  }
  if (models.length > 0) {
    const shown = models.slice(0, MAX_NAMES).map(shortName).join(', ')
    const more = models.length > MAX_NAMES ? ` and ${models.length - MAX_NAMES} more` : ''
    parts.push(
      `Notes using ${models.length} unsupported ${plural(models.length, 'note type', 'note types')} were skipped: ${shown}${more}.`,
    )
  }

  return {
    headline: `Imported ${imported} card${imported === 1 ? '' : 's'}`,
    warning: parts.length > 0 ? parts.join(' ') : null,
  }
}
