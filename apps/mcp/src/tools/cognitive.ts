/**
 * Cognitive & Evidence-Based Learning Tools for MCP (Claude Desktop, Cursor, AGY):
 * 1. weakness_radar: Interference/confusion pairs (Underwood 1957) and leech decomposition.
 * 2. workload_balance: Forecast, fuzz-smoothed review scheduling, and backlog recovery.
 * 3. exposure_ledger: Krashen i+1 natural lexical exposure tracking and spaced SRS promotion.
 *
 * All card/revlog reads and due-date writes go through the shared repos
 * (repos/cards, repos/workload, repos/cognitive-trials) — the same queries the
 * CLI commands and web handlers run.
 */
import { z } from 'zod'
import {
  applyWorkloadShifts,
  deriveMeasuredBehavior,
  getRevlogTrialRows,
  getWordExposureSummaries,
  listCardsByStability,
  recentReviewEvents,
  recordExposureBatch,
  reconstructCorrectionTrials,
  workloadCards,
} from '@learning-hub/db'
import {
  auditDesirableDifficulty,
  auditInterleaving,
  auditSpacing,
  balanceWorkload,
  buildPretestQuestion,
  cardPreviewText,
  catchUpBacklog,
  createGenerationLadder,
  decomposeLeechCard,
  detectConfusionPairs,
  evaluateFeynmanExplanation,
  buildTonightPlan,
  evaluateGenerationTrial,
  evaluateHypercorrection,
  evaluateMetacognitiveCalibrationProfile,
  evaluateMetacognitiveProfile,
  judgmentOfLearningFromRevlogRows,
  toTrialMetacognitiveRecords,
  forecastWorkload,
  fragilityScore,
  prioritizeRelearningQueue,
  sleepProfileSchema,
  toConsolidationCandidates,
  generationTierEnum,
  pretestRelatedness,
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeDiscriminationTelemetry,
  computeSequenceMetrics,
  exportFSRSInterleavingDeck,
  generateContrastSchedule,
  CALIBRATED_ANALOGICAL_SUITES,
  CALIBRATED_FLEXIBILITY_SUITES,
  evaluateStructureMappingAttempt,
  evaluateCognitiveFlexibility,
  exportFlexibilityToFSRSCards,
  CALIBRATED_INTERACTIVITY_SUITES,
  CALIBRATED_EQUILIBRIUM_SUITES,
  evaluateReflectiveEquilibrium,
  exportEquilibriumToFSRSCards as exportEquilibriumCards,
  analyzeElementInteractivity,
  calculateInstructionalEfficiency,
} from '@learning-hub/core'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const cognitiveTools: RegisteredTool[] = [
  tool(
    'weakness_radar',
    'Detect semantic interference/confusion pairs (Underwood 1957) and generate 1-click atomic card decompositions for leeches.',
    {
      deckId: z.number().int().positive().optional(),
      minLapses: z.number().int().min(1).default(2),
    },
    async ({ deckId, minLapses }) => {
      // Shared repo projection (weakest-first); the previous inline select had
      // no ORDER BY, i.e. an arbitrary rowid sample.
      const cardRows = listCardsByStability({
        ...(deckId !== undefined ? { deckId } : {}),
        limit: 200,
      })
      const previews = new Map<number, string>()
      const mapped = cardRows.map((c) => {
        const content = (c.content ?? {}) as Record<string, unknown>
        const preview = cardPreviewText(c.type, c.content) ?? `Card #${c.id}`
        previews.set(c.id, preview)
        const unwrapped = (content[c.type] ?? content) as Record<string, unknown>
        const front = String(unwrapped.front ?? content.front ?? preview)
        const back = String(unwrapped.back ?? content.back ?? '')
        return {
          id: c.id,
          deckId: c.deckId,
          front,
          back,
          lapses: c.lapses ?? 0,
          stability: c.stability ?? 0,
          difficulty: c.difficulty ?? 0,
        }
      })

      // Shared repo read — undone (erased) reviews excluded.
      const revlogRows = recentReviewEvents({ limit: 1000 })

      const confusionPairs = detectConfusionPairs(revlogRows, previews)
      const leeches = mapped
        .filter((c) => c.lapses >= minLapses)
        .map((c) => ({
          ...c,
          decomposition: decomposeLeechCard({
            id: c.id,
            lapses: c.lapses,
            front: c.front,
            back: c.back,
          }),
        }))

      return json({
        ok: true,
        confusionPairsCount: confusionPairs.length,
        confusionPairs: confusionPairs.slice(0, 10),
        leechCount: leeches.length,
        leeches: leeches.slice(0, 5),
      })
    },
  ),

  tool(
    'workload_balance',
    'Forecast upcoming review workload over N days, smooth spikes using safe interval fuzz (+/-5%), or schedule overdue backlog recovery (lowest stability first).',
    {
      action: z.enum(['forecast', 'balance', 'catch_up']).default('forecast'),
      days: z.number().int().min(7).max(90).default(30),
      easyDays: z.array(z.number().int().min(0).max(6)).optional(),
      dailyCap: z.number().int().min(5).max(300).default(30),
      deckId: z.number().int().positive().optional(),
    },
    async ({ action, days, easyDays, dailyCap, deckId }) => {
      // Shared workload projection (repos/workload) — previously duplicated
      // inline here and in the CLI workload command.
      const cardItems = workloadCards(deckId !== undefined ? { deckId } : {})

      const now = new Date()

      if (action === 'forecast') {
        const forecast = forecastWorkload(cardItems, days, now)
        const overdueCount = cardItems.filter(
          (c) => c.due < now.toISOString() && c.state !== 0,
        ).length
        return json({
          ok: true,
          action: 'forecast',
          totalCards: cardItems.length,
          overdueCount,
          forecast,
        })
      }

      if (action === 'balance') {
        const { shifts, newForecast } = balanceWorkload(cardItems, {
          days,
          easyDays: easyDays ?? [],
          asOf: now,
        })
        applyWorkloadShifts(shifts)
        return json({
          ok: true,
          action: 'balance',
          shiftedCount: shifts.length,
          forecast: newForecast,
        })
      }

      if (action === 'catch_up') {
        const overdueCards = cardItems.filter((c) => c.due < now.toISOString() && c.state !== 0)
        const shifts = catchUpBacklog(overdueCards, dailyCap, now)
        applyWorkloadShifts(shifts)
        return json({ ok: true, action: 'catch_up', shiftedCount: shifts.length })
      }

      return json({ ok: false, error: 'unsupported action' })
    },
  ),

  tool(
    'exposure_ledger',
    'View naturally encountered vocabulary / technical terms across reading and notes, or record new token encounters for Krashen i+1 tracking.',
    {
      action: z.enum(['list', 'record']).default('list'),
      tokens: z.array(z.string().trim().min(1).max(100)).max(500).optional(),
      sourceType: z.enum(['reading', 'note', 'lesson']).default('reading'),
      limit: z.number().int().min(1).max(100).default(30),
    },
    async ({ action, tokens, sourceType, limit }) => {
      if (action === 'record') {
        if (!tokens || tokens.length === 0) return json({ ok: false, error: 'tokens required' })
        const count = recordExposureBatch(tokens, { sourceType })
        return json({ ok: true, recordedCount: count })
      }

      const summaries = getWordExposureSummaries(limit)
      const readyForPromotion = summaries.filter((s) => s.eligibleForPromotion && !s.isAlreadyCard)
      return json({
        ok: true,
        trackedCount: summaries.length,
        readyForSrsCount: readyForPromotion.length,
        words: summaries,
      })
    },
  ),

  tool(
    'generation_ladder',
    'Slamecka & Graf (1978) Generation Effect Engine: create a 4-tier generation challenge (stem completion, semantic anagram, reverse query, analogy synthesis) or evaluate a learner generation attempt.',
    {
      action: z.enum(['challenge', 'evaluate']).default('challenge'),
      concept: z.string().min(1),
      text: z.string().optional(),
      tier: generationTierEnum.optional(),
      expectedAnswer: z.string().optional(),
      userAttempt: z.string().optional(),
      latencyMs: z.number().min(0).default(3000),
    },
    async ({ action, concept, text, tier, expectedAnswer, userAttempt, latencyMs }) => {
      if (action === 'challenge') {
        const ladder = createGenerationLadder(concept, text ?? concept, tier ?? 'stem_completion')
        return json({
          ok: true,
          action: 'challenge',
          ladder,
        })
      }

      if (action === 'evaluate') {
        if (!expectedAnswer || !userAttempt) {
          return json({
            ok: false,
            error: 'expectedAnswer and userAttempt are required for evaluate',
          })
        }
        const evalResult = evaluateGenerationTrial({
          concept,
          tier: tier ?? 'stem_completion',
          expectedAnswer,
          userAttempt,
          latencyMs,
        })
        return json({
          ok: true,
          action: 'evaluate',
          evaluation: evalResult,
        })
      }

      return json({ ok: false, error: 'unsupported action' })
    },
  ),

  tool(
    'feynman_eval',
    'Rozenblit-Keil (2002) Illusion of Explanatory Depth (IOED) & Feynman Teach-Back Engine: evaluate an explanation for reading ease, jargon density, causal mechanisms, and generate Socratic reflection probes.',
    {
      concept: z.string().min(1),
      explanation: z.string().min(1),
      initialConfidence: z.number().min(1).max(5).default(4),
    },
    async ({ concept, explanation, initialConfidence }) => {
      const report = evaluateFeynmanExplanation({
        concept,
        explanation,
        initialConfidence,
      })
      return json({
        ok: true,
        report,
      })
    },
  ),

  tool(
    'metacognition_eval',
    'Koriat-Bjork (2005) Calibration & Glenn Brier (1950) Diagnostic Engine: evaluate subjective confidence versus empirical recall accuracy to detect fluency illusions and prescribe desirable difficulties.',
    {
      limit: z.number().int().min(5).max(500).default(100),
      deckId: z.number().int().positive().optional(),
    },
    async ({ limit, deckId }) => {
      // Shared repo query (undone reviews excluded — parity with the web
      // handler) + core's canonical row→JOL mapping.
      const rows = getRevlogTrialRows({ limit, deckId })
      const trials = judgmentOfLearningFromRevlogRows(rows)

      const report = evaluateMetacognitiveProfile(trials)
      return json({
        ok: true,
        trialsCount: trials.length,
        report,
      })
    },
  ),

  tool(
    'metacognition_hypercorrection',
    'Butterfield & Metcalfe (2001) Hypercorrection Crucible + Nelson-Narens monitoring/control telemetry: reconstruct error-correction trials from revlog history (confident miss → later retest success), compute the hypercorrection index, Goodman-Kruskal monitoring γ, and the FSRS relearning-priority queue for uncorrected high-confidence misses.',
    {
      limit: z.number().int().min(5).max(500).default(200),
    },
    async ({ limit }) => {
      // Shared repo query + canonical core reconstruction (packages/db
      // repos/cognitive-trials): undone reviews excluded, FSRS state joined —
      // identical trials to the web handler and headless server.
      const rows = getRevlogTrialRows({ limit })
      const { corrections, candidates } = reconstructCorrectionTrials(rows)

      const crucible = evaluateHypercorrection(corrections)
      const queue = prioritizeRelearningQueue(candidates, corrections)
      const profile = evaluateMetacognitiveCalibrationProfile(toTrialMetacognitiveRecords(rows))

      return json({
        ok: true,
        correctionsCount: corrections.length,
        crucible,
        relearningQueue: queue.slice(0, 12),
        goodmanKruskalGamma: profile.goodmanKruskalGamma,
        calibrationIndex: profile.metacognitiveCalibrationIndex,
        recommendations: profile.recommendations,
      })
    },
  ),
  tool(
    'sleep_consolidation_plan',
    "Rasch & Born (2007) / Ngo et al. (2013) Sleep TMR planner over REAL FSRS state: fits a cycle-accurate hypnogram for tonight's sleep window (Process-S sleep-debt rebound, chronotype redistribution), extracts delta-weighted slow-wave blocks, and schedules the learner's most fragile cards into them with per-card consolidation audits and an acoustic-safety audit.",
    {
      bedtime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .default('23:00'),
      wakeTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .default('07:00'),
      chronotype: z.number().min(-1).max(1).default(0),
      sleepDebtHours: z.number().min(0).max(12).default(0),
      maxAcousticDba: z.number().min(25).max(42).default(35),
      limit: z.number().int().min(1).max(30).default(12),
    },
    async ({ bedtime, wakeTime, chronotype, sleepDebtHours, maxAcousticDba, limit }) => {
      const profile = sleepProfileSchema.parse({
        bedtime,
        wakeTime,
        chronotype,
        sleepDebtHours,
        maxAcousticDba,
      })

      // Shared repo projection — identical candidate fetch to the CLI
      // `audio tmr-plan` command (repos/cards.listCardsByStability).
      const rows = listCardsByStability({ limit: 300 })

      const candidates = toConsolidationCandidates(
        rows
          .filter((r) => !r.suspended && r.state >= 2 && r.stability > 0)
          .map((r) => ({ id: r.id, stability: r.stability, difficulty: r.difficulty, due: r.due })),
      )
        .sort((a, b) => fragilityScore(b) - fragilityScore(a))
        .slice(limit)

      const plan = buildTonightPlan(profile, candidates)
      return json({
        ok: true,
        candidatesSelected: candidates.length,
        cueCount: plan.cues.length,
        meanPredictedBoostPct: plan.meanPredictedBoostPct,
        cycleCount: plan.hypnogram.cycleCount,
        swsShare: plan.hypnogram.swsShare,
        safety: plan.safety,
        advisory: plan.advisory,
        cues: plan.cues,
        unscheduledCardIds: plan.unscheduledCardIds,
      })
    },
  ),
  tool(
    'difficulty_audit',
    "Dunlosky et al. (2013) Desirable-Difficulty Audit: score the learner's technique mix against the monograph utility table (practice testing/spacing high; rereading/highlighting low), quantify fluency-illusion risk, audit measured spacing + deck interleaving from revlog, and emit an exact-arithmetic substitution plan.",
    {
      windowDays: z.number().int().min(1).max(28).default(7),
      minutesByTechnique: z
        .record(z.string(), z.number().min(0).max(10000))
        .describe(
          'Self-reported minutes per technique id (practice_testing, rereading, …); telemetry cannot see these',
        ),
      tzOffset: z.number().int().min(-720).max(840).default(0),
    },
    async ({ windowDays, minutesByTechnique, tzOffset }) => {
      const measured = deriveMeasuredBehavior(tzOffset, windowDays)
      const spacing = auditSpacing(measured, windowDays)
      const interleaving = auditInterleaving(measured)
      const report = auditDesirableDifficulty({ windowDays, minutesByTechnique }, measured)
      return json({
        ok: true,
        measured,
        spacingVerdict: spacing.verdict,
        interleavingVerdict: interleaving.verdict,
        report,
      })
    },
  ),

  tool(
    'pretesting_protocol',
    'Kornell, Hays & Bjork (2009) Pretesting-Effect protocol over REAL card content: builds deterministic pretest questions for the youngest, hardest cards, gates them with the Little & Bjork (2016) solid-pretest relatedness check, and evaluates guess→feedback→study→retest attempts for protocol compliance, hypercorrection targets and the successive-relearning queue.',
    {
      limit: z.number().int().min(1).max(20).default(8),
    },
    async ({ limit }) => {
      // Shared repo projection — identical candidate fetch to the CLI
      // `pretest questions` command (repos/cards.listCardsByStability).
      const rows = listCardsByStability({ limit: 120 })

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
        .map((r) => ({ cardId: r.id, stability: r.stability, difficulty: r.difficulty }))
        .sort((a, b) =>
          (1 - a.stability / 3) * 0.6 + ((a.difficulty - 1) / 9) * 0.4 >
          (1 - b.stability / 3) * 0.6 + ((b.difficulty - 1) / 9) * 0.4
            ? -1
            : 1,
        )
        .slice(0, limit)

      const questions = usable.flatMap((c) => {
        const row = rows.find((r) => r.id === c.cardId)
        const fb = row ? frontBack(row.content) : null
        if (!fb) return []
        const built = buildPretestQuestion(fb.front, fb.back)
        const relatedness = pretestRelatedness(built.question, fb.back)
        return [
          {
            cardId: c.cardId,
            question: built.question,
            kind: built.kind,
            relatedness,
            solidPretest: relatedness >= 0.5,
            target: fb.back,
          },
        ]
      })

      return json({
        ok: true,
        candidates: questions,
        protocol: 'pretest → feedback → study → retest (Kornell et al. 2009; Little & Bjork 2016)',
      })
    },
  ),

  tool(
    'structural_invariance_plan',
    'Rohrer & Taylor (2007) Interleaved Problem Solving & Structural Invariance engine: generate a shuffled mixed-category practice plan over the calibrated counter-balanced curriculum (3 surface story families x 4 deep invariants), with the blocked comparator metrics, pairwise category contrast matrix (Carvalho & Goldstone 2014), and an FSRS identify-the-invariant deck. Pass recorded attempts to score a confusion matrix and surface-bias telemetry.',
    {
      mode: z.enum(['interleaved', 'blocked']).default('interleaved'),
      contrastWeight: z.number().min(0).max(1).optional(),
      spacingWeight: z.number().min(0).max(1).optional(),
      attempts: z
        .array(
          z.object({
            problemId: z.string(),
            trueCategoryId: z.string(),
            chosenCategoryId: z.string(),
            reactionMs: z.number().optional(),
          }),
        )
        .max(1000)
        .optional(),
    },
    async ({ mode, contrastWeight, spacingWeight, attempts }) => {
      const options = {
        mode,
        ...(contrastWeight !== undefined ? { contrastWeight } : {}),
        ...(spacingWeight !== undefined ? { spacingWeight } : {}),
      }
      const { schedule, metrics } = generateContrastSchedule(
        CALIBRATED_INVARIANCE_PROBLEMS,
        CALIBRATED_INVARIANCE_CATEGORIES,
        options,
      )
      const categories = CALIBRATED_INVARIANCE_CATEGORIES
      const templates = CALIBRATED_INVARIANCE_PROBLEMS

      const telemetry =
        attempts && attempts.length > 0
          ? computeDiscriminationTelemetry(attempts, categories, templates)
          : null

      return json({
        ok: true,
        mode,
        schedule: schedule.map((p) => ({
          id: p.id,
          categoryId: p.categoryId,
          title: p.title,
          prompt: p.prompt,
        })),
        metrics,
        interleavedMetrics: computeSequenceMetrics(
          generateContrastSchedule(templates, categories, { mode: 'interleaved' }).schedule,
          categories,
          templates,
        ),
        blockedMetrics: computeSequenceMetrics(
          generateContrastSchedule(templates, categories, { mode: 'blocked' }).schedule,
          categories,
          templates,
        ),
        contrastMatrix: computeCategoryContrastMatrix(categories, templates),
        deck: exportFSRSInterleavingDeck(templates, categories),
        telemetry,
      })
    },
  ),

  tool(
    'analogical_transfer',
    "Gick & Holyoak (1980/1983) Analogical Transfer + Gentner (1983) Structure-Mapping engine over the calibrated multidisciplinary suites: evaluate a learner's base-analog selection, entity alignments, predicate-preservation mappings, and articulated convergence schema — scoring systematicity, surface-feature disparity, schema-induction maturity, and spontaneous-transfer probability.",
    {
      suiteKey: z
        .enum([
          'convergence_radiation_oncology',
          'hydraulic_electrical_conduction',
          'planetary_bohr_quantum_orbit',
        ])
        .optional()
        .describe('Omit to list the calibrated suites with their target problems'),
      attempt: z
        .object({
          suiteId: z.string(),
          selectedBaseAnalogId: z.string(),
          entityMappings: z.array(
            z.object({ baseEntityId: z.string(), targetEntityId: z.string() }),
          ),
          predicateMappings: z.array(
            z.object({ basePredicateId: z.string(), targetPredicateId: z.string() }),
          ),
          articulatedConvergenceSchema: z.string(),
          decoyRejectionRationale: z.string().optional(),
          confidenceScore: z.number().min(1).max(5),
          timeSpentMs: z.number().nonnegative(),
        })
        .optional()
        .describe('Omit to list suites; provide to evaluate one structure-mapping attempt'),
    },
    async ({ suiteKey, attempt }) => {
      if (!attempt) {
        const keys = suiteKey ? [suiteKey] : Object.keys(CALIBRATED_ANALOGICAL_SUITES)
        return json({
          ok: true,
          suites: keys.map((k) => {
            const suite = CALIBRATED_ANALOGICAL_SUITES[k]
            if (!suite) return { suiteId: k, error: 'unknown suite' }
            return {
              suiteId: suite.suiteId,
              title: suite.title,
              targetProblem: suite.targetProblem.scenarioTitle,
              baseAnalogs: suite.baseAnalogs.map((b) => ({ id: b.id, title: b.scenarioTitle })),
            }
          }),
        })
      }
      const suite = CALIBRATED_ANALOGICAL_SUITES[attempt.suiteId]
      if (!suite) {
        return json({ ok: false, error: `Unknown suite "${attempt.suiteId}"` })
      }
      const telemetry = evaluateStructureMappingAttempt(suite, attempt)
      return json({ ok: true, telemetry })
    },
  ),

  tool(
    'cognitive_flexibility',
    "Spiro et al. (1988) Cognitive Flexibility Theory + De Bono (1985) Six Thinking Hats criss-crossing engine over the calibrated ill-structured suites: evaluate a learner's hat dispersion (PDI entropy), criss-cross density, reductive-bias mastery, and lens diversity into the composite flexibility score — with rigidity warnings and an FSRS multi-perspective card export.",
    {
      suiteKey: z
        .enum(['distributed_chaos_cascade', 'epidemiological_antimicrobial'])
        .optional()
        .describe('Omit to list the calibrated suites'),
      attempts: z
        .array(
          z.object({
            caseId: z.string(),
            selectedHat: z.enum([
              'white_hat',
              'red_hat',
              'black_hat',
              'yellow_hat',
              'green_hat',
              'blue_hat',
            ]),
            activeLens: z.enum([
              'mechanistic_technical',
              'socio_economic',
              'ecological_systemic',
              'teleological_ethical',
            ]),
            studentObservations: z.string(),
            identifiedThematicNodeIds: z.array(z.string()),
            diagnosedReductiveTrapIds: z.array(z.string()),
          }),
        )
        .max(100)
        .optional()
        .describe('Criss-cross step attempts to evaluate'),
      exportCards: z.boolean().default(false),
    },
    async ({ suiteKey, attempts, exportCards }) => {
      if (!suiteKey || !attempts) {
        return json({
          ok: true,
          suites: Object.entries(CALIBRATED_FLEXIBILITY_SUITES).map(([key, suite]) => ({
            suiteId: key,
            name: suite.name,
            domainFamily: suite.domainFamily,
            caseTitle: suite.primaryCase.title,
            thematicNodes: suite.primaryCase.thematicNodes.length,
            reductiveTraps: suite.primaryCase.reductiveTraps.length,
          })),
        })
      }
      const suite = CALIBRATED_FLEXIBILITY_SUITES[suiteKey]
      if (!suite) {
        return json({ ok: false, error: `Unknown suite "${suiteKey}"` })
      }
      const evaluation = evaluateCognitiveFlexibility(suite, attempts)
      const cards = exportCards ? exportFlexibilityToFSRSCards(suite, evaluation) : undefined
      return json({ ok: true, evaluation, cards })
    },
  ),

  tool(
    'element_interactivity',
    "Sweller (1988) Element Interactivity + Paas & Van Merrienboer (1994) instructional-efficiency engine over the calibrated systemic-cascade suites: analyze a suite's coupling density, transitive depth, interactivity index, and estimated novice vs expert-chunked cognitive load breakdowns; plus Paas efficiency scoring from a self-reported mental-effort rating and performance score.",
    {
      suiteKey: z
        .enum(['raft_consensus_protocol', 'cardiovascular_hemodynamics'])
        .optional()
        .describe('Omit to list the calibrated suites'),
      extraneousLoadFactor: z
        .number()
        .min(0)
        .max(3)
        .default(1)
        .describe('0.0 = cleanest presentation, 3.0 = split-attention mess'),
      mentalEffort: z
        .number()
        .min(1)
        .max(9)
        .optional()
        .describe('Paas self-rated mental effort (1-9)'),
      performance: z.number().min(0).max(100).optional().describe('Performance score (0-100)'),
    },
    async ({ suiteKey, extraneousLoadFactor, mentalEffort, performance }) => {
      if (!suiteKey) {
        return json({
          ok: true,
          suites: Object.entries(CALIBRATED_INTERACTIVITY_SUITES).map(([key, suite]) => ({
            suiteId: key,
            title: suite.title ?? key,
            elements: suite.elements.length,
            interactions: suite.edges.length,
          })),
        })
      }
      const suite = CALIBRATED_INTERACTIVITY_SUITES[suiteKey]
      if (!suite) {
        return json({ ok: false, error: `Unknown suite "${suiteKey}"` })
      }
      const analysis = analyzeElementInteractivity(suite, extraneousLoadFactor)
      const paas =
        mentalEffort !== undefined && performance !== undefined
          ? calculateInstructionalEfficiency(mentalEffort, performance)
          : undefined
      return json({
        ok: true,
        analysis,
        paas: paas ?? null,
        paasClassification: paas?.classification ?? null,
      })
    },
  ),

  tool(
    'reflective_equilibrium',
    "Rawls (1971) Wide Reflective Equilibrium + Tetlock (2005) epistemic calibration over the calibrated philosophy-of-science suites: evaluate a session's coherence index, unresolved dissonant-triad count, Brier calibration metrics (Superforecaster → Dunning-Kruger grading), and composite epistemic score — with an FSRS conflict/calibration card export. Pass suiteKey alone to list suites and their prediction banks.",
    {
      suiteKey: z
        .enum([
          'distributed_consensus_wre',
          'algorithmic_fairness_wre',
          'medical_triage_ethics_wre',
        ])
        .optional()
        .describe('Omit to list the calibrated suites'),
      sessionState: z
        .object({
          suiteId: z.string(),
          activeAdjustments: z
            .record(
              z.string(),
              z.object({
                adjustedConfidence: z.number().min(0.5).max(1),
                revisedStatement: z.string().optional(),
              }),
            )
            .default({}),
          resolvedTriadStrategies: z
            .record(
              z.string(),
              z.enum(['revise_principle', 'override_judgment', 'reformulate_theory']),
            )
            .default({}),
          recordedPredictions: z
            .array(
              z.object({
                propositionId: z.string(),
                propositionText: z.string(),
                subjectiveConfidence: z.number().min(0.5).max(1),
                actualOutcome: z.boolean(),
                domainContext: z.string(),
              }),
            )
            .max(100)
            .default([]),
        })
        .optional()
        .describe('Session state to evaluate; omit to list suites'),
      exportCards: z.boolean().default(false),
    },
    async ({ suiteKey, sessionState, exportCards }) => {
      if (!suiteKey || !sessionState) {
        return json({
          ok: true,
          suites: Object.entries(CALIBRATED_EQUILIBRIUM_SUITES).map(([key, suite]) => ({
            suiteId: key,
            name: suite.name,
            domain: suite.domain,
            nodes: suite.nodes.length,
            edges: suite.edges.length,
            dissonantTriads: suite.dissonantTriads.length,
            predictionBank: suite.predictionBank.length,
          })),
        })
      }
      const suite = CALIBRATED_EQUILIBRIUM_SUITES[suiteKey]
      if (!suite) {
        return json({ ok: false, error: `Unknown suite "${suiteKey}"` })
      }
      const evaluation = evaluateReflectiveEquilibrium(suite, sessionState)
      const cards = exportCards ? exportEquilibriumCards(suite, evaluation) : undefined
      return json({ ok: true, evaluation, cards })
    },
  ),
]
