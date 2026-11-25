/**
 * Anki Deck Import Parser (Feature 9 / Addon 11).
 *
 * Implements robust TSV and CSV parsing for Anki plain-text exports.
 * Supports:
 * - RFC 4180 streaming tokenization (multiline quoted fields, escaped quotes)
 * - Header metadata comments (#separator, #html, #tags column, #deck, #notetype)
 * - Cloze deletion tag extraction ({{c1::answer}}, {{c2::answer::hint}})
 * - Card classification: 'basic', 'cloze', 'reversed'
 * - Space-separated and comma-separated tag lists
 * - Bi-directional card conversion into Learning HUB CardContent shapes
 *
 * Also hosts the .apkg (ZIP + legacy SQLite) importer and the strict plain-text
 * parser used for lossless round-trips with `anki-export.ts` (formatAnkiTxt).
 *
 * Runtime-portable: the plain-text and ZIP layers are pure JS (fflate is
 * webview-safe), and the SQLite driver (better-sqlite3 — Node-only) is loaded
 * LAZILY inside the default opener, so importing this module never pulls it
 * in. On browser/webview runtimes, pass `{ openDatabase }` to {@link parseApkg}
 * with an adapter over any SQLite implementation (sql.js, wa-sqlite, …).
 */
import { APKG_LIMITS, ArchiveLimitError, openBoundedZip } from './archive-limits'
import { parseCloze } from './cards'
import type { CardContent } from './types'

/** Knobs for the Anki plain-text export parser. */
export interface AnkiParseOptions {
  /** Fallback deck name if not specified in headers. Defaults to 'Default'. */
  defaultDeckName?: string
  /** Explicit delimiter override ('\t', ',', ';', '|'). If omitted, autodetects. */
  delimiter?: string
  /** Format hint: 'tsv', 'csv', or 'auto'. Defaults to 'auto'. */
  format?: 'tsv' | 'csv' | 'auto'
  /** Explicit 1-based tags column index (overrides #tags column:N). */
  tagsColumn?: number
  /** Strip all HTML tags from field contents. Defaults to false. */
  stripHtml?: boolean
  /** Expand 'reversed' cards into two reciprocal 'basic' cards. Defaults to false. */
  expandReversed?: boolean
  /** Default classification if not detected. Defaults to 'basic'. */
  defaultClassification?: 'basic' | 'cloze' | 'reversed'
}

/** Header metadata extracted from an Anki export (#separator, #html, …). */
export interface AnkiDeckMetadata {
  deckName: string
  separator: string
  html: boolean
  tagsColumn?: number
  notetype?: string
  headers: Record<string, string>
}

/** One imported Anki card with its classification, cloze data and content. */
export interface AnkiParsedCard {
  id?: string | number
  front: string
  back: string
  tags: string[]
  classification: 'basic' | 'cloze' | 'reversed'
  deckName: string
  clozeData?: {
    text: string
    answers: string[]
    mode: 'basic' | 'typein' | 'enumeration'
    hint?: string
  }
  content: CardContent
  rawFields: string[]
}

/** Full parser output: metadata, cards, per-line errors and stats. */
export interface AnkiParseResult {
  /** Alias for deckName for interface compatibility */
  name: string
  deckName: string
  metadata: AnkiDeckMetadata
  cards: AnkiParsedCard[]
  errors: Array<{ line: number; message: string; raw?: string }>
  stats: {
    totalParsed: number
    basicCount: number
    clozeCount: number
    reversedCount: number
    errorCount: number
  }
}

/**
 * Tokenize delimited text according to RFC 4180.
 * Handles embedded newlines inside double quotes and escaped quotes ("").
 */
export function parseDelimitedRows(text: string, delimiter: string): string[][] {
  if (!delimiter || delimiter.length === 0) {
    delimiter = '\t'
  }
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0
  const len = text.length

  while (i < len) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"'
          i += 2
          continue
        } else {
          inQuotes = false
          i++
          continue
        }
      } else {
        currentField += char
        i++
        continue
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i++
        continue
      }

      if (text.startsWith(delimiter, i)) {
        currentRow.push(currentField)
        currentField = ''
        i += delimiter.length
        continue
      }

      if (char === '\r') {
        if (i + 1 < len && text[i + 1] === '\n') {
          currentRow.push(currentField)
          rows.push(currentRow)
          currentRow = []
          currentField = ''
          i += 2
          continue
        } else {
          currentRow.push(currentField)
          rows.push(currentRow)
          currentRow = []
          currentField = ''
          i++
          continue
        }
      } else if (char === '\n') {
        currentRow.push(currentField)
        rows.push(currentRow)
        currentRow = []
        currentField = ''
        i++
        continue
      }

      currentField += char
      i++
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return rows
}

/** Parse space-separated or comma-separated Anki tags. */
export function parseTags(raw: string | undefined): string[] {
  if (!raw || typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  }

  return trimmed
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** Sanitize and decode Anki HTML text. */
export function sanitizeAnkiHtml(html: string, strip = false): string {
  if (!html) return ''
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  if (strip) {
    text = text.replace(/<[^>]+>/g, '')
  }
  return text.trim()
}

/** Expand 'reversed' cards into two reciprocal 'basic' cards. */
export function expandReversedCards(cards: AnkiParsedCard[]): AnkiParsedCard[] {
  const result: AnkiParsedCard[] = []
  for (const card of cards) {
    if (card.classification === 'reversed') {
      result.push({
        ...card,
        classification: 'basic',
        content: { basic: { front: card.front, back: card.back || '...' } },
      })
      result.push({
        ...card,
        front: card.back,
        back: card.front,
        tags: [...card.tags, 'reversed'],
        classification: 'basic',
        content: { basic: { front: card.back, back: card.front || '...' } },
      })
    } else {
      result.push(card)
    }
  }
  return result
}

/**
 * Expand a multi-blank cloze card into individual sibling cards for each cloze deletion index.
 */
export function expandClozeCard(card: AnkiParsedCard): AnkiParsedCard[] {
  if (card.classification !== 'cloze' || !card.clozeData) {
    return [card]
  }

  const indices = new Set<number>()
  for (const match of card.front.matchAll(/\{\{c(\d+)::(.*?)\}\}/g)) {
    indices.add(Number(match[1]))
  }

  if (indices.size <= 1) return [card]

  const out: AnkiParsedCard[] = []
  for (const idx of Array.from(indices).sort((a, b) => a - b)) {
    const textForCard = card.front.replace(/\{\{c(\d+)::(.*?)\}\}/g, (match, idxStr, inner) => {
      const matchIdx = Number(idxStr)
      const [answer] = inner.split('::')
      return matchIdx === idx ? match : answer
    })
    const cData = parseCloze(textForCard)
    out.push({
      ...card,
      front: textForCard,
      clozeData: cData,
      content: { cloze: cData },
    })
  }
  return out
}

/**
 * Parse an Anki deck export (TSV or CSV format).
 */
export function parseAnkiDecks(input: string, options?: AnkiParseOptions): AnkiParseResult {
  const defaultDeck = options?.defaultDeckName?.trim() || 'Default'
  const errors: Array<{ line: number; message: string; raw?: string }> = []

  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    const meta: AnkiDeckMetadata = {
      deckName: defaultDeck,
      separator: '\t',
      html: true,
      headers: {},
    }
    return {
      name: defaultDeck,
      deckName: defaultDeck,
      metadata: meta,
      cards: [],
      errors,
      stats: {
        totalParsed: 0,
        basicCount: 0,
        clozeCount: 0,
        reversedCount: 0,
        errorCount: 0,
      },
    }
  }

  // 1. Extract header metadata comments
  const headers: Record<string, string> = {}
  const lines = input.split(/\r?\n/)
  let dataStartIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line.startsWith('#')) {
      const isColumnsHeader = line.toLowerCase().startsWith('#columns:')
      const sepSetting = (options?.delimiter || headers['separator'] || '').toLowerCase()
      let activeSep: string | undefined
      if (sepSetting === 'tab' || sepSetting === '\\t' || sepSetting === '\t') activeSep = '\t'
      else if (sepSetting === 'comma' || sepSetting === ',') activeSep = ','
      else if (sepSetting === 'semicolon' || sepSetting === ';') activeSep = ';'
      else if (sepSetting === 'pipe' || sepSetting === '|') activeSep = '|'

      const hasDelim = line.includes('\t') || (activeSep !== undefined && line.includes(activeSep))
      if (hasDelim && !isColumnsHeader) {
        break
      }

      const colonIdx = line.indexOf(':')
      if (colonIdx !== -1) {
        const key = line.slice(1, colonIdx).trim().toLowerCase()
        const val = line.slice(colonIdx + 1).trim()
        headers[key] = val
      }
      dataStartIndex = i + 1
    } else if (line.length === 0) {
      // blank line in header block
      dataStartIndex = i + 1
    } else {
      break
    }
  }

  // 2. Determine delimiter
  let delimiter = options?.delimiter
  if (!delimiter && options?.format && options.format !== 'auto') {
    if (options.format === 'csv') delimiter = ','
    else if (options.format === 'tsv') delimiter = '\t'
  }
  if (!delimiter && headers['separator']) {
    const rawSep = headers['separator'].trim()
    const sep = rawSep.toLowerCase()
    if (sep === 'tab' || sep === '\\t') delimiter = '\t'
    else if (sep === 'comma' || sep === ',') delimiter = ','
    else if (sep === 'semicolon' || sep === ';') delimiter = ';'
    else if (sep === 'pipe' || sep === '|') delimiter = '|'
    else if (sep === 'space') delimiter = ' '
    else if (rawSep.length === 1) delimiter = rawSep
    // Unrecognized multi-character separator: leave delimiter undefined to fall back to autodetection
  }
  if (!delimiter) {
    // Autodetect delimiter from non-comment lines
    const sampleRaw = lines.slice(dataStartIndex, dataStartIndex + 10).join('\n')
    // Strip HTML entities (&amp;, &nbsp;, etc.) so entity semicolons do not skew delimiter detection
    const sample = sampleRaw.replace(/&[a-zA-Z0-9#]+;/g, '')
    const tabCount = (sample.match(/\t/g) || []).length
    const pipeCount = (sample.match(/\|/g) || []).length
    const semiCount = (sample.match(/;/g) || []).length
    const commaCount = (sample.match(/,/g) || []).length

    if (tabCount > 0) delimiter = '\t'
    else if (pipeCount > 0) delimiter = '|'
    else if (semiCount > 0) delimiter = ';'
    else if (commaCount > 0) delimiter = ','
    else delimiter = '\t' // fallback Anki default
  }

  // 3. Metadata properties
  const isHtml = headers['html'] ? headers['html'].toLowerCase() === 'true' : true
  const deckName = headers['deck'] || defaultDeck
  const notetype = headers['notetype']
  let tagsColumn: number | undefined = options?.tagsColumn
  if (tagsColumn === undefined && headers['tags column']) {
    const parsedCol = parseInt(headers['tags column'], 10)
    if (!isNaN(parsedCol) && parsedCol > 0) tagsColumn = parsedCol
  }

  const metadata: AnkiDeckMetadata = {
    deckName,
    separator: delimiter,
    html: isHtml,
    tagsColumn,
    notetype,
    headers,
  }

  // 4. Tokenize data payload
  const dataPayload = lines.slice(dataStartIndex).join('\n')
  const rawRows = parseDelimitedRows(dataPayload, delimiter)

  const cards: AnkiParsedCard[] = []

  rawRows.forEach((row, rowIdx) => {
    // Skip empty rows or standalone comment rows
    if (row.length === 0 || (row.length === 1 && row[0]!.trim() === '')) return
    if (row.length === 1 && row[0]!.trim().startsWith('#')) return

    const lineNum = dataStartIndex + rowIdx + 1

    let tags: string[] = []
    let contentFields: string[] = []

    if (tagsColumn !== undefined && tagsColumn > 0 && tagsColumn <= row.length) {
      const tagIndex = tagsColumn - 1
      tags = parseTags(row[tagIndex])
      contentFields = row.filter((_, idx) => idx !== tagIndex)
    } else if (row.length >= 3) {
      // In 3-column rows without explicit tag column, last column is treated as tags
      tags = parseTags(row[row.length - 1])
      contentFields = row.slice(0, row.length - 1)
    } else {
      contentFields = [...row]
    }

    if (contentFields.length === 0) {
      errors.push({ line: lineNum, message: 'Skipped empty content row', raw: row.join(delimiter) })
      return
    }

    const frontRaw = contentFields[0] ?? ''
    const backRaw = contentFields.slice(1).join('\n')

    const front = sanitizeAnkiHtml(frontRaw, options?.stripHtml ?? false)
    const back = sanitizeAnkiHtml(backRaw, options?.stripHtml ?? false)

    if (!front.trim()) {
      errors.push({
        line: lineNum,
        message: 'Card front cannot be empty',
        raw: row.join(delimiter),
      })
      return
    }

    // Card classification
    let classification: 'basic' | 'cloze' | 'reversed' = options?.defaultClassification ?? 'basic'
    const hasCloze = /\{\{c\d+::.*?\}\}/.test(front)

    let cardContent: CardContent
    let clozeData: AnkiParsedCard['clozeData']

    if (hasCloze) {
      const parsed = parseCloze(front)
      if (parsed.answers.length > 0) {
        classification = 'cloze'
        clozeData = parsed
        cardContent = { cloze: clozeData }
      } else {
        // Fallback to basic if cloze answers are empty (e.g. {{c1::}})
        classification = 'basic'
        cardContent = { basic: { front, back: back || '...' } }
      }
    } else if (
      (notetype && /reversed/i.test(notetype)) ||
      (contentFields.length >= 3 && /^(y|yes|true|1)$/i.test(contentFields[2]!.trim()))
    ) {
      classification = 'reversed'
      cardContent = { basic: { front, back: back || '...' } }
    } else {
      // Ensure basic classification if notetype was cloze but front lacks cloze markers
      if (classification === 'cloze') {
        classification = 'basic'
      }
      cardContent = { basic: { front, back: back || '...' } }
    }

    cards.push({
      front,
      back,
      tags,
      classification,
      deckName,
      ...(clozeData ? { clozeData } : {}),
      content: cardContent,
      rawFields: row,
    })
  })

  // Handle optional auto-expansion of reversed cards
  const finalCards = options?.expandReversed ? expandReversedCards(cards) : cards

  const stats = {
    totalParsed: finalCards.length,
    basicCount: finalCards.filter((c) => c.classification === 'basic').length,
    clozeCount: finalCards.filter((c) => c.classification === 'cloze').length,
    reversedCount: finalCards.filter((c) => c.classification === 'reversed').length,
    errorCount: errors.length,
  }

  return {
    name: deckName,
    deckName,
    metadata,
    cards: finalCards,
    errors,
    stats,
  }
}

// ─── Anki import/export (parsed-deck level) ─────────────────────────────────
//
// `parseAnkiTxt` / `parseApkg` produce a ParsedDeck — the shape the /api/import
// route turns into a deck + cards. `parseAnkiTxt` is deliberately STRICTER than
// `parseAnkiDecks` above: no entity decoding, no last-column-is-tags guessing —
// so formatAnkiTxt ↔ parseAnkiTxt round-trips byte-for-byte (see anki-export.ts).

/** One card produced by an Anki import, in our content model. */
export interface ParsedCard {
  /** Our card format — Anki imports only ever yield basic or cloze. */
  format: 'basic' | 'cloze'
  content: CardContent
  tags: string[]
}

/** Deck-level result of an Anki import (.apkg or plain text). */
export interface ParsedDeck {
  name: string
  cards: ParsedCard[]
  /** Anki model (notetype) names whose notes could not be mapped and were skipped. */
  skippedModels: string[]
}

const ANKI_FIELD_SEPARATOR = '\x1f'
const CLOZE_MARKER_RE = /\{\{c\d+::.*?\}\}/

/** Named separators Anki writes into `#separator:` header lines. */
const SEPARATOR_ALIASES: Record<string, string> = {
  tab: '\t',
  '\\t': '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  space: ' ',
}

function positiveIntHeader(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Parse Anki's plain-text export (`.txt`) into a ParsedDeck.
 *
 * Understands Anki's leading `#` header lines (`#separator:tab`, `#html:true`,
 * `#deck:Name`, `#tags column:N`, `#deck column:N`) and plain
 * `front<TAB>back` lines. A first field containing `{{cN::…}}` markers becomes
 * a cloze card (same syntax as our own — {@link parseCloze}); anything else is
 * a basic card. Fields pass through VERBATIM (no HTML/entity rewriting), so
 * `formatAnkiTxt(parseAnkiTxt(text)) === text` for files that formatAnkiTxt
 * produced. Tags come only from the `#tags column` header — no heuristics.
 */
export function parseAnkiTxt(text: string, options?: { defaultDeckName?: string }): ParsedDeck {
  const defaultDeckName = options?.defaultDeckName ?? 'Default'
  const skippedModels: string[] = []
  if (!text || text.trim().length === 0) return { name: defaultDeckName, cards: [], skippedModels }

  // Header zone: leading blank/comment lines before the first data line.
  const lines = text.split('\n')
  const headers = new Map<string, string>()
  let cursor = 0
  while (cursor < lines.length) {
    const line = lines[cursor]!
    if (line.trim().length === 0) {
      cursor++
      continue
    }
    if (!line.startsWith('#')) break
    const colon = line.indexOf(':')
    if (colon !== -1) {
      headers.set(line.slice(1, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
    }
    cursor++
  }

  const sepRaw = (headers.get('separator') ?? 'tab').toLowerCase()
  const separator = SEPARATOR_ALIASES[sepRaw] ?? (sepRaw.length === 1 ? sepRaw : '\t')
  const deckHeader = headers.get('deck')
  const tagsColumn = positiveIntHeader(headers.get('tags column'))
  const deckColumn = positiveIntHeader(headers.get('deck column'))

  const cards: ParsedCard[] = []
  const rowDeckNames: string[] = []
  for (const row of parseDelimitedRows(lines.slice(cursor).join('\n'), separator)) {
    if (row.length === 1 && row[0]!.trim() === '') continue
    const rowDeck =
      deckColumn !== undefined && row.length >= deckColumn ? row[deckColumn - 1] : undefined

    // Strip metadata columns (highest index first so lower indices stay valid).
    const fields = [...row]
    let tags: string[] = []
    for (const col of [tagsColumn, deckColumn]
      .filter((c): c is number => c !== undefined)
      .sort((a, b) => b - a)) {
      if (row.length < col) continue
      const idx = col - 1
      if (col === tagsColumn) tags = parseTags(row[idx])
      fields.splice(idx, 1)
    }
    if (fields.length === 0) continue

    const first = fields[0] ?? ''
    if (CLOZE_MARKER_RE.test(first)) {
      cards.push({ format: 'cloze', content: { cloze: parseCloze(first) }, tags })
    } else {
      const back = fields.slice(1).join(separator) || '...'
      cards.push({ format: 'basic', content: { basic: { front: first, back } }, tags })
    }
    if (rowDeck) rowDeckNames.push(rowDeck)
  }

  const name = deckHeader ?? rowDeckNames[0] ?? defaultDeckName
  return { name, cards, skippedModels }
}

// ─── .apkg import ───────────────────────────────────────────────────────────

/**
 * Minimal synchronous statement surface the .apkg parser consumes — the exact
 * subset of better-sqlite3's `Statement` it needs (`.get()` / `.all()`, no
 * parameters bound). Rows come back untyped; the parser narrows them.
 */
export interface SqliteStatement {
  /** First row of the result set, or `undefined` when the result is empty. */
  get(): unknown
  /** Every row of the result set (empty array when there are none). */
  all(): unknown[]
}

/**
 * Minimal synchronous SQLite handle the .apkg parser consumes — the exact
 * subset of better-sqlite3's `Database` it needs. Structural on purpose:
 * better-sqlite3's `Database` satisfies it as-is, and adapters over sql.js /
 * wa-sqlite / expo-sqlite can implement it in a few lines.
 */
export interface SqliteHandle {
  prepare(sql: string): SqliteStatement
  close(): void
}

/**
 * Opens the raw SQLite database image (the `collection.anki2` bytes unzipped
 * from a .apkg). Node default: better-sqlite3, loaded lazily at call time so
 * this module stays importable on runtimes without Node.
 */
export type SqliteOpener = (bytes: Uint8Array) => SqliteHandle

/** Minimal shape of the notetype JSON stored in `col.models`. */
interface AnkiModel {
  id: number | string
  name: string
  /** 0 = standard, 1 = cloze */
  type: number
  flds?: unknown[]
  tmpls?: unknown[]
}

/**
 * Parse an Anki deck package (`.apkg`): a ZIP holding a legacy Anki 2 SQLite
 * collection (`collection.anki2` / `collection.anki21`). Maps the standard
 * models — `Basic`, `Basic (and reversed card)` (→ two reciprocal basic cards)
 * and `Cloze` (type-1 models, `{{cN::…}}` syntax is identical to ours) — onto
 * basic/cloze ParsedCards. Notes on any other model are skipped and their model
 * names reported in `skippedModels`. Media and scheduling state are ignored.
 *
 * The database is opened through `options.openDatabase` when given (portable
 * runtimes); otherwise the Node default lazily imports better-sqlite3 — the
 * ONLY code path that touches it. Async: unzipping is sync, but the lazy
 * driver load is not.
 *
 * Throws when `buffer` is not a ZIP or has no readable legacy collection
 * (e.g. the newer zstd-compressed `collection.anki21b` format).
 */
export async function parseApkg(
  buffer: Uint8Array | ArrayBuffer,
  options?: { openDatabase?: SqliteOpener },
): Promise<ParsedDeck> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let zip: ReturnType<typeof openBoundedZip>
  try {
    zip = openBoundedZip(bytes, APKG_LIMITS)
  } catch (err) {
    if (err instanceof ArchiveLimitError) throw new Error(`invalid .apkg: ${err.message}`)
    throw err
  }
  // Deterministic single collection: collection.anki2 wins over collection.anki21 (the
  // pre-existing precedence). Only the chosen one is inflated; the other is never read.
  const collectionKey = ['collection.anki2', 'collection.anki21'].find((k) => zip.has(k))
  if (!collectionKey) {
    throw new Error(
      'no legacy collection found in .apkg — expected collection.anki2 or collection.anki21 ' +
        '(zstd-compressed collection.anki21b exports are not supported; re-export with "support older Anki versions" enabled)',
    )
  }

  let collection: Uint8Array
  try {
    collection = zip.read(collectionKey)
  } catch (err) {
    if (err instanceof ArchiveLimitError) throw new Error(`invalid .apkg: ${err.message}`)
    throw err
  }
  const db = options?.openDatabase
    ? options.openDatabase(collection)
    : await openSqliteNode(collection)
  try {
    const colRow = db.prepare('SELECT models, decks FROM col LIMIT 1').get() as
      { models: string; decks: string } | undefined
    if (!colRow) throw new Error(`invalid ${collectionKey}: missing col table row`)

    const models = JSON.parse(colRow.models) as Record<string, AnkiModel>
    const ankiDecks = JSON.parse(colRow.decks) as Record<string, { name?: string }>

    const notes = db.prepare('SELECT mid, tags, flds FROM notes').all() as {
      mid: number | string
      tags: string
      flds: string
    }[]
    const deckIds = (db.prepare('SELECT DISTINCT did FROM cards').all() as { did: number }[])
      .map((r) => r.did)
      .filter((did) => ankiDecks[String(did)]?.name)

    const cards: ParsedCard[] = []
    const skipped = new Set<string>()
    for (const note of notes) {
      const model = models[String(note.mid)]
      const fields = (note.flds ?? '').split(ANKI_FIELD_SEPARATOR)
      const tags = parseTags(note.tags)
      if (!model) {
        skipped.add(`unknown model id ${note.mid}`)
        continue
      }
      const mapped = mapAnkiModel(model, fields, tags)
      if (mapped === null) {
        skipped.add(model.name || `model ${note.mid}`)
        continue
      }
      cards.push(...mapped)
    }

    return {
      name: apkgDeckName(deckIds.map((did) => ankiDecks[String(did)]?.name ?? '').filter(Boolean)),
      cards,
      skippedModels: [...skipped],
    }
  } finally {
    db.close()
  }
}

/**
 * Node default opener: better-sqlite3, imported lazily so that merely loading
 * this module (and the barrel) never resolves the driver — the dynamic import
 * only fires when parseApkg runs WITHOUT a custom `openDatabase`.
 */
async function openSqliteNode(bytes: Uint8Array): Promise<SqliteHandle> {
  const { default: Database } = await import('better-sqlite3')
  return new Database(Buffer.from(bytes))
}

/** Map one Anki note onto our card formats, or null when the model is unsupported. */
function mapAnkiModel(model: AnkiModel, fields: string[], tags: string[]): ParsedCard[] | null {
  const front = fields[0] ?? ''
  const back = fields[1] ?? ''
  const asBasic = (f: string, b: string): ParsedCard => ({
    format: 'basic',
    content: { basic: { front: f, back: b || '...' } },
    tags,
  })

  if (model.type === 1 || model.name === 'Cloze') {
    const parsed = parseCloze(front)
    if (parsed.answers.length > 0) {
      return [{ format: 'cloze', content: { cloze: parsed }, tags }]
    }
    // Cloze model without any {{cN::…}} marker: keep it as a plain basic card.
    return [asBasic(front, back)]
  }
  if (model.name === 'Basic') return [asBasic(front, back)]
  if (model.name === 'Basic (and reversed card)')
    return [asBasic(front, back), asBasic(back, front)]
  return null
}

/** One deck if all cards share it, else the common `::` parent, else a fallback. */
function apkgDeckName(names: string[]): string {
  if (names.length === 0) return 'Anki Import'
  if (names.length === 1) return names[0]!
  const prefix = commonPrefix(names)
  return prefix || 'Anki Import'
}

function commonPrefix(names: string[]): string {
  let prefix: string[] | null = null
  for (const name of names) {
    const parts = name.split('::')
    if (prefix === null) {
      prefix = parts
      continue
    }
    let i = 0
    while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i++
    prefix = prefix.slice(0, i)
  }
  return (prefix ?? []).join('::').trim()
}
