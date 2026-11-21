import { z } from 'zod'
/**
 * @file Structural Invariance & Interleaved Discrimination Engine
 * @description Implements Rohrer & Taylor's (2007) shuffled-practice scheduling,
 * Kornell & Bjork's (2008) inductive category learning, Birnbaum et al.'s (2013)
 * discrimination-by-comparison mechanism and Gick & Holyoak's (1983) surface vs
 * structural feature decomposition of problem schemas.
 *
 * Learners practicing blocked runs of identical problem types learn to key on
 * surface features (story context, entities, units) instead of inducing the deep
 * structural invariant that actually determines the solution principle. Rohrer &
 * Taylor (2007) showed shuffling problem types roughly doubles delayed test
 * scores even though it *lowers* practice-phase accuracy — a canonical desirable
 * difficulty. Kornell & Bjork (2008) further showed interleaving beats massing
 * for inductive category learning while learners consistently predict the
 * opposite (the metacognitive illusion this studio makes visible).
 *
 * The engine is pure and deterministic (no I/O): sequences are generated from a
 * contrast-utility scheduler, attempts are scored into a confusion matrix, and
 * FSRS-ready cards are exported through the same front/back contract the deck
 * pipeline consumes.
 */

// TD-05: the calibrated seed curriculum (counter-balanced categories and problem
// templates) is CONTENT, not logic — it lives in ./content.ts so engine diffs
// stay about algorithms. Re-exported so every existing import path keeps
// working (the barrel does `export * from` this file).
export { CALIBRATED_INVARIANCE_CATEGORIES, CALIBRATED_INVARIANCE_PROBLEMS } from './content'

/**
 * A named feature vector. Keys are feature dimensions (`context`, `entity`,
 * `quantity`), values are the concrete surface or structural values a problem
 * carries. Compared with Jaccard distance over `key=value` tokens.
 */
export type FeatureVector = Record<string, string>

export interface ProblemCategory {
  id: string
  label: string
  /** The deep structural invariant that defines this category (Gick & Holyoak 1983). */
  deepPrinciple: string
  /** Canonical structural feature signature shared by all members of the category. */
  structuralSignature: FeatureVector
  /** One-line discrimination hint contrasting the nearest confusable category. */
  discriminationHint: string
}

export interface ProblemTemplate {
  id: string
  categoryId: string
  title: string
  prompt: string
  /** Surface (storybook) features — deliberately orthogonal to `structuralFeatures`. */
  surfaceFeatures: FeatureVector
  /** Deep structural features — shared within a category across surface disguises. */
  structuralFeatures: FeatureVector
  /** Why the surface story tempts the wrong solution principle, if it does. */
  surfaceLure?: string
  difficulty: number
}

export interface InterleavingOptions {
  /** 0..1 weight on adjacent-category contrast utility (Rohrer-Taylor mechanism). */
  contrastWeight: number
  /** 0..1 weight on spacing lag since a category last appeared (spacing mechanism). */
  spacingWeight: number
}

export interface CategoryContrastCell {
  categoryA: string
  categoryB: string
  /** Mean surface-feature Jaccard distance across cross-category problem pairs (0..1). */
  surfaceDistance: number
  /** Structural-signature Jaccard distance between the two categories (0..1). */
  structuralDistance: number
  /**
   * Contrast utility: how valuable practicing these two categories adjacently is.
   * Maximal when surface features are shared (problems *look* alike) while the
   * deep structures are clearly distinct — the Rohrer (2014) "superficially
   * similar kinds of problems" configuration.
   */
  contrastUtility: number
  /** Confusability mirror of contrastUtility, for heat-map labeling. */
  confusability: number
}

export interface SequenceMetrics {
  categoryEntropy: number
  blockingFactor: number
  transitionCount: number
  /** Mean contrast utility across adjacent category transitions (0..1). */
  meanAdjacentContrast: number
  /** Mean spacing lag between repeats of the same category, in positions. */
  meanCategoryLag: number
}

export interface DiscriminationAttempt {
  problemId: string
  trueCategoryId: string
  chosenCategoryId: string
  /** Milliseconds to answer (used for fluency telemetry only, never for grading). */
  reactionMs?: number
}

export interface ConfusionMatrixCell {
  trueCategoryId: string
  chosenCategoryId: string
  count: number
}

export interface DiscriminationTelemetry {
  totalAttempts: number
  accuracy: number
  matrix: ConfusionMatrixCell[]
  /** Per-category recall: correct picks / times the category was the true one. */
  perCategoryRecall: Array<{ categoryId: string; correct: number; total: number; recall: number }>
  /** Confused pairs sorted by count desc, excluding the diagonal. */
  topConfusions: Array<{ trueCategoryId: string; chosenCategoryId: string; count: number }>
  /**
   * Surface-bias score: of all errors, the fraction where the chosen category's
   * surface signature was *closer* to the problem than the true category's was.
   * High values mean the learner is keying on surface features (Gick & Holyoak's
   * retrieval-by-surface pathology) instead of structural invariants.
   */
  surfaceBiasScore: number
  /** Mean reaction time in ms across attempts that reported one. */
  meanReactionMs: number | null
}

export interface FSRSInterleavingCard {
  id: string
  front: string
  back: string
  tags: string[]
  suggestedInitialStability: number
  suggestedInitialDifficulty: number
  metadata: {
    categoryId: string
    contrastUtility: number
    surfaceBiasScore: number
    domain: string
  }
}

// ---------------------------------------------------------------------------
// 1. Feature-vector distance (Gick & Holyoak 1983: surface vs structural)
// ---------------------------------------------------------------------------

/**
 * Jaccard distance between two named feature vectors over `key=value` tokens
 * (1 − |A∩B| / |A∪B|). Empty vectors are maximally distant from non-empty ones;
 * two empty vectors are identical (0). Deterministic and symmetric.
 */
export function featureVectorDistance(a: FeatureVector, b: FeatureVector): number {
  const tokensA = new Set(Object.entries(a).map(([k, v]) => `${k}=${v}`))
  const tokensB = new Set(Object.entries(b).map(([k, v]) => `${k}=${v}`))
  if (tokensA.size === 0 && tokensB.size === 0) return 0

  let intersection = 0
  for (const t of tokensA) if (tokensB.has(t)) intersection++
  const union = tokensA.size + tokensB.size - intersection
  return union === 0 ? 0 : 1 - intersection / union
}

// ---------------------------------------------------------------------------
// 2. Category contrast matrix (Carvalho & Goldstone 2014 discriminability)
// ---------------------------------------------------------------------------

/**
 * Builds the pairwise category contrast matrix. `surfaceDistance` averages the
 * Jaccard distance of surface features over every cross-category problem pair,
 * so shared story contexts pull the value toward 0 (superficially alike).
 * `contrastUtility = (1 − surfaceDistance) × structuralDistance` peaks for
 * categories that look alike but solve differently — the pairs interleaved
 * practice should force together (Birnbaum et al. 2013).
 */
export function computeCategoryContrastMatrix(
  categories: ProblemCategory[],
  templates: ProblemTemplate[],
): CategoryContrastCell[] {
  const cells: CategoryContrastCell[] = []

  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const a = categories[i]!
      const b = categories[j]!

      const problemsA = templates.filter((t) => t.categoryId === a.id)
      const problemsB = templates.filter((t) => t.categoryId === b.id)

      let surfaceDistance = 1
      if (problemsA.length > 0 && problemsB.length > 0) {
        let total = 0
        for (const pa of problemsA) {
          for (const pb of problemsB) {
            total += featureVectorDistance(pa.surfaceFeatures, pb.surfaceFeatures)
          }
        }
        surfaceDistance = total / (problemsA.length * problemsB.length)
      }

      const structuralDistance = featureVectorDistance(a.structuralSignature, b.structuralSignature)
      const contrastUtility = (1 - surfaceDistance) * structuralDistance

      cells.push({
        categoryA: a.id,
        categoryB: b.id,
        surfaceDistance: round4(surfaceDistance),
        structuralDistance: round4(structuralDistance),
        contrastUtility: round4(contrastUtility),
        confusability: round4(contrastUtility),
      })
    }
  }

  return cells
}

// ---------------------------------------------------------------------------
// 3. Contrast-scheduled sequence generation (Rohrer & Taylor 2007)
// ---------------------------------------------------------------------------

/**
 * Generates a practice sequence under `interleaved` or `blocked` mode.
 *
 * Interleaved scheduling maximizes, at each step, `contrastWeight ×
 * contrastUtility(prevCategory, candidate)` + `spacingWeight × normalizedLag
 * (candidate)` — jointly operationalizing Rohrer & Taylor's discrimination and
 * spacing mechanisms. Blocked mode emits AAA-BBB-CCC runs: the schedule learners
 * predict is better but is not (Kornell & Bjork 2008), kept as the A/B
 * comparator. Deterministic tie-breaking by template id.
 */
export function generateContrastSchedule(
  templates: ProblemTemplate[],
  categories: ProblemCategory[],
  options: Partial<InterleavingOptions> & { mode?: 'interleaved' | 'blocked' } = {},
): { schedule: ProblemTemplate[]; metrics: SequenceMetrics } {
  const mode = options.mode ?? 'interleaved'
  const contrastWeight = options.contrastWeight ?? 0.7
  const spacingWeight = options.spacingWeight ?? 0.3

  let schedule: ProblemTemplate[]
  if (mode === 'blocked') {
    // Group by category in category declaration order, then template id order.
    schedule = []
    for (const cat of categories) {
      const group = templates
        .filter((t) => t.categoryId === cat.id)
        .sort((x, y) => x.id.localeCompare(y.id))
      schedule.push(...group)
    }
  } else {
    const contrast = computeCategoryContrastMatrix(categories, templates)
    const contrastLookup = new Map<string, number>()
    for (const cell of contrast) {
      contrastLookup.set(`${cell.categoryA}|${cell.categoryB}`, cell.contrastUtility)
      contrastLookup.set(`${cell.categoryB}|${cell.categoryA}`, cell.contrastUtility)
    }

    const pool = [...templates].sort((x, y) => x.id.localeCompare(y.id))
    schedule = []
    const lastSeenAt = new Map<string, number>()

    while (pool.length > 0) {
      let bestIndex = 0
      let bestScore = -Infinity

      for (let i = 0; i < pool.length; i++) {
        const candidate = pool[i]!
        const prevCat = schedule.length > 0 ? schedule[schedule.length - 1]!.categoryId : null

        const contrastScore =
          prevCat === null ? 0.5 : (contrastLookup.get(`${prevCat}|${candidate.categoryId}`) ?? 0)

        const lastSeen = lastSeenAt.get(candidate.categoryId)
        const lag = lastSeen === undefined ? schedule.length + 1 : schedule.length - lastSeen
        const spacingScore =
          schedule.length === 0 ? 1 : Math.min(1, lag / Math.max(1, schedule.length))

        const score =
          contrastWeight * contrastScore +
          spacingWeight * spacingScore +
          candidate.difficulty * 0.05 // stable difficulty tie-break

        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }

      const [picked] = pool.splice(bestIndex, 1)
      lastSeenAt.set(picked.categoryId, schedule.length)
      schedule.push(picked)
    }
  }

  return { schedule, metrics: computeSequenceMetrics(schedule, categories, templates) }
}

/**
 * Computes sequence telemetry: category entropy and blocking factor follow the
 * existing interleaving scheduler's definitions; `meanAdjacentContrast` averages
 * the pairwise contrast utility across adjacent transitions; `meanCategoryLag`
 * averages the positional gap between repeats of a category.
 */
export function computeSequenceMetrics(
  schedule: ProblemTemplate[],
  categories: ProblemCategory[],
  templates: ProblemTemplate[],
): SequenceMetrics {
  const categorySeq = schedule.map((t) => t.categoryId)
  const entropy = calculateEntropy(categorySeq)

  let repeats = 0
  let transitions = 0
  for (let i = 1; i < categorySeq.length; i++) {
    if (categorySeq[i] === categorySeq[i - 1]) repeats++
    else transitions++
  }
  const blockingFactor = categorySeq.length > 1 ? repeats / (categorySeq.length - 1) : 0

  const contrast = computeCategoryContrastMatrix(categories, templates)
  const contrastLookup = new Map<string, number>()
  for (const cell of contrast) {
    contrastLookup.set(`${cell.categoryA}|${cell.categoryB}`, cell.contrastUtility)
    contrastLookup.set(`${cell.categoryB}|${cell.categoryA}`, cell.contrastUtility)
  }

  let contrastSum = 0
  for (let i = 1; i < categorySeq.length; i++) {
    contrastSum += contrastLookup.get(`${categorySeq[i - 1]}|${categorySeq[i]}`) ?? 0
  }
  const meanAdjacentContrast = categorySeq.length > 1 ? contrastSum / (categorySeq.length - 1) : 0

  const lastSeen = new Map<string, number>()
  const lags: number[] = []
  categorySeq.forEach((cat, idx) => {
    const prev = lastSeen.get(cat)
    if (prev !== undefined) lags.push(idx - prev)
    lastSeen.set(cat, idx)
  })
  const meanCategoryLag = lags.length > 0 ? lags.reduce((s, l) => s + l, 0) / lags.length : 0

  return {
    categoryEntropy: round4(entropy),
    blockingFactor: round4(blockingFactor),
    transitionCount: transitions,
    meanAdjacentContrast: round4(meanAdjacentContrast),
    meanCategoryLag: round4(meanCategoryLag),
  }
}

/** Shannon entropy of category occurrences normalized by log2(distinctCount). */
function calculateEntropy(categories: string[]): number {
  if (categories.length <= 1) return 0
  const counts = new Map<string, number>()
  for (const cat of categories) counts.set(cat, (counts.get(cat) ?? 0) + 1)
  if (counts.size <= 1) return 0

  let entropy = 0
  const n = categories.length
  for (const count of counts.values()) {
    const p = count / n
    entropy -= p * Math.log2(p)
  }
  const maxEntropy = Math.log2(counts.size)
  return maxEntropy > 0 ? Math.min(1, Math.max(0, entropy / maxEntropy)) : 0
}

// ---------------------------------------------------------------------------
// 4. Discrimination session, confusion matrix & surface-bias telemetry
// ---------------------------------------------------------------------------

export interface StructuralInvarianceSessionState {
  categories: ProblemCategory[]
  templates: ProblemTemplate[]
  schedule: ProblemTemplate[]
  cursor: number
  attempts: DiscriminationAttempt[]
  /** Practice-phase accuracy under the current schedule (the "worse is better" signal). */
  practiceAccuracy: number
}

/**
 * Stateful drill session: walks a contrast-scheduled sequence, records
 * category-identification attempts, and derives confusion-matrix telemetry.
 * Pure state container — the UI owns rendering and side effects.
 */
export class StructuralInvarianceSession {
  private state: StructuralInvarianceSessionState

  constructor(
    categories: ProblemCategory[],
    templates: ProblemTemplate[],
    options: Partial<InterleavingOptions> & { mode?: 'interleaved' | 'blocked' } = {},
  ) {
    const { schedule } = generateContrastSchedule(templates, categories, options)
    this.state = {
      categories,
      templates,
      schedule,
      cursor: 0,
      attempts: [],
      practiceAccuracy: 0,
    }
  }

  public getState(): Readonly<StructuralInvarianceSessionState> {
    return { ...this.state, schedule: [...this.state.schedule], attempts: [...this.state.attempts] }
  }

  public getCurrentProblem(): ProblemTemplate | null {
    return this.state.schedule[this.state.cursor] ?? null
  }

  public isComplete(): boolean {
    return this.state.cursor >= this.state.schedule.length
  }

  /** Records an attempt and advances the cursor; returns whether it was correct. */
  public answer(chosenCategoryId: string, reactionMs?: number): boolean {
    const problem = this.getCurrentProblem()
    if (!problem) return false

    const correct = chosenCategoryId === problem.categoryId
    this.state.attempts.push({
      problemId: problem.id,
      trueCategoryId: problem.categoryId,
      chosenCategoryId,
      ...(reactionMs !== undefined ? { reactionMs } : {}),
    })
    this.state.cursor++
    this.state.practiceAccuracy =
      this.state.attempts.length > 0
        ? this.state.attempts.filter((a) => a.chosenCategoryId === a.trueCategoryId).length /
          this.state.attempts.length
        : 0
    return correct
  }

  /** Restarts with a freshly generated schedule (new interleave permutation). */
  public restart(
    options: Partial<InterleavingOptions> & { mode?: 'interleaved' | 'blocked' } = {},
  ): void {
    const { schedule } = generateContrastSchedule(
      this.state.templates,
      this.state.categories,
      options,
    )
    this.state.schedule = schedule
    this.state.cursor = 0
    this.state.attempts = []
    this.state.practiceAccuracy = 0
  }
}

/**
 * Derives discrimination telemetry from raw attempts: confusion matrix,
 * per-category recall, top confusion pairs, mean reaction time and the
 * surface-bias score. Surface bias is computed by checking, for each error,
 * whether the problem's surface features sit closer (lower mean Jaccard
 * distance) to the *chosen* category's members than to its own category's
 * members — i.e. the surface story, not the structure, drove the wrong pick.
 * On a perfectly counter-balanced curriculum (each story family appearing once
 * per category) both distances tie, so only genuine surface clustering in the
 * wrong direction raises the score above 0.
 */
export function computeDiscriminationTelemetry(
  attempts: DiscriminationAttempt[],
  categories: ProblemCategory[],
  templates: ProblemTemplate[],
): DiscriminationTelemetry {
  const total = attempts.length
  const correct = attempts.filter((a) => a.chosenCategoryId === a.trueCategoryId).length
  const accuracy = total > 0 ? correct / total : 0

  const matrixMap = new Map<string, ConfusionMatrixCell>()
  for (const attempt of attempts) {
    const key = `${attempt.trueCategoryId}->${attempt.chosenCategoryId}`
    const cell = matrixMap.get(key) ?? {
      trueCategoryId: attempt.trueCategoryId,
      chosenCategoryId: attempt.chosenCategoryId,
      count: 0,
    }
    cell.count++
    matrixMap.set(key, cell)
  }
  const matrix = [...matrixMap.values()].sort(
    (a, b) =>
      a.trueCategoryId.localeCompare(b.trueCategoryId) ||
      a.chosenCategoryId.localeCompare(b.chosenCategoryId),
  )

  const perCategoryRecall = categories.map((cat) => {
    const rows = attempts.filter((a) => a.trueCategoryId === cat.id)
    const hits = rows.filter((a) => a.chosenCategoryId === cat.id).length
    return {
      categoryId: cat.id,
      correct: hits,
      total: rows.length,
      recall: rows.length > 0 ? round4(hits / rows.length) : 0,
    }
  })

  const topConfusions = matrix
    .filter((c) => c.trueCategoryId !== c.chosenCategoryId)
    .sort((a, b) => b.count - a.count)

  // Surface-bias analysis over errors: strictly closer to the wrong category.
  const errors = attempts.filter((a) => a.chosenCategoryId !== a.trueCategoryId)
  let surfaceLured = 0
  for (const err of errors) {
    const problem = templates.find((t) => t.id === err.problemId)
    if (!problem) continue

    const chosenMembers = templates.filter((t) => t.categoryId === err.chosenCategoryId)
    const trueMembers = templates.filter((t) => t.categoryId === err.trueCategoryId)
    if (chosenMembers.length === 0 || trueMembers.length === 0) continue

    const meanDist = (members: ProblemTemplate[]): number =>
      members.reduce(
        (s, m) => s + featureVectorDistance(problem.surfaceFeatures, m.surfaceFeatures),
        0,
      ) / members.length

    if (meanDist(chosenMembers) < meanDist(trueMembers)) surfaceLured++
  }
  const surfaceBiasScore = errors.length > 0 ? surfaceLured / errors.length : 0

  const withReaction = attempts.filter((a) => typeof a.reactionMs === 'number')
  const meanReactionMs =
    withReaction.length > 0
      ? Math.round(withReaction.reduce((s, a) => s + (a.reactionMs ?? 0), 0) / withReaction.length)
      : null

  return {
    totalAttempts: total,
    accuracy: round4(accuracy),
    matrix,
    perCategoryRecall,
    topConfusions,
    surfaceBiasScore: round4(surfaceBiasScore),
    meanReactionMs,
  }
}

// ---------------------------------------------------------------------------
// 5. FSRS deck exporter
// ---------------------------------------------------------------------------

/**
 * Exports one identification card per problem template: the front asks the
 * learner to name the deep structural invariant from the surface story (the
 * exact skill interleaved practice trains), the back states the invariant, the
 * principle, and a discrimination hint against the most confusable category.
 * Suggested stability scales with the category's max contrast utility —
 * well-contrasted pairs produce more durable schema induction.
 */
export function exportFSRSInterleavingDeck(
  templates: ProblemTemplate[],
  categories: ProblemCategory[],
  surfaceBiasScore = 0,
): FSRSInterleavingCard[] {
  const contrast = computeCategoryContrastMatrix(categories, templates)
  const maxContrastByCategory = new Map<string, number>()
  for (const cell of contrast) {
    maxContrastByCategory.set(
      cell.categoryA,
      Math.max(maxContrastByCategory.get(cell.categoryA) ?? 0, cell.contrastUtility),
    )
    maxContrastByCategory.set(
      cell.categoryB,
      Math.max(maxContrastByCategory.get(cell.categoryB) ?? 0, cell.contrastUtility),
    )
  }

  return templates.map((t) => {
    const cat = categories.find((c) => c.id === t.categoryId)
    const maxContrast = maxContrastByCategory.get(t.categoryId) ?? 0.5
    const stability = Number((2.4 + 2.2 * maxContrast).toFixed(1))

    return {
      id: `card_inv_${t.id}`,
      front: `[Structural Invariance: identify the deep principle]\n\n${t.prompt}\n\n*Which solution invariant governs this situation — regardless of its surface story?*`,
      back: `**Deep structure:** ${cat?.label ?? t.categoryId}\n\n**Invariant:** ${cat?.deepPrinciple ?? ''}\n\n**Discrimination hint:** ${cat?.discriminationHint ?? ''}${
        t.surfaceLure ? `\n\n**Surface lure:** ${t.surfaceLure}` : ''
      }`,
      tags: ['interleaving', 'structural-invariance', t.categoryId],
      suggestedInitialStability: stability,
      suggestedInitialDifficulty: Number((5.1 + 1.6 * surfaceBiasScore).toFixed(1)),
      metadata: {
        categoryId: t.categoryId,
        contrastUtility: maxContrast,
        surfaceBiasScore: round4(surfaceBiasScore),
        domain: 'structural_invariance',
      },
    }
  })
}

// ---------------------------------------------------------------------------
// 6. Calibrated seed curriculum
// ---------------------------------------------------------------------------

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// at the top of this file so import paths are unchanged.

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const invarianceAttemptSchema = z.object({
  problemId: z.string(),
  trueCategoryId: z.string(),
  chosenCategoryId: z.string(),
  reactionMs: z.number().nonnegative().optional(),
})
export type InvarianceAttempt = z.infer<typeof invarianceAttemptSchema>

export const invariancePlanQuerySchema = z.object({
  mode: z.enum(['interleaved', 'blocked']).default('interleaved'),
  attemptsJson: z.string().optional(),
})
export type InvariancePlanQuery = z.infer<typeof invariancePlanQuerySchema>
