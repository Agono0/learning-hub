/**
 * Cards & decks repository — deck creation, AI-free basic card generation
 * ("Q:/A:" pairs, "front :: back", "front | back"), and the read-only card /
 * review-event projections the cognitive tools share (weakness radar, sleep
 * TMR planner, pretest protocol).
 *
 * One definition, every host: the MCP server previously carried verbatim
 * copies of the deck upsert, the basic-card parser, the cognitive card
 * selects, and the confusion-pair revlog query.
 */
import { rowLimit } from '../limits'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import { getDb, type LearningHubDB } from '../index'
import { cards, decks, revlog } from '../schema'
import { withTransaction } from '../transaction'

export type CardRow = typeof cards.$inferSelect
export type DeckRow = typeof decks.$inferSelect

/** One parsed basic card ("front"/"back" pair) before insertion. */
export interface ParsedBasicCard {
  front: string
  back: string
}

/**
 * Find a deck by exact name or create it. Decks have a unique name index, so
 * this is race-safe in practice for the single-process hosts; the MCP
 * `card_generate` tool previously carried this same logic inline.
 */
export function findOrCreateDeck(
  name: string,
  opts: { emoji?: string; db?: LearningHubDB } = {},
): DeckRow {
  const db = opts.db ?? getDb()
  const [existing] = db.select().from(decks).where(eq(decks.name, name)).limit(1).all()
  if (existing) return existing
  const [created] = db
    .insert(decks)
    .values({ name, ...(opts.emoji !== undefined ? { emoji: opts.emoji } : {}) })
    .returning()
    .all()
  return created!
}

/**
 * Basic card split — no AI needed: "Q:/A:" pairs, "front :: back", or
 * "front | back" per line. Q lines without a matching A line keep the typed
 * continuation lines and surface as a backless card (the caller skips those).
 * Canonical parser: moved verbatim from the MCP server so every host splits
 * text into the same cards.
 */
export function parseBasicCards(text: string): ParsedBasicCard[] {
  const out: ParsedBasicCard[] = []
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let pendingQ: string | null = null
  for (const line of lines) {
    const qMatch = line.match(/^(?:Q|question)\d*\s*[:.)]\s*(.+)$/i)
    const aMatch = line.match(/^(?:A|answer)\d*\s*[:.)]\s*(.+)$/i)
    if (qMatch) {
      if (pendingQ) out.push({ front: pendingQ, back: '' })
      pendingQ = qMatch[1]!
    } else if (aMatch && pendingQ) {
      out.push({ front: pendingQ, back: aMatch[1]! })
      pendingQ = null
    } else {
      const sep = line.includes('::') ? '::' : line.includes(' | ') ? ' | ' : null
      if (sep) {
        const idx = line.indexOf(sep)
        out.push({ front: line.slice(0, idx).trim(), back: line.slice(idx + sep.length).trim() })
        pendingQ = null
      } else if (pendingQ) {
        pendingQ += ` ${line}`
      } else {
        pendingQ = line
      }
    }
  }
  if (pendingQ) out.push({ front: pendingQ, back: '' })
  return out
}

export interface CreateBasicCardsResult {
  /** Ids of the inserted cards, in input order (backless cards are skipped). */
  cardIds: number[]
  /** Parsed pairs dropped for having an empty back side. */
  skipped: number
}

/**
 * Parse `text` into basic Q&A cards and insert them into `deckId` as
 * review-state-free FSRS cards due immediately. Backless parses are skipped
 * and counted in `skipped`. One transaction: either all parsed cards land or
 * none do.
 */
export function createBasicCards(
  deckId: number,
  text: string,
  opts: { source?: string; now?: Date; db?: LearningHubDB } = {},
): CreateBasicCardsResult {
  const db = opts.db ?? getDb()
  const parsed = parseBasicCards(text)
  const withBack = parsed.filter((c) => c.back)
  const skipped = parsed.length - withBack.length
  const due = (opts.now ?? new Date()).toISOString()

  const cardIds = withTransaction((tx) => {
    const ids: number[] = []
    for (const c of withBack) {
      const [card] = tx
        .insert(cards)
        .values({
          deckId,
          type: 'basic',
          content: { basic: c },
          due,
          source: opts.source ?? 'manual',
        })
        .returning()
        .all()
      ids.push(card!.id)
    }
    return ids
  }, db)

  return { cardIds, skipped }
}

/**
 * Unsuspended cards ordered weakest-first (FSRS stability ascending) — the
 * shared projection for the cognitive tools: the weakness radar (MCP), the
 * sleep TMR consolidation planner (MCP + CLI), and the pretest protocol
 * (MCP + CLI). Previously each host carried its own inline copy.
 */
export function listCardsByStability(
  opts: { deckId?: number; limit?: number; db?: LearningHubDB } = {},
): CardRow[] {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 300
  const conditions: SQL[] = [eq(cards.suspended, false)]
  if (opts.deckId !== undefined) conditions.push(eq(cards.deckId, opts.deckId))
  return db
    .select()
    .from(cards)
    .where(and(...conditions))
    .orderBy(asc(cards.stability))
    .limit(rowLimit(limit))
    .all()
}

/** One review event in the shape core's `detectConfusionPairs` consumes. */
export interface ReviewEvent {
  cardId: number
  grade: number
  createdAt: string
}

/**
 * Newest-first review events (rating → grade, reviewedAt → createdAt) for the
 * weakness radar's confusion-pair detection. Undone reviews are excluded
 * (append-only `revlog_undos` tombstones) — an erased review never happened,
 * matching every other shared revlog read in this package.
 */
export function recentReviewEvents(
  opts: { limit?: number; db?: LearningHubDB } = {},
): ReviewEvent[] {
  const db = opts.db ?? getDb()
  const limit = opts.limit ?? 1000
  return db
    .select({
      cardId: revlog.cardId,
      grade: revlog.rating,
      createdAt: revlog.reviewedAt,
    })
    .from(revlog)
    .where(sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`)
    .orderBy(desc(revlog.id))
    .limit(rowLimit(limit))
    .all()
}
