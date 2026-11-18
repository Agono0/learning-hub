/**
 * Cognitive science CLI commands:
 * 1. generation: Slamecka & Graf (1978) Generation Effect ladder & evaluation.
 * 2. feynman: Rozenblit & Keil (2002) IOED & Feynman teach-back diagnostic.
 * 3. metacognition: Koriat & Bjork (2005) Calibration & Glenn Brier score.
 * 4. invariance: Rohrer & Taylor (2007) interleaved structural invariance planning.
 */
import {
  auditDesirableDifficulty,
  buildPretestQuestion,
  CALIBRATED_ANALOGICAL_SUITES,
  CALIBRATED_FLEXIBILITY_SUITES,
  CALIBRATED_INTERACTIVITY_SUITES,
  CALIBRATED_EQUILIBRIUM_SUITES,
  evaluateReflectiveEquilibrium,
  analyzeElementInteractivity,
  calculateInstructionalEfficiency,
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeSequenceMetrics,
  exportFSRSInterleavingDeck,
  generateContrastSchedule,
  createGenerationLadder,
  evaluateFeynmanExplanation,
  pretestRelatedness,
  evaluateGenerationTrial,
  evaluateHypercorrection,
  evaluateMetacognitiveProfile,
  generationTierEnum,
  prioritizeRelearningQueue,
  type CorrectionTrial,
  type GenerationTier,
  type JudgmentOfLearning,
  type RelearnCandidate,
} from '@learning-hub/core'
import { cards, db, deriveMeasuredBehavior, revlog } from '@learning-hub/db'
import { asc, desc, eq } from 'drizzle-orm'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

export function generationCommand(args: string[]): void {
  const sub = args[0] || 'challenge'

  if (sub === 'challenge') {
    const concept = parseFlag(args, '--concept') || 'Active Recall'
    const text =
      parseFlag(args, '--text') ||
      'Retrieval practice produces durable memory consolidation and synaptic potentiation'
    const rawTier = parseFlag(args, '--tier') || 'stem_completion'
    const tierParsed = generationTierEnum.safeParse(rawTier)
    const tier: GenerationTier = tierParsed.success ? tierParsed.data : 'stem_completion'

    const ladder = createGenerationLadder(concept, text, tier)

    console.log(`\n🧠 Slamecka-Graf Generation Effect Ladder (Tier ${ladder.tierLevel}/4)`)
    console.log(`Concept:               ${ladder.concept}`)
    console.log(
      `Difficulty Tier:       ${ladder.tier} (${ladder.generationMultiplier}x retention multiplier)`,
    )
    console.log(`Challenge:             ${ladder.challengeText}`)
    if (ladder.maskedTarget) {
      console.log(`Masked Target:         ${ladder.maskedTarget}`)
    }
    if (ladder.scrambledTokens && ladder.scrambledTokens.length > 0) {
      console.log(`Scrambled Tokens:      [${ladder.scrambledTokens.join(' | ')}]`)
    }
    console.log(`Hint:                  ${ladder.hint}`)
    return
  }

  if (sub === 'eval') {
    const concept = parseFlag(args, '--concept')
    const expected = parseFlag(args, '--expected')
    const attempt = parseFlag(args, '--attempt')
    const rawTier = parseFlag(args, '--tier') || 'stem_completion'

    if (!concept || !expected || !attempt) {
      console.error(
        'Usage: learning-hub generation eval --concept <name> --expected <text> --attempt <text> [--tier stem_completion|semantic_anagram|reverse_query|analogy_synthesis]',
      )
      return
    }

    const tierParsed = generationTierEnum.safeParse(rawTier)
    const tier: GenerationTier = tierParsed.success ? tierParsed.data : 'stem_completion'

    const result = evaluateGenerationTrial({
      concept,
      expectedAnswer: expected,
      userAttempt: attempt,
      tier,
      latencyMs: 3000,
    })

    console.log(`\n🎯 Generation Evaluation: ${concept}`)
    console.log(`Outcome:               ${result.isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`)
    console.log(`Similarity Score:      ${(result.similarityScore * 100).toFixed(1)}%`)
    console.log(`Retention Multiplier:  ${result.retentionMultiplier}x`)
    console.log(`Next Recommended Tier: ${result.recommendedNextTier}`)
    console.log(`Feedback:              ${result.feedback}`)
    return
  }

  console.error(`Unknown subcommand: ${sub}. Usage: learning-hub generation [challenge|eval]`)
}

export function feynmanCommand(args: string[]): void {
  const sub = args[0] || 'eval'

  if (sub === 'eval') {
    const concept = parseFlag(args, '--concept') || 'Spaced Repetition'
    const explanation =
      parseFlag(args, '--explanation') ||
      'Spaced repetition is a method where you review flashcards right before you forget them so synapses strengthen.'
    const confidence = Number(parseFlag(args, '--confidence') || '4')

    const report = evaluateFeynmanExplanation({
      concept,
      explanation,
      initialConfidence: Math.min(5, Math.max(1, confidence)),
    })

    console.log(`\n📚 Feynman Teach-Back & IOED Report: ${concept}`)
    console.log(`Summary Verdict:       ${report.summaryVerdict}`)
    console.log(`Explanatory Depth:     ${report.explanatoryDepthScore}/100`)
    console.log(`Reading Ease (Flesch): ${report.fleschReadingEase.toFixed(1)}/100`)
    console.log(`Grade Level (Kincaid): Grade ${report.fleschKincaidGradeLevel.toFixed(1)}`)
    console.log(`12-Year-Old Accessible:${report.isTwelveYearOldAccessible ? ' YES' : ' NO'}`)
    console.log(
      `Jargon Terms (${report.jargonTerms.length}):   ${report.jargonTerms.join(', ') || 'None'}`,
    )
    console.log(
      `Causal Mechanisms:     ${report.causalMarkerCount} markers (${report.causalDensity.toFixed(2)}/sentence)`,
    )
    console.log(
      `IOED Calibration Gap:  ${report.ioedGap > 0 ? `+${report.ioedGap} (overconfident)` : report.ioedGap}`,
    )

    if (report.socraticProbes.length > 0) {
      console.log(`\nSocratic Reflection Probes:`)
      for (const probe of report.socraticProbes) {
        console.log(`  [${probe.type}] ${probe.prompt}`)
      }
    }
    return
  }

  console.error(
    `Unknown subcommand: ${sub}. Usage: learning-hub feynman eval --concept <name> --explanation <text>`,
  )
}

export async function metacognitionCommand(args: string[]): Promise<void> {
  const sub = args[0] || 'stats'

  if (sub === 'stats') {
    const limit = Number(parseFlag(args, '--limit') || '50')
    const rows = await db
      .select({
        cardId: revlog.cardId,
        rating: revlog.rating,
        confidence: revlog.confidence,
        timeMs: revlog.timeMs,
      })
      .from(revlog)
      .orderBy(desc(revlog.id))
      .limit(limit)

    const trials: JudgmentOfLearning[] = rows.map((r) => ({
      cardId: r.cardId,
      confidence: r.confidence === 1 ? 0.9 : 0.35,
      outcome: r.rating >= 3 ? 1 : 0,
      latencyMs: r.timeMs,
    }))

    const report = evaluateMetacognitiveProfile(trials)

    console.log(`\n🔍 Metacognitive Calibration Profile (${trials.length} reviews evaluated)`)
    console.log(`Status:                ${report.status}`)
    console.log(
      `Brier Score:           ${report.brierScore} (0 = perfect calibration, 1 = max error)`,
    )
    console.log(
      `Confidence Bias:       ${report.bias > 0 ? `+${report.bias} (overconfident)` : report.bias}`,
    )
    console.log(`Empirical Accuracy:    ${(report.accuracy * 100).toFixed(1)}%`)
    console.log(`Average Confidence:    ${(report.averageConfidence * 100).toFixed(1)}%`)
    console.log(`Difficulty Adjustment: ${report.difficultyAdjustment}`)
    console.log(`Guidance:              ${report.guidance}`)
    return
  }

  if (sub === 'hypercorrection') {
    const limit = Number(parseFlag(args, '--limit') || '200')
    const rows = await db
      .select({
        cardId: revlog.cardId,
        rating: revlog.rating,
        confidence: revlog.confidence,
        stability: cards.stability,
        difficulty: cards.difficulty,
      })
      .from(revlog)
      .innerJoin(cards, eq(revlog.cardId, cards.id))
      .orderBy(desc(revlog.id))
      .limit(limit)

    // Same reconstruction as the web API / MCP tool: a miss arms its card,
    // the card's next success counts as the correction.
    const chronological = [...rows].reverse()
    const corrections: CorrectionTrial[] = []
    const armed = new Map<number, 0 | 1>()
    for (const r of chronological) {
      const correct = r.rating >= 3
      const pending = armed.get(r.cardId)
      if (pending !== undefined && correct) {
        corrections.push({
          cardId: r.cardId,
          initialConfidence: pending === 1 ? 0.9 : 0.35,
          wasCorrected: true,
        })
        armed.delete(r.cardId)
      }
      if (!correct) armed.set(r.cardId, r.confidence)
    }

    const candidates: RelearnCandidate[] = [...armed.entries()].map(([cardId, confidence]) => {
      const card = rows.find((r) => r.cardId === cardId)
      return {
        cardId,
        errorConfidence: confidence === 1 ? 0.9 : 0.35,
        stability: card && card.stability > 0 ? card.stability : 1,
        difficulty: card && card.difficulty > 0 ? card.difficulty : 6,
        wasAlreadyCorrected: false,
      }
    })

    const crucible = evaluateHypercorrection(corrections)
    const queue = prioritizeRelearningQueue(candidates, corrections)

    console.log(`\n🧪 Hypercorrection Crucible (${corrections.length} correction trials)`)
    console.log(`Status:                ${crucible.status}`)
    console.log(
      `HC Index:              ${crucible.hypercorrectionIndex} (corrected rate of high-confidence errors − low-confidence errors)`,
    )
    console.log(`Overall Correction:    ${(crucible.overallCorrectionRate * 100).toFixed(1)}%`)
    console.log(`Mean Epistemic Shock:  ${crucible.meanShockMagnitude}`)
    console.log(`Vulnerable (conf ≥70% uncorrected): ${crucible.uncorrectedHighConfidenceErrors}`)
    console.log(`Guidance:              ${crucible.guidance}`)
    if (queue.length > 0) {
      console.log('\nRelearning priority queue (Butterfield-Metcalfe weighted):')
      for (const item of queue.slice(0, 10)) {
        console.log(
          `  #${item.cardId}  P${item.priority}  predicted fix ${Math.round(item.predictedCorrectionProbability * 100)}%  ${item.rationale}`,
        )
      }
    }
    return
  }

  console.error(
    `Unknown subcommand: ${sub}. Usage: learning-hub metacognition [stats|hypercorrection]`,
  )
}

/**
 * `difficulty audit` — Dunlosky et al. (2013) desirable-difficulty audit over
 * measured revlog telemetry plus optional self-reported technique minutes.
 *
 * Flags: --reread --highlight --summarize --mnemonic --imagery --testing
 *        --spaced --interleaved --explain --interrogate (minutes each)
 */
export async function difficultyCommand(args: string[]): Promise<void> {
  const sub = args[0] || 'audit'
  if (sub !== 'audit') {
    console.error(
      `Unknown subcommand: ${sub}. Usage: learning-hub difficulty audit [--testing 90] [--reread 120] …`,
    )
    return
  }

  const minutesByTechnique: Record<string, number> = {
    practice_testing: Number(parseFlag(args, '--testing') ?? '0'),
    distributed_practice: Number(parseFlag(args, '--spaced') ?? '0'),
    interleaved_practice: Number(parseFlag(args, '--interleaved') ?? '0'),
    self_explanation: Number(parseFlag(args, '--explain') ?? '0'),
    elaborative_interrogation: Number(parseFlag(args, '--interrogate') ?? '0'),
    rereading: Number(parseFlag(args, '--reread') ?? '0'),
    highlighting: Number(parseFlag(args, '--highlight') ?? '0'),
    summarization: Number(parseFlag(args, '--summarize') ?? '0'),
    keyword_mnemonic: Number(parseFlag(args, '--mnemonic') ?? '0'),
    imagery_for_text: Number(parseFlag(args, '--imagery') ?? '0'),
  }

  const measured = deriveMeasuredBehavior(0, 7)
  const report = auditDesirableDifficulty({ windowDays: 7, minutesByTechnique }, measured)

  console.log(`
📊 Desirable-Difficulty Audit (Dunlosky et al. 2013)`)
  console.log(
    `Composite Index:       ${report.compositeIndex} / 100 (dividend 60% + telemetry health 40%)`,
  )
  console.log(
    `Difficulty Dividend:   ${report.mix.totalMinutes > 0 ? report.mix.difficultyDividend : '—'} (self-reported ${report.mix.totalMinutes} min)`,
  )
  console.log(
    `Fluency-Illusion Risk: ${Math.round(report.risk.risk * 100)}% (${report.risk.label})`,
  )
  console.log(`Spacing (measured):    ${report.spacing.verdict} — ${report.spacing.guidance}`)
  console.log(
    `Interleaving (meas.):  ${report.interleaving.verdict} — ${report.interleaving.guidance}`,
  )
  console.log(`Next best action:      ${report.nextBestAction}`)
  if (report.substitutions.length > 0) {
    console.log('\nSubstitution plan:')
    for (const s of report.substitutions) {
      console.log(
        `  ${s.fromLabel} → ${s.toLabel}: move ${s.minutesToMove} min/week (+${s.dividendDelta} pts)`,
      )
      console.log(`    ${s.how}`)
    }
  }
  for (const d of report.risk.drivers) console.log(`  • ${d}`)
}

/**
 * `pretest questions` — builds pretest questions for the youngest, hardest
 * cards from REAL content and prints the guess-before-study protocol.
 */
export async function pretestCommand(args: string[]): Promise<void> {
  const sub = args[0] || 'questions'
  if (sub !== 'questions') {
    console.error(`Unknown subcommand: ${sub}. Usage: learning-hub pretest questions [--limit 8]`)
    return
  }
  const limit = Number(parseFlag(args, '--limit') || '8')
  const rows = await db
    .select({
      id: cards.id,
      content: cards.content,
      stability: cards.stability,
      difficulty: cards.difficulty,
    })
    .from(cards)
    .where(eq(cards.suspended, false))
    .orderBy(asc(cards.stability))
    .limit(120)

  const frontBack = (content: unknown): { front: string; back: string } | null => {
    if (!content || typeof content !== 'object') return null
    const c = content as Record<string, unknown>
    if (c.basic && typeof c.basic === 'object') {
      const b = c.basic as Record<string, unknown>
      if (typeof b.front === 'string' && typeof b.back === 'string')
        return { front: b.front, back: b.back }
    }
    if (typeof c.front === 'string' && typeof c.back === 'string')
      return { front: c.front, back: c.back }
    return null
  }

  const usable = rows
    .filter((r) => r.stability < 3 && frontBack(r.content) !== null)
    .map((r) => ({ cardId: r.id, stability: r.stability, difficulty: r.difficulty, row: r }))
    .sort(
      (a, b) =>
        (1 - b.stability / 3) * 0.6 +
        ((b.difficulty - 1) / 9) * 0.4 -
        ((1 - a.stability / 3) * 0.6 + ((a.difficulty - 1) / 9) * 0.4),
    )
    .slice(0, limit)

  if (usable.length === 0) {
    console.log('No young cards (stability < 3d) available for pretesting.')
    return
  }

  console.log(`
🎲 Pretest questions — guess BEFORE studying (Kornell, Hays & Bjork 2009):`)
  for (const c of usable) {
    const fb = frontBack(c.row.content)!
    const built = buildPretestQuestion(fb.front, fb.back)
    const relatedness = pretestRelatedness(built.question, fb.back)
    console.log(`
  card #${c.cardId} [${built.kind}] relatedness ${relatedness}${relatedness >= 0.5 ? ' ✓ solid' : ' ⚠ arbitrary'}`)
    console.log(`  Q: ${built.question}`)
    console.log(`  A: ${fb.back}`)
  }
  console.log(
    '\nProtocol: guess → feedback → study NOW → retest to criterion (Rawson & Dunlosky 2011).',
  )
}

/**
 * `invariance` — prints an interleaved structural invariance practice plan from the
 * calibrated counter-balanced curriculum: shuffled (or blocked comparator) schedule,
 * sequence metrics, pairwise contrast matrix, and the FSRS identify-the-invariant deck.
 */
export function invarianceCommand(args: string[]): void {
  const modeRaw = parseFlag(args, '--mode') || 'interleaved'
  const mode = modeRaw === 'blocked' ? 'blocked' : 'interleaved'
  const contrastRaw = parseFlag(args, '--contrast')
  const spacingRaw = parseFlag(args, '--spacing')

  const options: {
    mode: 'interleaved' | 'blocked'
    contrastWeight?: number
    spacingWeight?: number
  } = {
    mode,
    ...(contrastRaw !== undefined ? { contrastWeight: Number(contrastRaw) } : {}),
    ...(spacingRaw !== undefined ? { spacingWeight: Number(spacingRaw) } : {}),
  }

  const { schedule, metrics } = generateContrastSchedule(
    CALIBRATED_INVARIANCE_PROBLEMS,
    CALIBRATED_INVARIANCE_CATEGORIES,
    options,
  )

  console.log(`\n🔀 Structural Invariance Practice Plan (${mode})`)
  console.log('Rohrer & Taylor (2007): shuffled practice roughly doubles delayed test scores')
  console.log('over blocked drills by forcing category discrimination on every item.\n')

  schedule.forEach((p, i) => {
    const cat = CALIBRATED_INVARIANCE_CATEGORIES.find((c) => c.id === p.categoryId)
    console.log(`${String(i + 1).padStart(2, '0')}. [${cat?.label ?? p.categoryId}] ${p.title}`)
    console.log(`    ${p.prompt}`)
  })

  console.log('\nSequence metrics:')
  console.log(`  Category entropy:     ${metrics.categoryEntropy.toFixed(3)}`)
  console.log(`  Blocking factor:      ${metrics.blockingFactor.toFixed(3)} (0 = fully shuffled)`)
  console.log(`  Category transitions: ${metrics.transitionCount}`)
  console.log(`  Mean adjacent contrast: ${metrics.meanAdjacentContrast.toFixed(3)}`)
  console.log(`  Mean category lag:    ${metrics.meanCategoryLag.toFixed(2)}`)

  const interleaved = computeSequenceMetrics(
    generateContrastSchedule(CALIBRATED_INVARIANCE_PROBLEMS, CALIBRATED_INVARIANCE_CATEGORIES, {
      mode: 'interleaved',
    }).schedule,
    CALIBRATED_INVARIANCE_CATEGORIES,
    CALIBRATED_INVARIANCE_PROBLEMS,
  )
  const blocked = computeSequenceMetrics(
    generateContrastSchedule(CALIBRATED_INVARIANCE_PROBLEMS, CALIBRATED_INVARIANCE_CATEGORIES, {
      mode: 'blocked',
    }).schedule,
    CALIBRATED_INVARIANCE_CATEGORIES,
    CALIBRATED_INVARIANCE_PROBLEMS,
  )
  console.log('\nComparator (Kornell & Bjork 2008 — hard-feeling practice is what transfers):')
  console.log(
    `  shuffled contrast exposure: ${(interleaved.meanAdjacentContrast * interleaved.transitionCount).toFixed(2)}`,
  )
  console.log(
    `  blocked contrast exposure:  ${(blocked.meanAdjacentContrast * blocked.transitionCount).toFixed(2)}`,
  )

  const matrix = computeCategoryContrastMatrix(
    CALIBRATED_INVARIANCE_CATEGORIES,
    CALIBRATED_INVARIANCE_PROBLEMS,
  )
  console.log('\nCategory contrast matrix (surface distance | structural distance | utility):')
  for (const cell of matrix) {
    const a = CALIBRATED_INVARIANCE_CATEGORIES.find((c) => c.id === cell.categoryA)?.label
    const b = CALIBRATED_INVARIANCE_CATEGORIES.find((c) => c.id === cell.categoryB)?.label
    console.log(
      `  ${a} vs ${b}: ${cell.surfaceDistance.toFixed(2)} | ${cell.structuralDistance.toFixed(2)} | ${cell.contrastUtility.toFixed(2)}`,
    )
  }

  const deck = exportFSRSInterleavingDeck(
    CALIBRATED_INVARIANCE_PROBLEMS,
    CALIBRATED_INVARIANCE_CATEGORIES,
  )
  console.log(`\nFSRS deck: ${deck.length} identify-the-invariant cards available.`)
}

/**
 * `analogy plan` — prints the Gick & Holyoak analogical-transfer suite
 * (target problem, base analogs, convergence schema) so a learner can run
 * the structure-mapping protocol from the terminal; `--suite` picks among
 * the three calibrated suites.
 */
export function analogyCommand(args: string[]): void {
  const sub = args[0] || 'plan'
  if (sub !== 'plan') {
    console.error(`Unknown subcommand: ${sub}. Usage: learning-hub analogy plan [--suite <key>]`)
    return
  }
  const suiteKey = parseFlag(args, '--suite')
  const keys = suiteKey ? [suiteKey] : Object.keys(CALIBRATED_ANALOGICAL_SUITES)
  for (const key of keys) {
    const suite = CALIBRATED_ANALOGICAL_SUITES[key]
    if (!suite) {
      console.error(
        `Unknown suite "${key}". Available: ${Object.keys(CALIBRATED_ANALOGICAL_SUITES).join(', ')}`,
      )
      continue
    }
    console.log(`
🗺️  Analogical Transfer Suite: ${suite.title}`)
    console.log(
      `   Target problem: ${suite.targetProblem.scenarioTitle} (${suite.targetProblem.domainName})`,
    )
    console.log(`   Narrative: ${suite.targetProblem.narrativeDescription.slice(0, 140)}…`)
    for (const base of suite.baseAnalogs) {
      console.log(`   Base analog: ${base.scenarioTitle} (${base.domainName})`)
    }
    console.log('   Map the base-analog relations onto the target — surface features differ,')
    console.log('   the convergence schema must not (Gentner 1983 systematicity).')
  }
}

/**
 * `flexibility plan` — prints a Spiro (1988) criss-crossing schedule over a
 * calibrated ill-structured case: which Six-Thinking-Hats x lens crossings
 * to visit, plus the reductive traps to watch for.
 */
export function flexibilityCommand(args: string[]): void {
  const sub = args[0] || 'plan'
  if (sub !== 'plan') {
    console.error(
      `Unknown subcommand: ${sub}. Usage: learning-hub flexibility plan [--suite <key>]`,
    )
    return
  }
  const suiteKey = parseFlag(args, '--suite') || 'distributed_chaos_cascade'
  const suite = CALIBRATED_FLEXIBILITY_SUITES[suiteKey]
  if (!suite) {
    console.error(
      `Unknown suite "${suiteKey}". Available: ${Object.keys(CALIBRATED_FLEXIBILITY_SUITES).join(', ')}`,
    )
    return
  }
  const hats = ['white_hat', 'red_hat', 'black_hat', 'yellow_hat', 'green_hat', 'blue_hat']
  console.log(`
🧩 Cognitive Flexibility Criss-Cross: ${suite.name} (${suite.domainFamily})`)
  console.log(`   Case: ${suite.primaryCase.title}`)
  console.log(`   Dilemma: ${suite.primaryCase.coreDilemma}`)
  console.log(`
   Thematic nodes (${suite.primaryCase.thematicNodes.length}):`)
  for (const node of suite.primaryCase.thematicNodes) {
    console.log(`     - ${node.theme}`)
  }
  console.log(`
   Criss-cross schedule (visit each hat x lens crossing):`)
  let step = 1
  for (const hat of hats.slice(0, 4)) {
    for (const lens of [
      'mechanistic_technical',
      'socio_economic',
      'ecological_systemic',
      'teleological_ethical',
    ]) {
      console.log(
        `     ${String(step).padStart(2, '0')}. [${hat.replace('_hat', '')} hat / ${lens.replace(/_/g, ' ')}]`,
      )
      step++
    }
  }
  console.log(`
   Reductive traps to avoid (${suite.primaryCase.reductiveTraps.length}):`)
  for (const trap of suite.primaryCase.reductiveTraps) {
    console.log(`     - [${trap.type}] ${trap.superficialModel}`)
  }
  console.log('\nSpiro et al. (1988): revisit the same case under different lenses —')
  console.log('ill-structured domains resist single-schema mastery.')
}

/**
 * `interactivity` — Sweller (1988) element-interactivity analysis + Paas
 * instructional-efficiency scoring over a calibrated systemic-cascade suite.
 *
 * Flags: --suite <key> [--extraneous 0..3] [--effort 1..9 --performance 0..100]
 */
export function interactivityCommand(args: string[]): void {
  const sub = args[0] || 'analyze'
  if (sub !== 'analyze') {
    console.error(
      `Unknown subcommand: ${sub}. Usage: learning-hub interactivity analyze [--suite <key>]`,
    )
    return
  }
  const suiteKey = parseFlag(args, '--suite') || 'raft_consensus_protocol'
  const suite = CALIBRATED_INTERACTIVITY_SUITES[suiteKey]
  if (!suite) {
    console.error(
      `Unknown suite "${suiteKey}". Available: ${Object.keys(CALIBRATED_INTERACTIVITY_SUITES).join(', ')}`,
    )
    return
  }
  const extraneous = Number(parseFlag(args, '--extraneous') || '1')
  const analysis = analyzeElementInteractivity(suite, extraneous)

  console.log(`
🧮 Element Interactivity Analysis: ${suite.title}`)
  console.log(
    `Elements:              ${analysis.totalElements} · interactions ${analysis.totalInteractions}`,
  )
  console.log(
    `Coupling density:      ${analysis.couplingDensity} · max transitive depth ${analysis.maxTransitiveDepth}`,
  )
  console.log(`Interactivity index:   ${analysis.interactivityIndex}/100`)
  console.log(
    `Novice load:           intrinsic ${analysis.estimatedNoviceLoad.intrinsicLoad}, extraneous ${analysis.estimatedNoviceLoad.extraneousLoad}, germane ${analysis.estimatedNoviceLoad.germaneLoad}`,
  )
  console.log(
    `Expert chunked load:   intrinsic ${analysis.estimatedExpertChunkedLoad.intrinsicLoad}, extraneous ${analysis.estimatedExpertChunkedLoad.extraneousLoad}, germane ${analysis.estimatedExpertChunkedLoad.germaneLoad}`,
  )

  const effort = parseFlag(args, '--effort')
  const perf = parseFlag(args, '--performance')
  if (effort && perf) {
    const paas = calculateInstructionalEfficiency(Number(effort), Number(perf))
    console.log(`
Paas efficiency:       ${paas.efficiency.toFixed(2)} (${paas.classification.replace(/_/g, ' ')})`)
  }
}

/**
 * `equilibrium evaluate` — Rawls wide reflective equilibrium + Tetlock
 * calibration over a calibrated philosophy-of-science suite. Prints the
 * coherence index, triad resolution state, Brier grade, and next steps.
 *
 * Flags: --suite <key> [--resolve <triadId:strategy> ...] [--predict '<json>']
 * The resolve flag pairs a dissonant-triad id with a strategy
 * (revise_principle | override_judgment | reformulate_theory); the predict
 * flag takes an array of {propositionId, subjectiveConfidence, actualOutcome}
 * records for the Brier stream.
 */
export function equilibriumCommand(args: string[]): void {
  const sub = args[0] || 'evaluate'
  if (sub !== 'evaluate') {
    console.error(
      `Unknown subcommand: ${sub}. Usage: learning-hub equilibrium evaluate --suite <key>`,
    )
    return
  }
  const suiteKey = parseFlag(args, '--suite') || 'distributed_consensus_wre'
  const suite = CALIBRATED_EQUILIBRIUM_SUITES[suiteKey]
  if (!suite) {
    console.error(
      `Unknown suite "${suiteKey}". Available: ${Object.keys(CALIBRATED_EQUILIBRIUM_SUITES).join(', ')}`,
    )
    return
  }

  // Resolve triads from repeated --resolve triadId:strategy flags.
  const resolvedTriadStrategies: Record<
    string,
    'revise_principle' | 'override_judgment' | 'reformulate_theory'
  > = {}
  const resolveFlags = args.filter((a) => a.startsWith('--resolve='))
  for (const flag of resolveFlags) {
    const pair = flag.slice('--resolve='.length)
    const [triadId, strategy] = pair.split(':')
    const isStrategy = (
      v: string,
    ): v is 'revise_principle' | 'override_judgment' | 'reformulate_theory' =>
      v === 'revise_principle' || v === 'override_judgment' || v === 'reformulate_theory'
    if (triadId && isStrategy(strategy)) resolvedTriadStrategies[triadId] = strategy
  }

  // Optional prediction records from a --predict JSON array.
  const predictRaw = parseFlag(args, '--predict')
  let recordedPredictions: Array<{
    propositionId: string
    propositionText: string
    subjectiveConfidence: number
    actualOutcome: boolean
    domainContext: string
  }> = suite.predictionBank.map((p) => ({ ...p }))
  if (predictRaw) {
    try {
      const custom = JSON.parse(predictRaw) as typeof recordedPredictions
      if (Array.isArray(custom) && custom.length > 0) recordedPredictions = custom
    } catch {
      console.error('Could not parse --predict JSON; falling back to the suite prediction bank.')
    }
  }

  const sessionState = {
    suiteId: suite.id,
    activeAdjustments: {},
    resolvedTriadStrategies,
    recordedPredictions,
  }

  const evaluation = evaluateReflectiveEquilibrium(suite, sessionState)
  console.log(`
⚖️  Reflective Equilibrium: ${suite.name} (${suite.domain})`)
  console.log(`   ${suite.philosophicalContext.slice(0, 140)}…`)
  console.log(`
   Coherence index:        ${evaluation.coherenceIndex}/100`)
  console.log(`   Composite epistemic:    ${evaluation.compositeEpistemicScore}/100`)
  console.log(
    `   Triads resolved:        ${Object.keys(resolvedTriadStrategies).length}/${suite.dissonantTriads.length}`,
  )
  console.log(`   Unresolved contrad.:    ${evaluation.unresolvedContradictionCount}`)
  console.log(`   Equilibrium achieved:   ${evaluation.isEquilibriumAchieved ? 'YES' : 'not yet'}`)
  const brier = evaluation.brierMetrics
  console.log(
    `\n   Brier score:            ${brier.brierScore.toFixed(3)} (${brier.calibrationGrade})`,
  )
  console.log(`   Overconfidence gap:     ${brier.overconfidenceGap?.toFixed(3) ?? '—'}`)
  console.log(`\n   ${evaluation.feedbackSummary}`)
  if (evaluation.isEquilibriumAchieved) {
    console.log('\n   Rawls: the web is in wide reflective equilibrium — principles and')
    console.log('   judgments cohere without forced revision. Export cards from the studio.')
  } else {
    console.log('\n   Not yet at equilibrium: resolve the remaining dissonant triads by')
    console.log('   revising a principle, overriding the judgment, or reformulating the theory.')
  }
}
