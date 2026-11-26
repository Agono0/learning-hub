/**
 * Card content utilities — cloze parsing/building, per-format zod
 * validation, deck-fair interleaving and bullet→card regeneration.
 * Pure module (zod is the only dependency) — safe for client bundles.
 */
import { z } from 'zod'
import type { CardContent, CardFormat } from './types'
import { exerciseSchema } from './practice/schema'

// ─── Cloze ──────────────────────────────────────────────────────────────────

/** A rendered cloze segment: plain text or a blank. */
export type ClozeSegment =
  { kind: 'text'; text: string } | { kind: 'blank'; index: number; answer: string; hint?: string }

/** One `{{cN::inner}}` marker: `index` is where it starts in the source, `end` just past its `}}`. */
export interface ClozeMarker {
  index: number
  end: number
  /** The digits after `c` (as written). */
  num: string
  /** Everything between `::` and the closing `}}` (answer and optional `::hint`). */
  inner: string
}

const isLineBreak = (ch: string) => ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029'

/**
 * Find every `{{cN::…}}` marker, left to right and non-overlapping. This returns exactly the
 * matches of `/\{\{c(\d+)::(.*?)\}\}/g` (the inner text never spans a line break and ends at the
 * first `}}`), but in linear time: with that regex, a long line of openers and no `}}` was
 * quadratic, because every opener rescanned to the end of the line.
 */
export function findClozeMarkers(text: string): ClozeMarker[] {
  const out: ClozeMarker[] = []
  // Cached "next `}}`" and "next line break" lookups, valid while the search start stays at or
  // before the cached hit (or for ever once a search found nothing).
  let closeFrom = -1
  let closeAt = -1
  let breakFrom = -1
  let breakAt = -1
  let pos = 0
  while (true) {
    const open = text.indexOf('{{c', pos)
    if (open === -1) break
    let j = open + 3
    while (j < text.length && text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) j++
    if (j === open + 3 || text[j] !== ':' || text[j + 1] !== ':') {
      pos = open + 1
      continue
    }
    const start = j + 2
    if (closeFrom === -1 || start < closeFrom || (closeAt !== -1 && start > closeAt)) {
      closeFrom = start
      closeAt = text.indexOf('}}', start)
    }
    if (closeAt === -1) break // no `}}` left anywhere, so no later marker can match either
    if (breakFrom === -1 || start < breakFrom || (breakAt !== -1 && start > breakAt)) {
      breakFrom = start
      breakAt = -1
      for (let k = start; k < text.length; k++) {
        if (isLineBreak(text[k]!)) {
          breakAt = k
          break
        }
      }
    }
    if (breakAt !== -1 && breakAt < closeAt) {
      pos = open + 1
      continue
    }
    out.push({
      index: open,
      end: closeAt + 2,
      num: text.slice(open + 3, j),
      inner: text.slice(start, closeAt),
    })
    pos = closeAt + 2
  }
  return out
}

/**
 * Replace every `{{cN::…}}` marker (same matches as {@link findClozeMarkers}) with
 * `replace(inner)`, in linear time. Stands in for `text.replace(/\{\{c\d+::(.*?)\}\}/g, …)`.
 */
export function replaceClozeMarkers(text: string, replace: (inner: string) => string): string {
  let out = ''
  let cursor = 0
  for (const m of findClozeMarkers(text)) {
    out += text.slice(cursor, m.index) + replace(m.inner)
    cursor = m.end
  }
  return out + text.slice(cursor)
}

/** True when `text` holds at least one `{{cN::…}}` marker. */
export function hasClozeMarker(text: string): boolean {
  return findClozeMarkers(text).length > 0
}

/**
 * Parse cloze markup: `parseCloze("The capital of {{c1::France}} is {{c2::Paris}}.")`
 * → `{ text: <original text with markers>, answers: ['France','Paris'], mode }`.
 * `{{c1::answer::hint}}` carries an optional hint. `text` keeps the original
 * markers so the review UI can re-split it into segments (this matches the
 * content shape already stored in the DB).
 */
export function parseCloze(
  raw: string,
  mode?: 'basic' | 'typein',
): { text: string; answers: string[]; mode: 'basic' | 'typein' | 'enumeration'; hint?: string } {
  const answers: string[] = []
  let hint: string | undefined
  const seen = new Set<number>()
  for (const match of findClozeMarkers(raw)) {
    const idx = Number(match.num)
    if (seen.has(idx)) continue
    seen.add(idx)
    const inner = match.inner
    const [answer, hintPart] = inner.split('::')
    if (answer !== undefined && answer !== '') {
      answers.push(answer)
      if (hintPart) hint = hintPart
    }
  }
  return {
    text: raw,
    answers,
    mode: mode ?? (seen.size >= 2 ? 'enumeration' : 'basic'),
    ...(hint ? { hint } : {}),
  }
}

/**
 * Split cloze text (with `{{cN::answer}}` markers) into ordered segments for
 * rendering fill-in-the-blank UIs. The same index may appear several times.
 */
export function clozeSegments(text: string): ClozeSegment[] {
  const segments: ClozeSegment[] = []
  let cursor = 0
  for (const match of findClozeMarkers(text)) {
    const start = match.index
    if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) })
    const inner = match.inner
    const [answer, hintPart] = inner.split('::')
    segments.push({
      kind: 'blank',
      index: Number(match.num),
      answer: answer ?? '',
      ...(hintPart ? { hint: hintPart } : {}),
    })
    cursor = match.end
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return segments
}

/**
 * Builder: replace the first occurrence of each answer in `text` with
 * `{{cN::answer}}` markers (N = position + startIndex). Throws when an answer
 * does not occur in the text — silent gaps would produce unanswerable cards.
 */
export function buildCloze(
  text: string,
  marks: { answer: string; hint?: string }[],
  startIndex = 1,
): string {
  let out = text
  marks.forEach((mark, i) => {
    const pos = out.indexOf(mark.answer)
    if (pos === -1) {
      throw new Error(`buildCloze: answer "${mark.answer}" not found in text`)
    }
    const marker = `{{c${startIndex + i}::${mark.answer}${mark.hint ? `::${mark.hint}` : ''}}}`
    out = out.slice(0, pos) + marker + out.slice(pos + mark.answer.length)
  })
  return out
}

// ─── Answer Evaluation (DEF-002) ───────────────────────────────────────────

export interface ClozeBlankEvaluation {
  index: number
  expected: string
  provided: string
  isCorrect: boolean
}

/** Full cloze evaluation: overall correctness plus per-blank detail. */
export interface ClozeEvaluationResult {
  isCorrect: boolean
  blanks: ClozeBlankEvaluation[]
}

/** Normalize answer string for comparison: trim and lower-case. */
export function normalizeAnswer(ans: string): string {
  return ans.trim().toLowerCase()
}

/**
 * Evaluates user input against cloze expected answers.
 * Input can be:
 * - string: applied to first blank (or single-blank card)
 * - string[]: matched in order of unique blank indices
 * - Record<number, string>: keyed by blank index (matching ClozeSegment.index)
 */
export function evaluateClozeAnswer(
  cloze: { text: string; answers?: string[] },
  input: string | string[] | Record<number, string>,
): ClozeEvaluationResult {
  const segments = clozeSegments(cloze.text)
  const blanks = segments.filter(
    (s): s is Extract<ClozeSegment, { kind: 'blank' }> => s.kind === 'blank',
  )

  // Deduplicate by index (e.g. multiple {{c1::...}} in one card)
  const uniqueBlanks = new Map<number, string>()
  for (const b of blanks) {
    if (!uniqueBlanks.has(b.index)) {
      uniqueBlanks.set(b.index, b.answer)
    }
  }

  const blankEvals: ClozeBlankEvaluation[] = []
  let allCorrect = true
  let arrayIdx = 0

  for (const [index, expected] of uniqueBlanks.entries()) {
    let provided = ''
    if (typeof input === 'string') {
      provided = arrayIdx === 0 ? input : ''
    } else if (Array.isArray(input)) {
      provided = input[arrayIdx] ?? ''
    } else if (typeof input === 'object' && input !== null) {
      provided = (input as Record<number, string>)[index] ?? ''
    }

    const isCorrect = normalizeAnswer(provided) === normalizeAnswer(expected)
    if (!isCorrect) allCorrect = false

    blankEvals.push({
      index,
      expected,
      provided,
      isCorrect,
    })
    arrayIdx++
  }

  return {
    isCorrect: uniqueBlanks.size > 0 && allCorrect,
    blanks: blankEvals,
  }
}

/** Evaluates user input against a typein card's accepted answers list. */
export function evaluateTypeinAnswer(
  typein: { acceptedAnswers: string[] },
  input: string,
): boolean {
  const normalized = normalizeAnswer(input)
  return typein.acceptedAnswers.some((ans) => normalizeAnswer(ans) === normalized)
}

/**
 * Universal answer evaluator for review engines:
 * Handles cloze and typein cards; returns false for non-answerable formats.
 */
export function isCardAnswerCorrect(
  content: CardContent,
  input: string | string[] | Record<number, string>,
): boolean {
  if (content.typein) {
    const textInput =
      typeof input === 'string' ? input : Array.isArray(input) ? (input[0] ?? '') : (input[1] ?? '')
    return evaluateTypeinAnswer(content.typein, textInput)
  }
  if (content.cloze) {
    return evaluateClozeAnswer(content.cloze, input).isCorrect
  }
  return false
}

// ─── Validation (zod schemas per format, matching types.ts CardContent) ─────

const rectSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  label: z.string().optional(),
  shape: z.enum(['rect', 'ellipse']).optional().default('rect'),
})

const contentSchemas = {
  basic: z.object({
    front: z.string().min(1),
    back: z.string().min(1),
    // dual coding (Paivio): optional image shown with the card front
    imageId: z.number().int().min(1).optional(),
    // desirable difficulty (Bjork): alternate phrasings, rotated per exposure
    variants: z.array(z.string().min(1)).max(5).optional(),
  }),
  cloze: z.object({
    text: z
      .string()
      .min(1)
      .refine((t) => hasClozeMarker(t), 'text must contain {{cN::answer}} markers'),
    answers: z.array(z.string().min(1)).min(1),
    mode: z.enum(['basic', 'typein', 'enumeration']),
    hint: z.string().optional(),
  }),
  mcq: z
    .object({
      question: z.string().min(1),
      options: z.array(z.string().min(1)).min(2),
      correctIndex: z.number().int().min(0),
      rationale: z.string().optional(),
      // desirable difficulty (Bjork): alternate phrasings, rotated per exposure
      variants: z.array(z.string().min(1)).max(5).optional(),
    })
    .refine((v) => v.correctIndex < v.options.length, 'correctIndex out of bounds'),
  typein: z.object({
    question: z.string().min(1),
    acceptedAnswers: z.array(z.string().min(1)).min(1),
    // desirable difficulty (Bjork): alternate phrasings, rotated per exposure
    variants: z.array(z.string().min(1)).max(5).optional(),
  }),
  occlusion: z.object({
    imageId: z.number().int().min(1),
    rects: z.array(rectSchema).min(1),
    mode: z
      .enum(['hide-all-guess-one', 'hide-one-guess-one'])
      .optional()
      .default('hide-all-guess-one'),
    activeRectId: z.string().optional(),
    groupId: z.string().optional(),
  }),
  sketch: z.object({
    prompt: z.string().min(1),
    referenceImageId: z.number().int().min(1).optional(),
    referenceImageUrl: z.string().optional(),
    referenceText: z.string().optional(),
    rubric: z.array(z.string().min(1)).optional(),
  }),
  proof_step: z
    .object({
      theorem: z.string().min(1),
      proofSteps: z.array(z.string().min(1)).min(1),
      stepIndex: z.number().int().min(0),
      justification: z.string().min(1),
      sourceLemma: z.string().optional(),
    })
    .refine((v) => v.stepIndex < v.proofSteps.length, 'stepIndex out of bounds'),
  grammar: z.object({
    sentence: z.string().min(1),
    pattern: z.string().min(1),
    target: z.string().min(1),
    translation: z.string().optional(),
  }),
  matching: z.object({
    pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2),
  }),
  // Any practice-engine exercise (mcq, numeric, code, …) — one schedulable card each.
  exercise: exerciseSchema,
}

/** Result of card-content validation (wrapped CardContent or issue strings). */
export type ValidatedContent =
  { ok: true; data: CardContent; errors: [] } | { ok: false; data: null; errors: string[] }

/** Validate card content for a format; returns zod issue strings on failure. */
/** Type guard: `v` names a card format this build can validate and render. */
export function isCardFormat(v: unknown): v is CardFormat {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(contentSchemas, v)
}

export function validateCardContent(format: CardFormat, content: unknown): ValidatedContent {
  const schema = contentSchemas[format]
  if (!schema) return { ok: false, data: null, errors: [`unknown format: ${format}`] }
  // Unroll if content is already wrapped in { [format]: payload } (e.g. CardContent)
  const raw =
    content && typeof content === 'object' && format in (content as Record<string, unknown>)
      ? (content as Record<string, unknown>)[format]
      : content
  const result = schema.safeParse(raw)
  if (result.success) {
    return { ok: true, data: { [format]: result.data } as CardContent, errors: [] }
  }
  return {
    ok: false,
    data: null,
    errors: result.error.issues.map((i) => `${i.path.join('.') || format}: ${i.message}`),
  }
}

/**
 * Front text for this exposure (desirable difficulty, Bjork): rotate through
 * the primary front and its alternate phrasings by review count, so retrieval
 * can't key on one surface form. Deterministic — no RNG, stable per reps.
 */
export function pickBasicFront(
  basic: { front: string; variants?: string[] },
  reps: number,
): string {
  const pool = [basic.front, ...(basic.variants ?? [])]
  const k = Math.max(0, Math.floor(reps))
  return pool[k % pool.length]!
}

/**
 * Picks the active prompt/question text for any card format, rotating across
 * alternate phrasings (Bjork desirable difficulties) as `reps` advances.
 * Prevents pattern-matching on accidental surface cues.
 */
export function pickCardPrompt(card: { type?: string; content: CardContent; reps?: number }): {
  text: string
  isVariant: boolean
  variantIndex: number
  totalVariants: number
} {
  const reps = Math.max(0, Math.floor(card.reps ?? 0))
  const { content } = card

  if (content.basic) {
    const pool = [content.basic.front, ...(content.basic.variants ?? [])]
    const idx = reps % pool.length
    return {
      text: pool[idx]!,
      isVariant: idx > 0,
      variantIndex: idx,
      totalVariants: pool.length - 1,
    }
  }

  if (content.typein) {
    const pool = [content.typein.question, ...(content.typein.variants ?? [])]
    const idx = reps % pool.length
    return {
      text: pool[idx]!,
      isVariant: idx > 0,
      variantIndex: idx,
      totalVariants: pool.length - 1,
    }
  }

  if (content.mcq) {
    const pool = [content.mcq.question, ...(content.mcq.variants ?? [])]
    const idx = reps % pool.length
    return {
      text: pool[idx]!,
      isVariant: idx > 0,
      variantIndex: idx,
      totalVariants: pool.length - 1,
    }
  }

  if (content.cloze) {
    return {
      text: content.cloze.text,
      isVariant: false,
      variantIndex: 0,
      totalVariants: 0,
    }
  }

  if (content.exercise) {
    return {
      text: content.exercise.prompt,
      isVariant: false,
      variantIndex: 0,
      totalVariants: 0,
    }
  }

  return {
    text: '',
    isVariant: false,
    variantIndex: 0,
    totalVariants: 0,
  }
}

/**
 * Short front-text preview of any card (weakness lists, lint panels, search
 * results). Markdown markers stripped; truncated to ~90 chars.
 */
export function cardPreviewText(type: string, content: unknown): string | null {
  const c = (content ?? {}) as Record<string, unknown>
  const clean = (s: string | undefined) => s?.replace(/[#*`>]/g, '').slice(0, 90) ?? null
  if (type === 'exercise') {
    const ex = c.exercise as { prompt?: string } | undefined
    return clean(ex?.prompt)
  }
  const basic = c.basic as { front?: string } | undefined
  if (basic?.front) return clean(basic.front)
  const cloze = c.cloze as { text?: string } | undefined
  if (cloze?.text) return clean(cloze.text)
  const mcq = c.mcq as { question?: string } | undefined
  if (mcq?.question) return clean(mcq.question)
  const typein = c.typein as { question?: string } | undefined
  if (typein?.question) return clean(typein.question)
  const sketch = c.sketch as { prompt?: string } | undefined
  if (sketch?.prompt) return clean(sketch.prompt)
  const proof = c.proof_step as { statement?: string } | undefined
  if (proof?.statement) return clean(proof.statement)
  const grammar = c.grammar as { sentence?: string } | undefined
  if (grammar?.sentence) return clean(grammar.sentence)
  return null
}

// ─── Interleaving ───────────────────────────────────────────────────────────

function fisherYates<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

/**
 * Shuffle a review queue with deck fairness: cards from the same deck never
 * (avoidably) appear back-to-back. Each deck's cards are shuffled, then merged
 * round-robin — so a 3-deck mix alternates decks instead of clustering.
 */
export function interleaveQueue<T extends { deckId: number }>(
  cards: T[],
  rng: () => number = Math.random,
): T[] {
  const byDeck = new Map<number, T[]>()
  for (const card of cards) {
    const q = byDeck.get(card.deckId) ?? []
    q.push(card)
    byDeck.set(card.deckId, q)
  }
  const queues = Array.from(byDeck.values()).map((q) => fisherYates(q, rng))
  const out: T[] = []
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift()
      if (next !== undefined) out.push(next)
    }
  }
  return out
}

// ─── Bullet → card regeneration ─────────────────────────────────────────────

/** Strip a leading markdown bullet marker ("- ", "* ", "+ ", "1. "). */
export function stripBulletMarker(text: string): string {
  return text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim()
}

/** Multi-line Q/A: the answer starts after a line break ("Q: …\nA: …"). */
const QA_MULTILINE_RE = /^(?:Q|question)\d*\s*[:.)]\s*(.+?)[\n\r]+(?:A|answer)\d*\s*[:.)]\s*(.+)$/is
/**
 * Single-line Q/A: answer marker later on the SAME line ("Q: … A: …"). The
 * front part is matched greedily so embedded enumeration markers inside the
 * question ("a)", "b.") don't truncate it at the first one.
 */
const QA_SINGLELINE_RE = /^(?:Q|question)\d*\s*[:.)]\s*(.+)\s+(?:A|answer)\d*\s*[:.)]\s*(.+)$/i

/**
 * Regenerate a card's content from a note bullet (RemNote pattern: bullets ARE
 * cards). Detection order: cloze markers → Q:/A: pairs (multi-line, then
 * single-line) → "::" / " | " splits → plain front-only basic card. Returns
 * everything the caller needs to PATCH the existing card row.
 */
export function syncBulletCard(
  bulletContent: string,
  cardId: number,
  fallbackBack = '...',
): { cardId: number; type: CardFormat; content: CardContent } {
  const text = stripBulletMarker(bulletContent)
  if (hasClozeMarker(text)) {
    const cloze = parseCloze(text)
    return { cardId, type: 'cloze', content: { cloze } }
  }
  const qaMatch = text.match(QA_MULTILINE_RE) ?? text.match(QA_SINGLELINE_RE)
  if (qaMatch) {
    return {
      cardId,
      type: 'basic',
      content: { basic: { front: qaMatch[1]!.trim(), back: qaMatch[2]!.trim() } },
    }
  }
  const sepIndex = text.includes('::')
    ? text.indexOf('::')
    : text.includes(' | ')
      ? text.indexOf(' | ')
      : -1
  if (sepIndex !== -1) {
    const sepLen = text.startsWith('::', sepIndex) ? 2 : 3
    return {
      cardId,
      type: 'basic',
      content: {
        basic: {
          front: text.slice(0, sepIndex).trim(),
          back: text.slice(sepIndex + sepLen).trim(),
        },
      },
    }
  }
  return { cardId, type: 'basic', content: { basic: { front: text, back: fallbackBack } } }
}
