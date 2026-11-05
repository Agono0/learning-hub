/**
 * Card quality linter (Agent A) — a selected subset of Piotr Wozniak's
 * "20 Rules for Formulating Knowledge" as automated checks on CardContent.
 * Pure module — safe for client bundles.
 *
 * Rules implemented:
 *  W1  minimum information — one card, one question (multi-question detection)
 *  W2  avoid sets          — enumerations of 3+ items in an answer
 *  W3  minimum answer length — answers over ~8 words
 *  W6  interference        — near-duplicate cards in the same deck
 *  W9  source              — knowledge without provenance
 *  W10 imagery             — concrete nouns deserve a vivid image
 *  W11 cloze deletion      — long basic answers want cloze form
 *  W14 context cues        — bare pronouns with no domain context
 *  W18 date-stamping       — "current/recent/latest" rot without a date
 *  W19 priority stamp      — untagged cards can't take part in priority queues
 */
import type { CardContent, CardFormat } from './types'
import { exerciseToText } from './practice/to-text'
import { clozeSegments } from './cards'

/** One linter finding: Wozniak rule id, severity, message, optional fix. */
export interface LintResult {
  ruleId: string
  severity: 'error' | 'warn' | 'info'
  message: string
  suggestion?: string
}

/** Card row (plus provenance/tags) passed to the lint checks. */
export interface LintCardInput {
  id?: number
  deckId?: number | null
  type: CardFormat
  content: CardContent
  source?: string | null
  tags?: string[] | null
}

/** Per-card lint findings for a whole deck. */
export interface LintDeckEntry {
  cardId: number
  results: LintResult[]
}

// ─── Text helpers ───────────────────────────────────────────────────────────

const WORD_SPLIT = /\s+/

function words(text: string): string[] {
  return text.trim().split(WORD_SPLIT).filter(Boolean)
}

/** Normalized form used for interference detection: lowercase alphanumerics only. */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
export function diceSimilarity(a: string, b: string): number {
  const sa = normalizeForCompare(a)
  const sb = normalizeForCompare(b)
  if (sa === sb) return 1
  if (sa.length < 2 || sb.length < 2) return 0
  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const gram = s.slice(i, i + 2)
      m.set(gram, (m.get(gram) ?? 0) + 1)
    }
    return m
  }
  const ma = bigrams(sa)
  const mb = bigrams(sb)
  let overlap = 0
  for (const [gram, count] of ma) {
    const other = mb.get(gram)
    if (other) overlap += Math.min(count, other)
  }
  const total = sa.length - 1 + sb.length - 1 || 1
  return (2 * overlap) / total
}

const QUESTION_SPLIT = /[?.!;]\s+|\n+/g

/**
 * The question a card "asks", per format — used for multi-question detection
 * and duplicate detection. Returns '' for non-textual formats.
 */
export function cardFrontText(content: CardContent): string {
  if (content.basic) return content.basic.front
  if (content.mcq) return content.mcq.question
  if (content.typein) return content.typein.question
  if (content.cloze) return content.cloze.text.replace(/\{\{c\d+::.*?\}\}/g, '___')
  if (content.grammar) return content.grammar.sentence
  if (content.proof_step) return content.proof_step.theorem
  if (content.exercise) return content.exercise.prompt
  return ''
}

function cardAnswerText(content: CardContent): string {
  if (content.basic) return content.basic.back
  if (content.typein) return content.typein.acceptedAnswers[0] ?? ''
  if (content.mcq) return content.mcq.options[content.mcq.correctIndex] ?? ''
  if (content.cloze) return content.cloze.answers.join(', ')
  if (content.grammar) return content.grammar.target
  if (content.proof_step) return content.proof_step.justification
  if (content.exercise) return exerciseToText(content.exercise).back
  return ''
}

// ─── Rule data ──────────────────────────────────────────────────────────────

/** Concrete-noun lexicon for the imagery suggestion (kept small and curated). */
const CONCRETE_NOUNS = new Set([
  'apple',
  'bridge',
  'castle',
  'cathedral',
  'cell',
  'compass',
  'crystal',
  'dolphin',
  'engine',
  'enzyme',
  'forest',
  'fountain',
  'glacier',
  'guitar',
  'hammer',
  'harbor',
  'helicopter',
  'island',
  'jungle',
  'kitchen',
  'lantern',
  'lighthouse',
  'machine',
  'meadow',
  'microscope',
  'mirror',
  'mitochondrion',
  'mountain',
  'neuron',
  'ocean',
  'orchard',
  'organism',
  'piano',
  'pirate',
  'planet',
  'pyramid',
  'river',
  'rocket',
  'sailboat',
  'ship',
  'skeleton',
  'stadium',
  'sword',
  'temple',
  'tower',
  'train',
  'tree',
  'valley',
  'village',
  'volcano',
  'waterfall',
  'whale',
  'windmill',
  'wolf',
])

const BARE_PRONOUNS = new Set([
  'it',
  'its',
  'they',
  'them',
  'their',
  'this',
  'that',
  'these',
  'those',
  'he',
  'she',
  'his',
  'her',
])

const RELATIVE_TIME_WORDS = new Set([
  'current',
  'currently',
  'latest',
  'recent',
  'recently',
  'now',
  'today',
  'newest',
  'presently',
  'modern',
])

function countQuestions(front: string): number {
  const explicit = (front.match(/\?/g) ?? []).length
  if (explicit > 0) return explicit
  // no "?" — count imperative/question sentences
  return words(front).length === 0
    ? 0
    : front.split(QUESTION_SPLIT).filter((s) => s.trim().length > 0).length
}

function splitItems(answer: string): string[] {
  return answer
    .split(/,|;|\band\b|\//gi)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ─── lintCard ───────────────────────────────────────────────────────────────

/**
 * Lint one card. `siblings` are other cards from the same deck — required for
 * interference detection; omit (or pass []) to skip that rule.
 */
export function lintCard(card: LintCardInput, siblings: LintCardInput[] = []): LintResult[] {
  const results: LintResult[] = []
  const front = cardFrontText(card.content)
  const answer = cardAnswerText(card.content)

  // W1 — minimum information: one question per card
  if (front && countQuestions(front) > 1) {
    results.push({
      ruleId: 'W1-minimum-information',
      severity: 'error',
      message: 'Card asks more than one question — split it into minimum-information pieces.',
      suggestion: 'Make one card per question; delete the extra questions from this card.',
    })
  }

  // W2 — avoid sets/enumerations in answers
  const items = splitItems(answer)
  if (answer && items.length >= 3) {
    results.push({
      ruleId: 'W2-avoid-sets',
      severity: 'warn',
      message: `Answer is an enumeration of ${items.length} items — sets are hard to retain.`,
      suggestion: 'Split into one card per item, or convert to an overlapping cloze.',
    })
  }

  // W3 — minimum information: answer length
  const answerWordCount = words(answer).length
  if (answerWordCount > 8) {
    results.push({
      ruleId: 'W3-answer-length',
      severity: 'warn',
      message: `Answer is ${answerWordCount} words long — long answers defeat active recall.`,
      suggestion:
        'Reduce to the core fact (ideally a single word or number) and move the rest into more cards.',
    })
  }

  // W6 — interference: near-duplicate of a sibling card
  if (front) {
    for (const sibling of siblings) {
      if (sibling.id !== undefined && card.id !== undefined && sibling.id === card.id) continue
      const siblingFront = cardFrontText(sibling.content)
      if (!siblingFront) continue
      const similarity = diceSimilarity(front, siblingFront)
      if (similarity >= 0.85) {
        results.push({
          ruleId: 'W6-interference',
          severity: 'warn',
          message: `Near-duplicate of card ${sibling.id ?? 'sibling'} (${Math.round(similarity * 100)}% similar) — interference risk.`,
          suggestion:
            'Differentiate the two cards explicitly (different angle, different cue) or delete one.',
        })
        break
      }
    }
  }

  // W9 — source missing
  if (!card.source) {
    results.push({
      ruleId: 'W9-source-missing',
      severity: 'info',
      message: 'No source recorded.',
      suggestion: 'Add where this came from (pdf, lecture, url) so it can be re-verified.',
    })
  }

  // W10 — imagery suggestion for concrete nouns
  const singleAnswer = answer
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
  if (CONCRETE_NOUNS.has(singleAnswer)) {
    results.push({
      ruleId: 'W10-imagery',
      severity: 'info',
      message: `"${singleAnswer}" is a concrete noun — attach a vivid mental image.`,
      suggestion:
        'Picture the object in a specific, exaggerated scene (memory palace locus works well).',
    })
  }

  // W11 — cloze suggestion for long basic answers
  if (card.type === 'basic' && answerWordCount >= 5 && answerWordCount <= 8) {
    results.push({
      ruleId: 'W11-cloze-suggestion',
      severity: 'info',
      message: 'Answer is sentence-length — a cloze deletion may test it more efficiently.',
      suggestion: 'Rewrite as: "{{c1::<the fact>}} <context>" and switch the format to cloze.',
    })
  }

  // W14 — context cues: bare pronouns without domain context
  if (front) {
    const bare = words(front.toLowerCase().replace(/[^a-z\s]/g, '')).filter((w) =>
      BARE_PRONOUNS.has(w),
    )
    const hasContext = /:|in |for |according to|per /.test(front)
    if (bare.length > 0 && !hasContext) {
      results.push({
        ruleId: 'W14-context-cue',
        severity: 'warn',
        message: `Question relies on bare pronouns ("${bare.join('", "')}") with no domain context.`,
        suggestion:
          'Prefix the domain, e.g. "In calculus: ..." — context cues prevent wrong-thread recall.',
      })
    }
  }

  // W18 — date stamping
  const frontWords = words(front.toLowerCase())
  if (frontWords.some((w) => RELATIVE_TIME_WORDS.has(w))) {
    results.push({
      ruleId: 'W18-date-stamp',
      severity: 'warn',
      message: 'Card references relative time ("current", "latest", ...) — it will silently rot.',
      suggestion: 'Stamp the claim with a date or year ("as of 2026: ...").',
    })
  }

  // W19 — priority stamping
  if (!card.tags || card.tags.length === 0) {
    results.push({
      ruleId: 'W19-priority-stamp',
      severity: 'info',
      message: 'Card has no tags — it cannot take part in priority queues (exam, track, topic).',
      suggestion: 'Add at least one tag, e.g. the deck topic or "exam".',
    })
  }

  return results
}

/** Lint every card in a deck; interference checks run against same-deck siblings. */
export function lintDeck(cards: LintCardInput[]): LintDeckEntry[] {
  return cards.map((card) => {
    const siblings = cards.filter(
      (c) =>
        c.deckId !== undefined &&
        c.deckId !== null &&
        c.deckId === card.deckId &&
        !(c.id !== undefined && card.id !== undefined && c.id === card.id),
    )
    return { cardId: card.id ?? -1, results: lintCard(card, siblings) }
  })
}

/** Rendered cloze segments helper re-exported for lint consumers. */
export { clozeSegments }
