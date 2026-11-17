import { z } from 'zod'

/**
 * @file Pretesting & Errorful Generation Engine — the "guess before you
 * study" protocol that converted one of learning science's most counter-
 * intuitive findings into a schedulable practice policy.
 *
 * The research this engine encodes:
 *
 * 1. **The pretesting effect** — Richland, Kornell & Kao (2009), Kornell,
 *    Hays & Bjork (2009): attempting to retrieve an answer BEFORE studying
 *    it improves long-term retention of that answer, even when the pretest
 *    attempt FAILS. Failed retrieval is not wasted time; it is an encoding
 *    event that makes the subsequent study episode stickier.
 * 2. **Pretest questions must be "solid pretests"** — Little & Bjork (2016):
 *    the benefit appears when the pretest question is conceptually related
 *    to the target (the learner must actually search semantic memory), and
 *    vanishes when the question is arbitrary ("preparation without
 *    pretesting"). The engine scores pretest questions for target
 *    relatedness and demotes arbitrary ones.
 * 3. **Errorful generation needs feedback** — Butler & Roediger (2008):
 *    errors followed by feedback beat no-feedback conditions; without
 *    feedback, committing an error can strengthen the wrong answer. The
 *    engine therefore never schedules an errorful trial without a feedback
 *    step, and tracks feedback compliance.
 * 4. **Hypercorrection synergy** — Butterfield & Metcalfe (2001): errors
 *    committed with HIGH confidence are the most likely to be corrected on
 *    retest. Pretest attempts are graded with a confidence rating so that
 *    confident wrong guesses become priority relearning targets (see
 *    metacognition/hypercorrection-engine).
 * 5. **The Preattachment/semantics caveat** — Vaughn & Rawson (2012) showed
 *    pretesting benefits generalize to new test items, but Kornell & Vaughn
 *    (2016) note the effect is strongest when feedback follows quickly and
 *    the studied answer resolves the pretest question. The engine schedules
 *    the study episode IMMEDIATELY after the pretest attempt, never later in
 *    the session.
 * 6. **Successive relearning** — Rawson & Dunlosky (2011): pretest → study →
 *    retest cycles until a criterion, which the engine supports via a
 *    per-card criterion counter.
 *
 * Pure domain logic — no I/O, no DB, deterministic. The handler feeds real
 * card candidates; the studio renders the protocol loop.
 */

// ---------------------------------------------------------------------------
// 1. Schemas
// ---------------------------------------------------------------------------

/** The kind of pretest question generated for a target. */
export const pretestKindSchema = z.enum([
  'inferential_why',
  'semantic_association',
  'anagram_generation',
  'cloze_completion',
  'direct_retrieval',
])
export type PretestKind = z.infer<typeof pretestKindSchema>

/** One pretest attempt: the guess, its confidence, and the timed feedback. */
export const pretestAttemptSchema = z.object({
  cardId: z.number().int().positive(),
  kind: pretestKindSchema,
  /** The learner's guess (may be empty for a pass) */
  guess: z.string().max(500).default(''),
  /**
   * Confidence attached to the guess BEFORE feedback (0–1). High-confidence
   * wrong guesses are hypercorrection gold (Butterfield & Metcalfe 2001).
   */
  confidence: z.number().min(0).max(1),
  /** Whether the guess actually matched the target (graded after feedback) */
  wasCorrect: z.boolean().optional(),
  /** Milliseconds spent searching memory before guessing */
  searchMs: z.number().min(0).optional(),
  /** Whether feedback was delivered after the attempt (protocol compliance) */
  feedbackDelivered: z.boolean().default(true),
})
export type PretestAttempt = z.infer<typeof pretestAttemptSchema>

/** The study episode that must IMMEDIATELY follow a pretest attempt. */
export const studyEpisodeSchema = z.object({
  cardId: z.number().int().positive(),
  /** Milliseconds after the pretest guess that study began (protocol: small) */
  delayMsAfterAttempt: z.number().min(0).max(600000),
  /** Whether the studied answer resolves the pretest question (Little & Bjork) */
  resolvesPretest: z.boolean().default(true),
})
export type StudyEpisode = z.infer<typeof studyEpisodeSchema>

/** Per-card protocol state for a pretesting session. */
export const pretestCardStateSchema = z.object({
  cardId: z.number().int().positive(),
  prompt: z.string(),
  target: z.string(),
  kind: pretestKindSchema,
  /** Question–target relatedness score 0–1 (Little & Bjork 2016 gate) */
  relatedness: z.number().min(0).max(1),
  attempts: z.array(pretestAttemptSchema).default([]),
  studyEpisodes: z.array(studyEpisodeSchema).default([]),
  /** Successive-relearning criterion (Rawson & Dunlosky 2011) */
  criterionRecalls: z.number().int().min(1).default(3),
  successfulRecalls: z.number().int().min(0).default(0),
  criterionMet: z.boolean().default(false),
})
export type PretestCardState = z.infer<typeof pretestCardStateSchema>

// ---------------------------------------------------------------------------
// 2. Pretest question generation (deterministic, from card content)
// ---------------------------------------------------------------------------

/** Stop words excluded from keyword extraction. */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'of',
  'to',
  'in',
  'for',
  'on',
  'and',
  'or',
  'by',
  'with',
  'that',
  'this',
  'it',
  'as',
  'at',
  'be',
  'from',
  'what',
  'how',
  'why',
  'which',
  'when',
  'who',
  'does',
  'do',
  'can',
  'not',
])

function keywordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
}

/**
 * Scores how conceptually related a generated pretest question is to its
 * target answer (the Little & Bjork 2016 "solid pretest" gate). A question
 * that shares no keywords with the target is arbitrary preparation, not a
 * pretest. Deterministic and pure.
 */
export function pretestRelatedness(question: string, target: string): number {
  const q = new Set(keywordsOf(question))
  const t = keywordsOf(target)
  if (t.length === 0) return 0.5 // ungradable target → neutral, flagged by caller
  let hits = 0
  for (const w of t) {
    if (q.has(w)) hits++
    else {
      // partial stem match (e.g. "consolidat" in "consolidation")
      for (const qw of q) {
        if (qw.length >= 5 && (qw.startsWith(w.slice(0, 5)) || w.startsWith(qw.slice(0, 5)))) {
          hits += 0.5
          break
        }
      }
    }
  }
  return Number(Math.min(1, hits / t.length).toFixed(3))
}

/**
 * Deterministically picks the pretest kind for a card: direct prompts get
 * direct retrieval, definitional targets get inferential why-questions,
 * single-word targets get anagram generation, multi-word targets get cloze.
 */
export function pickPretestKind(prompt: string, target: string): PretestKind {
  const targetWords = target.trim().split(/\s+/).filter(Boolean)
  const promptLower = prompt.toLowerCase()
  if (promptLower.startsWith('why') || promptLower.includes('why')) {
    return 'inferential_why'
  }
  if (targetWords.length === 1 && targetWords[0].length >= 5) {
    return 'anagram_generation'
  }
  if (promptLower.includes('what is') || promptLower.includes('define')) {
    return 'direct_retrieval'
  }
  if (targetWords.length > 1) {
    return 'cloze_completion'
  }
  return 'semantic_association'
}

/** Scrambles a word deterministically (seeded by the word itself). */
function seededAnagram(word: string): string {
  const chars = word.split('')
  let seed = 0
  for (let i = 0; i < word.length; i++) seed = (seed * 31 + word.charCodeAt(i)) % 99991
  for (let i = chars.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const j = seed % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** Builds the pretest question text for a card (deterministic). */
export function buildPretestQuestion(
  prompt: string,
  target: string,
): { kind: PretestKind; question: string } {
  const kind = pickPretestKind(prompt, target)
  const words = target.trim().split(/\s+/).filter(Boolean)
  switch (kind) {
    case 'inferential_why':
      return {
        kind,
        question: `Before studying: WHY might the following be true — "${prompt}"?`,
      }
    case 'anagram_generation':
      return {
        kind,
        question: `Unscramble the answer to "${prompt}": ${seededAnagram(words[0].toUpperCase())}`,
      }
    case 'cloze_completion': {
      const cloze = words.map((w, i) => (i % 2 === 1 && w.length > 3 ? '____' : w)).join(' ')
      return {
        kind,
        question: `Guess the missing terms for "${prompt}": ${cloze}`,
      }
    }
    case 'direct_retrieval':
      return { kind, question: `Try to answer before studying: ${prompt}` }
    default:
      return {
        kind,
        question: `What comes to mind when you read "${prompt}"? Guess before you study.`,
      }
  }
}

/**
 * Grades a guess against the target with forgiving matching: case-
 * insensitive, whitespace-collapsed, substring credit for long targets.
 */
export function gradeGuess(guess: string, target: string): boolean {
  // Forgiving normalization: case, whitespace, and leading articles.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(the|a|an)\s+/, '')
  const g = norm(guess)
  const t = norm(target)
  if (g.length === 0) return false
  if (g === t) return true
  if (t.length > 12 && (t.includes(g) || g.includes(t))) return true
  // ≥80% word overlap on multi-word targets counts as recall-with-slips.
  if (t.length > 20) {
    const gSet = new Set(g.split(' '))
    const tSet = t.split(' ')
    const hits = tSet.filter((w) => gSet.has(w)).length
    if (hits / tSet.length >= 0.8) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// 3. Protocol evaluation
// ---------------------------------------------------------------------------

export interface PretestCardAudit {
  cardId: number
  /** Number of pretest attempts made before the first study episode */
  pretestAttempts: number
  /** Whether the first attempt failed (the classic pretesting-effect setup) */
  firstAttemptFailed: boolean
  /** Whether feedback followed every attempt (Butler & Roediger gate) */
  feedbackCompliant: boolean
  /** Whether study began promptly after the attempts (Kornell & Vaughn gate) */
  promptStudy: boolean
  /** Solid-pretest gate (Little & Bjork 2016) — relatedness ≥ 0.5 */
  solidPretest: boolean
  /** Successive relearning progress toward the criterion */
  relearningProgress: number
  /**
   * Predicted retention multiplier for the card from this protocol: 1.0
   * (no benefit) to 1.25 (failed pretest + feedback + prompt study + solid
   * question + criterion met). Anchored on the effect sizes in Kornell,
   * Hays & Bjork (2009; d ≈ 0.3–0.5 across conditions).
   */
  predictedRetentionMultiplier: number
  /** Why the multiplier is what it is (for the studio) */
  rationale: string
}

/**
 * Audits one card's protocol compliance and predicts its retention
 * multiplier. The multiplier is CAPPED at 1.25 — the engine never promises
 * lab-scale effects outside the lab.
 */
export function auditPretestCard(state: PretestCardState): PretestCardAudit {
  const attempts = state.attempts
  const pretestAttempts = attempts.length
  const first = attempts[0]
  const firstAttemptFailed = first !== undefined && first.wasCorrect === false
  const feedbackCompliant = attempts.length > 0 && attempts.every((a) => a.feedbackDelivered)
  const firstStudy = state.studyEpisodes[0]
  const promptStudy =
    firstStudy !== undefined &&
    firstStudy.delayMsAfterAttempt <= 60_000 &&
    firstStudy.resolvesPretest
  const solidPretest = state.relatedness >= 0.5

  // No attempts → no protocol signals → exactly the study-only baseline.
  let multiplier = 1.0
  const drivers: string[] = []
  if (pretestAttempts > 0) {
    if (firstAttemptFailed) {
      multiplier += 0.08
      drivers.push('failed pretest attempt (Kornell, Hays & Bjork 2009)')
    }
    if (feedbackCompliant) {
      multiplier += 0.05
      drivers.push('feedback after every attempt (Butler & Roediger 2008)')
    } else {
      drivers.push('⚠ an attempt lacked feedback — uncorrected errors can strengthen wrong answers')
    }
    if (promptStudy) {
      multiplier += 0.05
      drivers.push('study episode immediately resolved the pretest question')
    }
    if (solidPretest) {
      multiplier += 0.04
      drivers.push(
        'solid pretest: question is conceptually tied to the target (Little & Bjork 2016)',
      )
    } else {
      drivers.push(
        '⚠ arbitrary pretest question — preparation without pretesting (Little & Bjork 2016)',
      )
    }
    if (state.criterionMet) {
      multiplier += 0.03
      drivers.push('successive-relearning criterion met (Rawson & Dunlosky 2011)')
    }
  }
  const relearningProgress =
    state.criterionRecalls > 0
      ? Number(Math.min(1, state.successfulRecalls / state.criterionRecalls).toFixed(3))
      : 0

  return {
    cardId: state.cardId,
    pretestAttempts,
    firstAttemptFailed,
    feedbackCompliant: attempts.length === 0 ? false : feedbackCompliant,
    promptStudy: firstStudy !== undefined ? promptStudy : false,
    solidPretest,
    relearningProgress,
    predictedRetentionMultiplier: Number(Math.min(1.25, multiplier).toFixed(3)),
    rationale:
      pretestAttempts === 0
        ? 'No pretest attempt yet — study-only cards get no pretesting multiplier.'
        : drivers.length > 0
          ? drivers.join('; ')
          : 'Attempt recorded without protocol signals.',
  }
}

export interface PretestingSessionReport {
  cards: PretestCardAudit[]
  /** Share of attempted cards that followed the full protocol (0–1) */
  protocolCompliance: number
  /** Mean predicted multiplier over attempted cards */
  meanPredictedMultiplier: number
  /** Confident wrong guesses — hypercorrection retest targets */
  hypercorrectionTargets: { cardId: number; confidence: number; guess: string }[]
  /** Cards still awaiting their criterion (successive relearning queue) */
  relearningQueue: number[]
  guidance: string
}

/**
 * Aggregates a session: compliance, forecasts, and the hypercorrection/
 * relearning hand-offs. Empty input stays honest — no fabricated compliance.
 */
export function evaluatePretestingSession(states: PretestCardState[]): PretestingSessionReport {
  const attempted = states.filter((s) => s.attempts.length > 0)
  const audits = attempted.map(auditPretestCard)

  const fullProtocol = audits.filter(
    (a) => a.firstAttemptFailed && a.feedbackCompliant && a.promptStudy && a.solidPretest,
  ).length
  const protocolCompliance =
    audits.length === 0 ? 0 : Number((fullProtocol / audits.length).toFixed(3))

  const meanPredictedMultiplier =
    audits.length === 0
      ? 1
      : Number(
          (audits.reduce((a, x) => a + x.predictedRetentionMultiplier, 0) / audits.length).toFixed(
            3,
          ),
        )

  const hypercorrectionTargets = attempted.flatMap((s) =>
    s.attempts
      .filter((a) => a.wasCorrect === false && a.confidence >= 0.7)
      .map((a) => ({ cardId: s.cardId, confidence: a.confidence, guess: a.guess })),
  )

  const relearningQueue = states
    .filter((s) => !s.criterionMet && s.attempts.length > 0)
    .map((s) => s.cardId)

  let guidance: string
  if (attempted.length === 0) {
    guidance =
      'No pretest attempts yet. Pretesting means GUESSING before studying — a wrong guess followed by immediate study is the point, not a failure.'
  } else if (protocolCompliance < 0.5) {
    guidance =
      'Protocol compliance is low: the pretesting effect needs a failed guess, immediate feedback, study that resolves the question, and a conceptually related prompt. Tighten the loop below.'
  } else if (hypercorrectionTargets.length > 0) {
    guidance =
      'Strong protocol. Retest the confident wrong guesses first — high-confidence errors are the most likely to be permanently corrected (Butterfield & Metcalfe 2001).'
  } else {
    guidance =
      'Strong protocol compliance — keep guessing before studying, and run each card to its successive-relearning criterion.'
  }

  return {
    cards: audits,
    protocolCompliance,
    meanPredictedMultiplier,
    hypercorrectionTargets,
    relearningQueue,
    guidance,
  }
}

// ---------------------------------------------------------------------------
// 4. Session state machine (studio backend)
// ---------------------------------------------------------------------------

export interface PretestingSessionState {
  states: Map<number, PretestCardState>
  activeCardId: number | null
  phase: 'pretest' | 'feedback' | 'study' | 'retest' | 'complete'
  lastFeedback: string | null
  lastShockConfidence: number | null
}

/**
 * Drives the pretest → feedback → study → retest loop per card. Pure and
 * deterministic; the React studio owns rendering and timing only.
 */
export class PretestingSession {
  private state: PretestingSessionState

  constructor(private readonly prompts: { cardId: number; prompt: string; target: string }[]) {
    const states = new Map<number, PretestCardState>()
    for (const p of prompts) {
      const { kind, question } = buildPretestQuestion(p.prompt, p.target)
      states.set(p.cardId, {
        cardId: p.cardId,
        prompt: question,
        target: p.target,
        kind,
        relatedness: pretestRelatedness(question, p.target),
        attempts: [],
        studyEpisodes: [],
        criterionRecalls: 3,
        successfulRecalls: 0,
        criterionMet: false,
      })
    }
    const first = prompts[0]?.cardId ?? null
    this.state = {
      states,
      activeCardId: first,
      phase: first === null ? 'complete' : 'pretest',
      lastFeedback: null,
      lastShockConfidence: null,
    }
  }

  getState(): Readonly<PretestingSessionState> {
    return this.state
  }

  currentCard(): PretestCardState | null {
    return this.state.activeCardId === null
      ? null
      : (this.state.states.get(this.state.activeCardId) ?? null)
  }

  /**
   * Records a pretest guess: grades it, attaches confidence, requires
   * feedback, and moves to the study phase. The guess is never discarded —
   * a wrong guess is the protocol's engine, not an error to hide.
   */
  recordPretestAttempt(input: {
    guess: string
    confidence: number
    searchMs?: number
    feedbackDelivered?: boolean
  }): { success: boolean; feedback: string; wasCorrect: boolean | null } {
    const card = this.currentCard()
    if (!card) {
      return { success: false, feedback: 'No card is pending a pretest attempt.', wasCorrect: null }
    }
    if (this.state.phase !== 'pretest') {
      return {
        success: false,
        feedback: 'The loop expects feedback → study → retest first.',
        wasCorrect: null,
      }
    }
    if (input.confidence < 0 || input.confidence > 1) {
      return { success: false, feedback: 'Confidence must be within 0–1.', wasCorrect: null }
    }
    const wasCorrect = gradeGuess(input.guess, card.target)
    const feedbackDelivered = input.feedbackDelivered ?? true
    card.attempts.push({
      cardId: card.cardId,
      kind: card.kind,
      guess: input.guess,
      confidence: input.confidence,
      wasCorrect,
      searchMs: input.searchMs,
      feedbackDelivered,
    })
    this.state.lastShockConfidence = wasCorrect ? null : input.confidence
    this.state.phase = 'study'
    this.state.lastFeedback = feedbackDelivered
      ? wasCorrect
        ? `Correct — your guess "${input.guess}" matched. Study will consolidate it.`
        : `Wrong — the target is "${card.target}". Study it NOW: the failed guess makes this study episode stick (Kornell, Hays & Bjork 2009).`
      : '⚠ No feedback was delivered — an uncorrected error can strengthen the wrong answer (Butler & Roediger 2008).'
    return { success: true, feedback: this.state.lastFeedback, wasCorrect }
  }

  /** Records the study episode that must promptly follow the attempt. */
  recordStudyEpisode(delayMsAfterAttempt: number): { success: boolean; feedback: string } {
    const card = this.currentCard()
    if (!card) {
      return { success: false, feedback: 'No card is active.' }
    }
    if (this.state.phase !== 'study') {
      return { success: false, feedback: 'Record the pretest attempt before studying.' }
    }
    card.studyEpisodes.push({
      cardId: card.cardId,
      delayMsAfterAttempt,
      resolvesPretest: true,
    })
    this.state.phase = 'retest'
    return {
      success: true,
      feedback:
        delayMsAfterAttempt <= 60_000
          ? 'Study episode logged immediately after the attempt — protocol kept.'
          : '⚠ Study started late: pretest benefits fade when study does not promptly resolve the question.',
    }
  }

  /**
   * Grades a post-study retest recall. Successive relearning: correct
   * recalls accumulate toward the criterion before the card is released.
   */
  recordRetest(correct: boolean): { success: boolean; feedback: string; criterionMet: boolean } {
    const card = this.currentCard()
    if (!card) {
      return { success: false, feedback: 'No card is active.', criterionMet: false }
    }
    if (this.state.phase !== 'retest') {
      return { success: false, feedback: 'Study before retesting.', criterionMet: false }
    }
    if (correct) card.successfulRecalls += 1
    else card.successfulRecalls = 0 // criterion resets on a lapse (Rawson & Dunlosky)
    const met = card.successfulRecalls >= card.criterionRecalls
    card.criterionMet = met

    // Advance to the next unmet card, or complete.
    const next = [...this.state.states.values()].find(
      (s) => !s.criterionMet && s.cardId !== card.cardId,
    )
    this.state.activeCardId = met ? (next?.cardId ?? null) : card.cardId
    this.state.phase = met ? (next ? 'pretest' : 'complete') : 'retest'
    const feedback = met
      ? `Criterion met (${card.successfulRecalls}/${card.criterionRecalls} consecutive recalls).`
      : correct
        ? `Recall ${card.successfulRecalls}/${card.criterionRecalls} toward the criterion.`
        : 'Lapse — the criterion resets; retest after restudying.'
    return { success: true, feedback, criterionMet: met }
  }

  /** Builds the aggregated report for the current session. */
  report(): PretestingSessionReport {
    return evaluatePretestingSession([...this.state.states.values()])
  }
}

// ---------------------------------------------------------------------------
// 5. FSRS bridge
// ---------------------------------------------------------------------------

export interface PretestFsrsCard {
  cardId: number
  stability: number
  difficulty: number
}

/**
 * Prioritizes which cards should get the pretest protocol tonight: the
 * engine's value concentrates on NEW/young cards (stability < 3 days) where
 * the pre-study encoding event has the most to add, and on hard items whose
 * study episodes are typically weak. Returns them ranked, capped.
 */
export function selectPretestCandidates(cards: PretestFsrsCard[], limit = 10): PretestFsrsCard[] {
  return [...cards]
    .map((c) => ({
      ...c,
      score:
        Math.max(0, Math.min(1, 1 - c.stability / 3)) * 0.6 +
        Math.max(0, Math.min(1, (c.difficulty - 1) / 9)) * 0.4,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ cardId, stability, difficulty }) => ({ cardId, stability, difficulty }))
}
