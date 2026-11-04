/**
 * Anki export (deck import/export feature).
 *
 * - `formatAnkiTxt` — deck → Anki-importable tab-separated text. Only basic and
 *   cloze cards are representable in Anki plain text; other formats are skipped.
 *   Output pairs with {@link parseAnkiTxt} (src/anki.ts) for byte-exact
 *   round-trips: `formatAnkiTxt(parseAnkiTxt(text)) === text` and the cards
 *   survive a `parse → format → parse` cycle unchanged.
 * - `exportDeckToJSON` / `parseHubDeckJson` — our own JSON deck schema, which
 *   can carry EVERY card format (mcq, typein, occlusion, …) losslessly.
 *
 * Pure module (zod only) — safe for client bundles.
 */
import { z } from 'zod'
import { validateCardContent } from './cards'
import type { CardContent, CardFormat } from './types'

/** A card to export: DB rows already match this shape. */
export interface DeckExportCard {
  type: CardFormat
  content: CardContent
  tags?: string[]
}

/** A deck to export: DB rows already match this shape. */
export interface DeckExportInput {
  name: string
  cards: DeckExportCard[]
}

const TAB = '\t'

/**
 * Quote a field for Anki TSV when it contains the separator, a quote or a
 * newline (RFC-4180 style: `"` → `""`, wrapped in quotes). Empty fields are
 * quoted too so they survive as empty rather than disappearing.
 */
function quoteAnkiField(field: string, separator: string): string {
  if (
    field === '' ||
    field.includes(separator) ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r')
  ) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

/**
 * Export a deck to Anki-importable plain text (tab-separated, with Anki's
 * `#`-header config lines). Cloze cards keep their `{{cN::answer}}` markers,
 * which is exactly Anki's cloze syntax, so the file can be re-imported by
 * Anki itself. Cards whose format has no Anki plain-text representation
 * (mcq/typein/occlusion/proof_step/grammar/matching) are skipped — use
 * {@link exportDeckToJSON} to keep them.
 */
export function formatAnkiTxt(deck: DeckExportInput): string {
  const hasTags = deck.cards.some((c) => (c.tags?.length ?? 0) > 0)
  const lines: string[] = [
    '#separator:tab',
    '#html:true',
    `#deck:${deck.name.replace(/[\r\n]/g, ' ')}`,
  ]
  if (hasTags) lines.push('#tags column:3')

  for (const card of deck.cards) {
    const tags = hasTags ? TAB + quoteAnkiField((card.tags ?? []).join(' '), TAB) : ''
    if (card.content.cloze) {
      // Anki cloze exports carry the marked text as the only field; when the
      // file has a tags column, keep column count aligned via an empty back field.
      lines.push(quoteAnkiField(card.content.cloze.text, TAB) + (hasTags ? TAB : '') + tags)
    } else if (card.content.basic) {
      lines.push(
        quoteAnkiField(card.content.basic.front, TAB) +
        TAB +
        quoteAnkiField(card.content.basic.back, TAB) +
        tags,
      )
    }
    // other formats: not representable in Anki plain text — skipped
  }
  return lines.join('\n')
}

// ─── Our own JSON deck schema ───────────────────────────────────────────────

/** Envelope `kind` marking a Learning HUB deck JSON export. */
export const HUB_DECK_KIND = 'learning-hub-deck'
/** Current schema version written by {@link exportDeckToJSON}. */
export const HUB_DECK_VERSION = 1

/** Full-fidelity JSON deck export (all card formats). */
export interface HubDeckJSON {
  kind: typeof HUB_DECK_KIND
  version: number
  name: string
  cards: { type: CardFormat; content: CardContent; tags: string[] }[]
}

/** Export a deck to our own JSON schema — lossless for every card format. */
export function exportDeckToJSON(deck: DeckExportInput): HubDeckJSON {
  return {
    kind: HUB_DECK_KIND,
    version: HUB_DECK_VERSION,
    name: deck.name,
    cards: deck.cards.map((c) => ({ type: c.type, content: c.content, tags: c.tags ?? [] })),
  }
}

const hubDeckCardSchema = z.object({
  type: z.string().min(1),
  // zod v4: z.unknown() keeps the key required — content must be present.
  content: z.unknown(),
  tags: z.array(z.string()).optional(),
})

const hubDeckSchema = z.object({
  kind: z.literal(HUB_DECK_KIND),
  version: z.number().int(),
  name: z.string().min(1),
  cards: z.array(hubDeckCardSchema),
})

/** Parsed + per-card validated JSON deck, ready for import. */
export interface ParsedHubDeck {
  name: string
  cards: { type: CardFormat; content: CardContent; tags: string[] }[]
  /** 1-based indices of cards that failed content validation. */
  invalidCardIndices: number[]
}

/**
 * Parse and validate a JSON deck produced by {@link exportDeckToJSON}.
 * Throws an Error with a readable message when the envelope is malformed;
 * cards whose content fails per-format validation are NOT thrown away silently —
 * they are reported via `invalidCardIndices` and omitted from `cards`.
 */
export function parseHubDeckJson(text: string): ParsedHubDeck {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('deck JSON is not valid JSON')
  }
  const parsed = hubDeckSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue ? issue.path.map(String).join('.') : '?'
    throw new Error(`deck JSON schema mismatch at "${path}": ${issue?.message ?? 'invalid'}`)
  }

  const cards: ParsedHubDeck['cards'] = []
  const invalidCardIndices: number[] = []
  parsed.data.cards.forEach((card, i) => {
    const validated = validateCardContent(card.type as CardFormat, card.content)
    if (!validated.ok) {
      invalidCardIndices.push(i + 1)
      return
    }
    cards.push({ type: card.type as CardFormat, content: validated.data, tags: card.tags ?? [] })
  })
  return { name: parsed.data.name, cards, invalidCardIndices }
}
