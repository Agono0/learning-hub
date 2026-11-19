/**
 * Advanced Learning Science & Cognitive Expansion MCP Tools
 *
 * Exposes core research-backed learning engines to external AI agents
 * (Claude Desktop, Cursor, Antigravity CLI, IDE sidecars):
 * 1. skills: Matt Pocock Agent Skills & Autonomous Engineering
 * 2. successive_relearning: Rawson & Dunlosky (2011, 2012) Ebbinghaus Savings
 * 3. srl: Zimmerman (2000) Self-Regulated Learning & Metacognitive Matrix
 * 4. epistemic: Shaffer (2016) Epistemic Network Analysis (ENA) & Quantitative Ethnography
 * 5. causal: Judea Pearl (2000, 2009) Structural Causal Models & Counterfactuals
 * 6. threshold: Jan Meyer & Ray Land (2003, 2005) Threshold Concepts & Liminal Navigation
 */

import { z } from 'zod'
import { json, tool, type RegisteredTool } from '../tool-kit'
import {
  CANONICAL_SKILLS,
  executeSkillSimulation,
  auditCodeAgainstAgentsRules,
  type SkillDefinition,
  calculateEbbinghausSavings,
  predictRetentionAtDays,
  calibrateFSRSStability,
  calibrateFSRSDifficulty,
  calculateSRLMaturityIndex,
  evaluateSRLMaturityTier,
  calculateGoalAttainmentScale,
  CALIBRATED_SRL_CHALLENGES,
  buildEpistemicDiscourseModel,
  bridgeEpistemicToCurriculum,
  createStandardEducationSCM,
  evaluateCounterfactual,
  checkDSeparation,
  evaluateBackdoorAdmissibility,
  getStandardThresholdConcepts,
  evaluateLiminalTrajectory,
  bridgeThresholdToCurriculum,
  ZpdEvaluationInputSchema,
  ZpdPromptInputSchema,
  calculateZpdMetrics,
  listZpdScenarios,
  getZpdScenarioById,
  getGraduatedPromptAtTier,
  generateFSRSZpdDeck,
  getCanonicalPFScenarios,
  getPFScenarioById,
  calculatePFMetrics,
  evaluateStudentRepresentation,
  generatePFFSRSCards,
  getCanonicalConcepTestSuites,
  getConcepTestSuiteById,
  calculatePIMetrics,
  generatePIFSRSCards,
  getCanonicalInquiryLabs,
  getInquiryLabById,
  runInquiryTrial,
  calculateInquiryMetrics,
  generateInquiryFSRSCards,
  CANONICAL_TEXT_PASSAGES,
  classifyICAPEngagement,
  evaluateReciprocalSession,
  generatePeerDialogicTurn,
  generateReciprocalFSRSDeck,
  type DialogueTurn,
  CANONICAL_SCIENTIFIC_DEBATES,
  evaluateCERArgument,
  generateAdversarialCounterArgument,
  generateCERFSRSDeck,
  type CERArgumentSubmission,
  CERArgumentSubmissionSchema,
  CANONICAL_MACROCONTEXT_CASES,
  evaluateAnchoredSolution,
  simulateAnchoredSensitivity,
  generateAnchoredFSRSDeck,
  type LearnerSolutionSubmission,
  LearnerSolutionSubmissionSchema,
  CANONICAL_CONTRASTING_SETS,
  evaluateContrastingAttempt,
  generateContrastingFSRSDeck,
  type InventedMetricSubmission,
  InventedMetricSubmissionSchema,
  CANONICAL_COLLABORATIVE_SCENARIOS,
  evaluateCollaborativeDiscourse,
  generateCollaborativePeerTurn,
  generateCollaborativeFSRSDeck,
  type DiscourseSubmission,
  DiscourseSubmissionSchema,
  CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  evaluateLearnerModel,
  generateSystemDynamicsFSRSDeck,
  runEulerSimulation,
  type LearnerModelHypothesis,
  listGedankenScenarios,
  perturbExtremeCase,
  simulateMentalAnimation,
  evaluateInquirySession,
  generateModelInquiryFsrsDeck,
  InquirySessionInputSchema,
  getCanonicalKnowledgeSpaces,
  initializeMarkovianSession,
  updateBeliefPosterior,
  diagnoseLearner,
  computeFringes,
  generateKSTCalibratedDeck,
  auditCurriculumStructure,
  AdaptiveAssessmentSessionSchema,
} from '@learning-hub/core'

export const advancedLearningTools: RegisteredTool[] = [
  // ── 1. Agent Skills (Matt Pocock framework) ──
  tool(
    'skills_list_catalog',
    'Lists all canonical agent skills with parameters, descriptions, and phases.',
    {
      category: z
        .string()
        .optional()
        .describe(
          'Optional filter by category (engineering, pedagogy, metacognition, review, architecture).',
        ),
    },
    async ({ category }) => {
      const skills = Object.values(CANONICAL_SKILLS)
      const filtered = category
        ? skills.filter(
            (s: SkillDefinition) => s.meta.category.toLowerCase() === category.toLowerCase(),
          )
        : skills
      return json({
        count: filtered.length,
        skills: filtered.map((s: SkillDefinition) => ({
          name: s.meta.name,
          title: s.meta.title,
          category: s.meta.category,
          description: s.meta.description,
          parameters: s.parameters,
          phases: s.phases.map((p) => ({ id: p.id, name: p.name, description: p.description })),
        })),
      })
    },
  ),

  tool(
    'skills_execute_autonomous',
    'Simulates execution of an autonomous skill drill or audits code against AGENTS.md rules.',
    {
      skillName: z
        .string()
        .describe(
          'Canonical skill name (e.g. "code-review", "grill-me", "to-spec", "deliberate-practice").',
        ),
      inputs: z.record(z.string(), z.string()).describe('Input parameters required by the skill.'),
      codeAuditFilepath: z
        .string()
        .optional()
        .describe('Optional filepath if running code review rule audits.'),
      codeSnippet: z
        .string()
        .optional()
        .describe('Optional code snippet to audit against architectural invariants.'),
    },
    async ({ skillName, inputs, codeAuditFilepath, codeSnippet }) => {
      const skill = CANONICAL_SKILLS[skillName] ?? Object.values(CANONICAL_SKILLS)[0]!

      let ruleViolations: unknown[] = []
      if (codeSnippet && codeAuditFilepath) {
        ruleViolations = auditCodeAgainstAgentsRules(codeSnippet, codeAuditFilepath)
      }

      const simulation = executeSkillSimulation(skill.meta.name, {
        topic: inputs.topic ?? 'Autonomous Drill',
        context: inputs.context ?? JSON.stringify(inputs),
      })

      return json({
        success: true,
        skill: skill.meta.name,
        clarityIndex: simulation.clarityIndex,
        rigorScore: simulation.rigorScore,
        rawOutput: simulation.rawOutput,
        ambiguitiesResolved: simulation.ambiguitiesResolved,
        assumptionsSurfaced: simulation.assumptionsSurfaced,
        ruleViolations,
      })
    },
  ),

  // ── 2. Successive Relearning (Rawson & Dunlosky 2011) ──
  tool(
    'successive_relearning_calculate',
    'Calculates Ebbinghaus savings score, decelerated forgetting decay, and FSRS stability calibration.',
    {
      initialLearningSeconds: z
        .number()
        .positive()
        .describe('Time spent in initial learning session (seconds).'),
      relearningSeconds: z
        .number()
        .positive()
        .describe('Time spent in current relearning trial (seconds).'),
      daysElapsed: z.number().positive().default(7).describe('Days elapsed since last session.'),
      initialTrialsCount: z
        .number()
        .int()
        .min(1)
        .default(3)
        .describe('Number of trials needed to hit initial criterion.'),
    },
    async ({ initialLearningSeconds, relearningSeconds, daysElapsed, initialTrialsCount }) => {
      const savings = calculateEbbinghausSavings(initialLearningSeconds, relearningSeconds)
      const predictedRetention = predictRetentionAtDays(0.1, daysElapsed)
      const fsrsStability = calibrateFSRSStability(0.08)
      const fsrsDifficulty = calibrateFSRSDifficulty(initialTrialsCount, 1)

      return json({
        savingsPercentage: savings,
        predictedRetentionPercentage: Math.round(predictedRetention * 100),
        calibratedFSRS: {
          stabilityDays: fsrsStability,
          difficultyScale: fsrsDifficulty,
        },
        recommendation:
          savings >= 50
            ? 'Robust Ebbinghaus memory savings achieved. Interval can be expanded by 2.5x.'
            : 'Sub-threshold memory savings. Additional successive retrieval trial recommended.',
      })
    },
  ),

  // ── 3. Self-Regulated Learning (Zimmerman 2000) ──
  tool(
    'srl_evaluate_cycle',
    'Evaluates Zimmerman’s 3-phase cyclical SRL mastery index and diagnoses metacognitive challenge scenarios.',
    {
      forethoughtScore: z
        .number()
        .min(0)
        .max(10)
        .describe('Goal setting and strategic planning score (0-10).'),
      performanceScore: z
        .number()
        .min(0)
        .max(10)
        .describe('Metacognitive monitoring fidelity during execution (0-10).'),
      reflectionScore: z
        .number()
        .min(0)
        .max(10)
        .describe('Controllable internal attribution score (0-10).'),
      challengeId: z
        .string()
        .optional()
        .describe(
          'Optional challenge scenario ID to diagnose (e.g. "attribution_collapse", "planning_paralysis").',
        ),
    },
    async ({ forethoughtScore, performanceScore, reflectionScore, challengeId }) => {
      const maturityIndex = calculateSRLMaturityIndex(
        forethoughtScore,
        performanceScore,
        reflectionScore,
      )
      const tier = evaluateSRLMaturityTier(maturityIndex)
      const goalAttainment = calculateGoalAttainmentScale(
        performanceScore / 10,
        reflectionScore >= 6,
        forethoughtScore / 10,
      )

      const challenge = challengeId ? CALIBRATED_SRL_CHALLENGES[challengeId] : null

      return json({
        maturityIndex,
        maturityTier: tier,
        goalAttainmentScore: goalAttainment,
        selectedChallenge: challenge
          ? {
              id: challenge.id,
              title: challenge.title,
              domain: challenge.domain,
              complexityLevel: challenge.complexityLevel,
              taskDescription: challenge.taskDescription,
              forethoughtHeuristic: challenge.expertForethoughtHeuristic,
              selfReflectionPrompt: challenge.expertSelfReflectionPrompt,
            }
          : null,
      })
    },
  ),

  // ── 4. Epistemic Network Analysis (Shaffer 2016) ──
  tool(
    'epistemic_network_analyze',
    'Analyzes epistemic discourse co-occurrence using moving stanza windows and SVD 2D projection.',
    {
      discourseTexts: z.array(z.string()).describe('Sequential utterances in learning discourse.'),
      windowSize: z.number().int().min(2).max(10).default(4).describe('Moving stanza window size.'),
      baseMastery: z
        .number()
        .min(0)
        .max(1)
        .default(0.75)
        .describe('Learner base curriculum mastery.'),
    },
    async ({ discourseTexts, baseMastery }) => {
      const utterances = discourseTexts.map((text, idx) => ({
        id: `mcp_utt_${idx}`,
        unitId: 'mcp_unit',
        conversationId: 'mcp_conv',
        lineIndex: idx,
        timestamp: new Date().toISOString(),
        speaker: 'Learner',
        text,
        appliedCodes: [
          idx % 2 === 0 ? 'code_domain_principle' : 'code_empirical_evidence',
          'code_causal_reasoning',
        ],
      }))

      const model = buildEpistemicDiscourseModel(
        'mcp_ena_model',
        'MCP Discourse Analysis',
        'Cognitive Systems',
        utterances,
      )

      const bridge = bridgeEpistemicToCurriculum(model, baseMastery)

      return json({
        networkDensity: model.network.networkDensity,
        overallMaturityScore: model.overallMaturityScore,
        dimension1Centroid: model.projection.dimension1Coord,
        dimension2Centroid: model.projection.dimension2Coord,
        epistemicInterpretation: model.projection.epistemicInterpretation,
        curriculumTransferMultiplier: bridge.transferMultiplier,
        subtractiveGapsCount: model.subtractiveGaps.length,
      })
    },
  ),

  // ── 5. Structural Causal Models & Counterfactuals (Pearl 2000) ──
  tool(
    'causal_counterfactual_simulate',
    'Executes Pearl’s 3-step counterfactual algorithm (Abduction-Action-Prediction) holding latent U invariant.',
    {
      evidence: z
        .record(z.string(), z.number())
        .describe('Factual observed evidence (e.g., { StudyHours: 6, ExamScore: 48 }).'),
      interventions: z
        .record(z.string(), z.number())
        .describe('Hypothetical intervention do(X=x*) (e.g., { StudyHours: 18 }).'),
      targetVariableId: z
        .string()
        .default('ExamScore')
        .describe('Outcome variable to predict under counterfactual condition.'),
    },
    async ({ evidence, interventions, targetVariableId }) => {
      const model = createStandardEducationSCM()
      const result = evaluateCounterfactual(model, {
        modelId: model.id,
        evidence,
        interventions,
        targetVariableId,
      })

      const dsep = checkDSeparation(
        model,
        Object.keys(interventions)[0] ?? 'StudyHours',
        targetVariableId,
        ['Aptitude'],
      )
      const backdoor = evaluateBackdoorAdmissibility(
        model,
        Object.keys(interventions)[0] ?? 'StudyHours',
        targetVariableId,
        ['Aptitude'],
      )

      return json({
        factualValue: result.factualValue,
        counterfactualValue: result.counterfactualValue,
        causalLift: result.causalLift,
        exogenousStates: result.exogenousStates,
        narrativeExplanation: result.narrativeExplanation,
        isBackdoorAdmissible: backdoor.isAdmissible,
        dSeparationPathsEvaluated: dsep.paths.length,
      })
    },
  ),

  // ── 6. Threshold Concepts & Liminal Navigation (Meyer & Land 2003) ──
  tool(
    'threshold_liminal_evaluate',
    'Evaluates liminal trajectory, detects ritualized mimicry vs genuine integration, and calculates gateway multiplier.',
    {
      conceptId: z.string().default('tc_pointers_memory').describe('Threshold concept identifier.'),
      probeResponses: z
        .record(z.string(), z.string())
        .describe('Answers to boundary perturbation probes (probeId -> optionId).'),
      baseMastery: z
        .number()
        .min(0)
        .max(1)
        .default(0.75)
        .describe('Learner base curriculum mastery.'),
    },
    async ({ conceptId, probeResponses, baseMastery }) => {
      const diagnostic = evaluateLiminalTrajectory(conceptId, probeResponses)
      const bridge = bridgeThresholdToCurriculum(
        baseMastery,
        diagnostic.overallFluencyScore,
        diagnostic.phase,
        conceptId,
      )
      const concepts = getStandardThresholdConcepts()
      const concept = concepts.find((c) => c.id === conceptId) ?? concepts[0]

      return json({
        conceptTitle: concept.title,
        discipline: concept.discipline,
        phase: diagnostic.phase,
        canCrossPortal: diagnostic.canCrossPortal,
        overallFluencyScore: diagnostic.overallFluencyScore,
        mimicryRiskScore: diagnostic.mimicryRiskScore,
        oscillationStability: diagnostic.oscillationStability,
        prescribedRemediation: diagnostic.prescribedRemediation,
        gatewayMultiplier: bridge.gatewayMultiplier,
        modulatedMastery: bridge.modulatedMastery,
        unlockedDownstreamConcepts: concept.unlockedDownstreamConcepts,
      })
    },
  ),

  // ── 7. Dynamic Assessment & Zone of Proximal Development (Vygotsky & Feuerstein) ──
  tool(
    'zpd_list_scenarios',
    'Lists all canonical dynamic assessment scenarios across computer science, biochemistry, aerospace, law, and economics.',
    {},
    async () => {
      const scenarios = listZpdScenarios()
      return json({
        count: scenarios.length,
        scenarios: scenarios.map((s) => ({
          id: s.id,
          domain: s.domain,
          title: s.title,
          subtitle: s.subtitle,
          theoreticalCore: s.theoreticalCore,
        })),
      })
    },
  ),

  tool(
    'zpd_evaluate_trajectory',
    'Evaluates baseline ADL, mediated PDL, and computes ZPD bandwidth, Budoff Learning Potential Score (LPS), Feuerstein Cognitive Modifiability Index (CMI), and prompt efficiency.',
    ZpdEvaluationInputSchema.shape,
    async ({ scenarioId, preTestScore, postTestScore, promptsConsumed, transferScores }) => {
      const scenario = getZpdScenarioById(scenarioId) ?? listZpdScenarios()[0]
      const metrics = calculateZpdMetrics(
        preTestScore,
        postTestScore,
        promptsConsumed,
        transferScores,
      )

      return json({
        scenarioTitle: scenario.title,
        domain: scenario.domain,
        actualDevelopmentalLevel: metrics.actualDevelopmentalLevel,
        potentialDevelopmentalLevel: metrics.potentialDevelopmentalLevel,
        zpdBandwidth: metrics.zpdBandwidth,
        learningPotentialScore: metrics.learningPotentialScore,
        cognitiveModifiabilityIndex: metrics.cognitiveModifiabilityIndex,
        promptEfficiencyScore: metrics.promptEfficiencyScore,
        transferAutonomyScore: metrics.transferAutonomyScore,
        typology: metrics.typology,
        typologyDescription: metrics.typologyDescription,
        frustrationHorizon: metrics.frustrationHorizon,
      })
    },
  ),

  tool(
    'zpd_request_prompt',
    'Retrieves a standardized graduated prompt at a designated tier (1: Metacognitive, 2: Structural, 3: Heuristic, 4: Subgoal, 5: Worked Demonstration).',
    ZpdPromptInputSchema.shape,
    async ({ scenarioId, tierLevel }) => {
      const scenario = getZpdScenarioById(scenarioId) ?? listZpdScenarios()[0]
      const prompt = getGraduatedPromptAtTier(scenario.mediatedProblem, tierLevel)

      return json({
        scenarioTitle: scenario.title,
        problemTitle: scenario.mediatedProblem.title,
        tierLevel,
        prompt: prompt ?? null,
      })
    },
  ),

  tool(
    'zpd_generate_deck',
    'Generates an FSRS-6 review flashcard deck with stability (S0) dynamically modulated by Learning Potential Score (LPS) and Transfer Autonomy.',
    ZpdEvaluationInputSchema.shape,
    async ({ scenarioId, preTestScore, postTestScore, promptsConsumed, transferScores }) => {
      const scenario = getZpdScenarioById(scenarioId) ?? listZpdScenarios()[0]
      const metrics = calculateZpdMetrics(
        preTestScore,
        postTestScore,
        promptsConsumed,
        transferScores,
      )
      const deck = generateFSRSZpdDeck(scenario, metrics)

      return json({
        scenarioTitle: scenario.title,
        cardsCount: deck.length,
        metrics: {
          lps: metrics.learningPotentialScore,
          cmi: metrics.cognitiveModifiabilityIndex,
          tas: metrics.transferAutonomyScore,
          typology: metrics.typology,
        },
        cards: deck,
      })
    },
  ),

  // ── 8. Productive Failure & Canonical Consolidation (Manu Kapur & Tanmay Sinha) ──
  tool(
    'pf_list_scenarios',
    'Lists all canonical Productive Failure scenarios across statistics, distributed systems, thermodynamics, storage architecture, and epidemiology.',
    {},
    async () => {
      const scenarios = getCanonicalPFScenarios()
      return json({
        count: scenarios.length,
        scenarios: scenarios.map((s) => ({
          id: s.id,
          domain: s.domain,
          title: s.title,
          subtitle: s.subtitle,
          targetConcept: s.targetConcept,
          priorKnowledgeContext: s.priorKnowledgeContext,
        })),
      })
    },
  ),

  tool(
    'pf_evaluate_representation',
    'Evaluates an intuitive student-generated representation (SGR) against canonical structural invariants.',
    {
      scenarioId: z
        .string()
        .default('pf-variance-dispersion')
        .describe('Productive failure scenario identifier.'),
      title: z.string().describe('Title of the intuitive solution model.'),
      description: z.string().default('').describe('Conceptual explanation.'),
      mechanism: z.string().default('').describe('Formal mathematical or algorithmic mechanism.'),
      structuralFeatures: z
        .array(z.string())
        .default([])
        .describe('Key structural features claimed by the model.'),
    },
    async ({ scenarioId, title, description, mechanism, structuralFeatures }) => {
      const evaluated = evaluateStudentRepresentation(scenarioId, {
        title,
        description,
        mechanism,
        structuralFeatures,
      })
      return json({
        scenarioId,
        representation: evaluated,
      })
    },
  ),

  tool(
    'pf_calculate_metrics',
    'Computes Productive Failure Index (PFI), Generation Diversity (GDI), Impasse Sensitivity (ISS), Consolidation Gain (CIG), Adaptive Transfer (ATS), and failure-to-mastery ratio.',
    {
      scenarioId: z
        .string()
        .default('pf-variance-dispersion')
        .describe('Productive failure scenario identifier.'),
      representationCount: z.number().int().min(1).max(10).default(3),
      impasseEncountered: z.boolean().default(true),
      affectiveImpasseRating: z.number().min(1).max(5).default(4),
      impasseDepthScore: z.number().min(0).max(100).default(75),
      featureAlignment: z.number().min(0).max(100).default(85),
      parameterMapping: z.number().min(0).max(100).default(80),
      invariantGrasp: z.number().min(0).max(100).default(80),
      transferSuccessCount: z.number().int().min(0).max(3).default(3),
    },
    async ({
      scenarioId,
      representationCount,
      impasseEncountered,
      affectiveImpasseRating,
      impasseDepthScore,
      featureAlignment,
      parameterMapping,
      invariantGrasp,
      transferSuccessCount,
    }) => {
      const scenario = getPFScenarioById(scenarioId) ?? getCanonicalPFScenarios()[0]
      const repCount = representationCount ?? 3
      const representations = scenario.exemplarStudentRepresentations.slice(0, repCount)
      const impasse = {
        impasseEncountered: impasseEncountered ?? true,
        failureModeIdentified: 'Boundary distortion breakdown',
        boundaryConditionsTested: ['Outliers', 'Zeros'],
        knowledgeGapArticulated: 'Need canonical invariant parameterization',
        affectiveImpasseRating: affectiveImpasseRating ?? 4,
        impasseDepthScore: impasseDepthScore ?? 75,
      }
      const consolidationRatings = {
        featureAlignment: featureAlignment ?? 85,
        parameterMapping: parameterMapping ?? 80,
        invariantGrasp: invariantGrasp ?? 80,
      }
      const successCount = transferSuccessCount ?? 3
      const transferResults = scenario.transferProbes.map((probe, idx) => ({
        probeId: probe.probeId,
        isCorrect: idx < successCount,
        confidence: 4,
      }))

      const metrics = calculatePFMetrics({
        representations,
        impasse,
        consolidationRatings,
        transferResults,
      })

      return json({
        scenarioTitle: scenario.title,
        productiveFailureIndex: metrics.productiveFailureIndex,
        generationDiversityIndex: metrics.generationDiversityIndex,
        impasseSensitivityScore: metrics.impasseSensitivityScore,
        consolidationIntegrationGain: metrics.consolidationIntegrationGain,
        adaptiveTransferScore: metrics.adaptiveTransferScore,
        failureToMasteryRatio: metrics.failureToMasteryRatio,
        masteryBand: metrics.masteryBand,
        qualitativeFeedback: metrics.qualitativeFeedback,
        recommendedIntervention: metrics.recommendedIntervention,
      })
    },
  ),

  tool(
    'pf_generate_deck',
    'Generates calibrated FSRS-6 spaced repetition flashcards from a Productive Failure session with stability (S0) and difficulty (D0) scaled to PFI.',
    {
      scenarioId: z
        .string()
        .default('pf-variance-dispersion')
        .describe('Productive failure scenario identifier.'),
      pfiScore: z.number().min(0).max(100).default(85),
      cigScore: z.number().min(0).max(100).default(80),
    },
    async ({ scenarioId, pfiScore: _pfiScore, cigScore }) => {
      const scenario = getPFScenarioById(scenarioId) ?? getCanonicalPFScenarios()[0]
      const cig = cigScore ?? 80
      const metrics = calculatePFMetrics({
        representations: scenario.exemplarStudentRepresentations,
        impasse: {
          impasseEncountered: true,
          failureModeIdentified: 'Boundary limit',
          boundaryConditionsTested: ['Outliers'],
          knowledgeGapArticulated: 'Need invariant model',
          affectiveImpasseRating: 4,
          impasseDepthScore: 80,
        },
        consolidationRatings: {
          featureAlignment: cig,
          parameterMapping: cig,
          invariantGrasp: cig,
        },
        transferResults: scenario.transferProbes.map((p) => ({
          probeId: p.probeId,
          isCorrect: true,
          confidence: 4,
        })),
      })
      const cards = generatePFFSRSCards(scenario, metrics)

      return json({
        scenarioTitle: scenario.title,
        cardsCount: cards.length,
        initialStabilityDays: cards[0]?.initialStabilityDays,
        initialDifficulty: cards[0]?.initialDifficulty,
        masteryBand: metrics.masteryBand,
        cards,
      })
    },
  ),

  // ── 9. Peer Instruction & Interactive ConcepTests (Eric Mazur & Michelle Smith) ──
  tool(
    'pi_list_conceptests',
    'Lists all canonical ConcepTest suites across physics, circuits, fluid mechanics, genetics, and macroeconomics.',
    {},
    async () => {
      const suites = getCanonicalConcepTestSuites()
      return json({
        count: suites.length,
        suites: suites.map((s) => ({
          id: s.id,
          domain: s.domain,
          title: s.title,
          subtitle: s.subtitle,
          canonicalInvariant: s.canonicalInvariant,
          q1Prompt: s.q1Prompt,
          q2IsomorphicPrompt: s.q2IsomorphicPrompt,
        })),
      })
    },
  ),

  tool(
    'pi_simulate_peer_dialogue',
    'Retrieves simulated peer deliberation dialogues and classroom vote distributions for a designated ConcepTest.',
    {
      suiteId: z
        .string()
        .default('ct-thermal-expansion-plate')
        .describe('ConcepTest suite identifier.'),
    },
    async ({ suiteId }) => {
      const suite = getConcepTestSuiteById(suiteId) ?? getCanonicalConcepTestSuites()[0]
      return json({
        suiteId: suite.id,
        suiteTitle: suite.title,
        classroomVoteDistribution: suite.q1ClassroomVoteDistribution,
        simulatedPeers: suite.simulatedPeers,
      })
    },
  ),

  tool(
    'pi_evaluate_trajectory',
    'Computes Hake normalized learning gain (<g>), Mazur polarization index (PI), discussion convergence ratio (DCR), and Smith et al. (Science 2009) isomorphic transfer verification.',
    {
      suiteId: z
        .string()
        .default('ct-thermal-expansion-plate')
        .describe('ConcepTest suite identifier.'),
      q1InitialOptionId: z.string().optional().describe('Individual initial vote option ID.'),
      q1InitialConfidence: z.number().min(1).max(5).default(3),
      q1RevoteOptionId: z.string().optional().describe('Post-discussion revote option ID.'),
      q1RevoteConfidence: z.number().min(1).max(5).default(4),
      q2TransferOptionId: z.string().optional().describe('Isomorphic transfer probe Q2 option ID.'),
      peerDiscussionOccurred: z.boolean().default(true),
      vote1AccuracyPct: z.number().min(0).max(100).default(38),
      vote2AccuracyPct: z.number().min(0).max(100).default(82),
    },
    async ({
      suiteId,
      q1InitialOptionId,
      q1InitialConfidence,
      q1RevoteOptionId,
      q1RevoteConfidence,
      q2TransferOptionId,
      peerDiscussionOccurred,
      vote1AccuracyPct,
      vote2AccuracyPct,
    }) => {
      const suite = getConcepTestSuiteById(suiteId) ?? getCanonicalConcepTestSuites()[0]
      const q1Initial = q1InitialOptionId ?? suite.q1Options[0].id
      const q1Revote = q1RevoteOptionId ?? suite.q1Options.find((o) => o.isCorrect)?.id ?? q1Initial
      const q2Transfer =
        q2TransferOptionId ?? suite.q2Options.find((o) => o.isCorrect)?.id ?? suite.q2Options[0].id

      const metrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: q1Initial,
        q1InitialConfidence: q1InitialConfidence ?? 3,
        q1RevoteOptionId: q1Revote,
        q1RevoteConfidence: q1RevoteConfidence ?? 4,
        q2TransferOptionId: q2Transfer,
        peerDiscussionOccurred: peerDiscussionOccurred ?? true,
        simulatedClassroomAccuracyVote1: vote1AccuracyPct ?? 38,
        simulatedClassroomAccuracyVote2: vote2AccuracyPct ?? 82,
      })

      return json({
        suiteTitle: suite.title,
        hakeNormalizedGain: metrics.hakeNormalizedGain,
        mazurPolarizationIndex: metrics.mazurPolarizationIndex,
        peerDiscussionConvergence: metrics.peerDiscussionConvergence,
        isomorphicTransferScore: metrics.isomorphicTransferScore,
        confidenceCalibrationDelta: metrics.confidenceCalibrationDelta,
        mazurWindowRecommendedAction: metrics.mazurWindowRecommendedAction,
        engagementBand: metrics.engagementBand,
        smithLearningVerification: metrics.smithLearningVerification,
        qualitativeSummary: metrics.qualitativeSummary,
        pedagogicalAdvice: metrics.pedagogicalAdvice,
      })
    },
  ),

  tool(
    'pi_generate_deck',
    'Generates calibrated FSRS-6 review flashcards for a ConcepTest with stability and difficulty scaled by Hake gain and Smith transfer.',
    {
      suiteId: z
        .string()
        .default('ct-thermal-expansion-plate')
        .describe('ConcepTest suite identifier.'),
      hakeGain: z.number().min(0).max(1).default(0.75),
      isomorphicCorrect: z.boolean().default(true),
    },
    async ({ suiteId, hakeGain, isomorphicCorrect }) => {
      const suite = getConcepTestSuiteById(suiteId) ?? getCanonicalConcepTestSuites()[0]
      const dummyMetrics = calculatePIMetrics({
        suite,
        q1InitialOptionId: suite.q1Options[0].id,
        q1InitialConfidence: 3,
        q1RevoteOptionId: suite.q1Options.find((o) => o.isCorrect)!.id,
        q1RevoteConfidence: 5,
        q2TransferOptionId: isomorphicCorrect
          ? suite.q2Options.find((o) => o.isCorrect)!.id
          : suite.q2Options[0].id,
        peerDiscussionOccurred: true,
        simulatedClassroomAccuracyVote1: 35,
        simulatedClassroomAccuracyVote2: Math.round(35 + (hakeGain ?? 0.75) * 65),
      })
      const cards = generatePIFSRSCards(suite, dummyMetrics)

      return json({
        suiteTitle: suite.title,
        cardsCount: cards.length,
        initialStabilityDays: cards[0]?.initialStabilityDays,
        initialDifficulty: cards[0]?.initialDifficulty,
        cards,
      })
    },
  ),

  // ── 10. Scientific Discovery & Inquiry Simulation (Klahr & Dunbar 1988) ──
  tool(
    'inquiry_list_labs',
    'Lists all canonical scientific discovery inquiry laboratories across mechanics, biochemistry, plant physiology, electrodynamics, and macroeconomics.',
    {},
    async () => {
      const labs = getCanonicalInquiryLabs()
      return json({
        count: labs.length,
        labs: labs.map((l) => ({
          id: l.id,
          title: l.title,
          domain: l.domain,
          subtitle: l.subtitle,
          researchQuestion: l.researchQuestion,
          canonicalInvariantLaw: l.canonicalInvariantLaw,
          independentVariablesCount: l.independentVariables.length,
          dependentOutputsCount: l.dependentOutputs.length,
          anomalousScenariosCount: l.anomalousScenarios.length,
        })),
      })
    },
  ),

  tool(
    'inquiry_run_trial',
    'Executes a deterministic laboratory simulation trial given parameter settings, returning observed outputs and VOTAT variable control compliance.',
    {
      labId: z.string().default('lab-pendulum-period').describe('Inquiry laboratory identifier.'),
      trialIndex: z.number().int().nonnegative().default(0),
      variableSettings: z.record(z.string(), z.number()).default({}),
      previousSettings: z.record(z.string(), z.number()).optional(),
    },
    async ({ labId, trialIndex, variableSettings, previousSettings }) => {
      const id = labId ?? 'lab-pendulum-period'
      const lab = getInquiryLabById(id) ?? getCanonicalInquiryLabs()[0]!
      const trial = runInquiryTrial(lab, trialIndex ?? 0, variableSettings ?? {}, previousSettings)
      return json({
        labId: lab.id,
        labTitle: lab.title,
        trial,
      })
    },
  ),

  tool(
    'inquiry_evaluate_sdds',
    'Computes quantitative scientific discovery metrics: VOTAT Rigor Index (Chen & Klahr 1999), Confirmation Bias Index (Wason 1960), and Chinn & Brewer (1993) Anomalous Data Epistemic Resolution.',
    {
      labId: z.string().default('lab-pendulum-period').describe('Inquiry laboratory identifier.'),
      votatCompliantFraction: z.number().min(0).max(1).default(1.0),
      anomalousReaction: z
        .enum([
          'ignore',
          'reject',
          'exclude',
          'hold_in_abeyance',
          'reinterpretation',
          'peripheral_change',
          'theory_revision',
        ])
        .default('theory_revision'),
      falsificationTrialCount: z.number().int().min(0).default(1),
      finalHypothesisCapturesInvariant: z.boolean().default(true),
    },
    async ({
      labId,
      votatCompliantFraction,
      anomalousReaction,
      falsificationTrialCount,
      finalHypothesisCapturesInvariant,
    }) => {
      const id = labId ?? 'lab-pendulum-period'
      const lab = getInquiryLabById(id) ?? getCanonicalInquiryLabs()[0]!

      // Generate representative trial history based on votat fraction
      const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
      const isCompliant = (votatCompliantFraction ?? 1.0) >= 0.5
      const t2Settings = isCompliant
        ? { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 } // 1 var changed
        : { length: 1.5, mass: 0.8, angle: 45, gravity: 9.81 } // 3 vars changed
      const t2 = runInquiryTrial(lab, 1, t2Settings, t1.variableSettings)

      const metrics = calculateInquiryMetrics({
        lab,
        trials: [t1, t2],
        anomalousSubmissions: [
          {
            anomalyId: lab.anomalousScenarios[0]?.id ?? 'anomaly-1',
            reaction: anomalousReaction ?? 'theory_revision',
            articulatedExplanation: 'Accommodated invariant schema',
          },
        ],
        falsificationTrialCount: falsificationTrialCount ?? 1,
        finalHypothesisCapturesInvariant: finalHypothesisCapturesInvariant ?? true,
      })

      return json({
        labTitle: lab.title,
        votatRigorIndex: metrics.votatRigorIndex,
        confirmationBiasIndex: metrics.confirmationBiasIndex,
        anomalousDataResolutionIndex: metrics.anomalousDataResolutionIndex,
        hypothesisEvidenceAlignmentScore: metrics.hypothesisEvidenceAlignmentScore,
        scientificDiscoveryIndex: metrics.scientificDiscoveryIndex,
        inquiryMasteryBand: metrics.inquiryMasteryBand,
        sddsSearchEfficiencyRatio: metrics.sddsSearchEfficiencyRatio,
        qualitativeDiagnostic: metrics.qualitativeDiagnostic,
        pedagogicalAdvice: metrics.pedagogicalAdvice,
      })
    },
  ),

  tool(
    'inquiry_generate_deck',
    'Generates calibrated FSRS-6 review flashcards for an inquiry lab with stability and difficulty scaled by the Scientific Discovery Index.',
    {
      labId: z.string().default('lab-pendulum-period').describe('Inquiry laboratory identifier.'),
      sdiScore: z.number().min(0).max(100).default(85),
    },
    async ({ labId, sdiScore }) => {
      const id = labId ?? 'lab-pendulum-period'
      const lab = getInquiryLabById(id) ?? getCanonicalInquiryLabs()[0]!
      const dummyMetrics = calculateInquiryMetrics({
        lab,
        trials: [
          runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 }),
          runInquiryTrial(
            lab,
            1,
            { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
            { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 },
          ),
        ],
        anomalousSubmissions: [
          {
            anomalyId: lab.anomalousScenarios[0]?.id ?? 'anomaly-1',
            reaction: (sdiScore ?? 85) >= 70 ? 'theory_revision' : 'ignore',
            articulatedExplanation: 'Calibrated model',
          },
        ],
        falsificationTrialCount: 1,
        finalHypothesisCapturesInvariant: (sdiScore ?? 85) >= 60,
      })
      const cards = generateInquiryFSRSCards(lab, dummyMetrics)

      return json({
        labTitle: lab.title,
        cardsCount: cards.length,
        initialStabilityDays: cards[0]?.initialStabilityDays,
        initialDifficulty: cards[0]?.initialDifficulty,
        cards,
      })
    },
  ),

  // ── 11. Reciprocal Teaching & Dialogic Questioning (Palincsar & Brown, Chi ICAP) ──
  tool(
    'rt_list_passages',
    'Lists all canonical complex text passages across evolutionary biology, computer science, astrophysics, macroeconomics, and neurobiology.',
    {},
    async () => {
      const passages = CANONICAL_TEXT_PASSAGES
      return json({
        count: passages.length,
        passages: passages.map((p) => ({
          id: p.id,
          title: p.title,
          discipline: p.discipline,
          difficulty: p.difficulty,
          wordCount: p.wordCount,
          coreThesis: p.coreThesis,
          stemsCount: p.stems.length,
          misconceptionsCount: p.commonMisconceptions.length,
        })),
      })
    },
  ),

  tool(
    'rt_generate_peer_turn',
    'Generates a responsive Socratic peer dialogic turn grounded in Palincsar & Brown (1984) reciprocal teaching.',
    {
      passageId: z.string().default('passage-endosymbiosis').describe('Target passage identifier.'),
      preferredRole: z.enum(['questioner', 'clarifier', 'summarizer', 'predictor']).optional(),
      latestUserText: z.string().default('How does cardiolipin prove bacterial descent?'),
    },
    async ({ passageId, preferredRole, latestUserText }) => {
      const passage =
        CANONICAL_TEXT_PASSAGES.find((p) => p.id === passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
      const history: DialogueTurn[] = [
        {
          id: 'turn-user-1',
          speaker: 'user',
          role: 'questioner',
          turnIndex: 0,
          text: latestUserText ?? 'How does this mechanism work?',
          timestamp: Date.now() - 5000,
          icapLevel: 'constructive',
          elaborationScore: 70,
        },
      ]
      const peerTurn = generatePeerDialogicTurn(passage, history, preferredRole)

      return json({
        passageTitle: passage.title,
        peerRole: peerTurn.role,
        peerText: peerTurn.text,
        stemId: peerTurn.stemId,
        icapLevel: peerTurn.icapLevel,
      })
    },
  ),

  tool(
    'rt_evaluate_dialogue',
    'Computes quantitative ICAP engagement, Strategy Balance Score (RSBS), Elaboration Depth Index (EDI), Metacognitive Repair Ratio (MRR), and Reciprocal Dialogue Maturity Score (RDMS).',
    {
      passageId: z.string().default('passage-endosymbiosis'),
      userResponses: z
        .array(
          z.object({
            role: z.enum(['questioner', 'clarifier', 'summarizer', 'predictor']),
            text: z.string(),
            resolvedMisconceptionId: z.string().optional(),
          }),
        )
        .default([
          {
            role: 'questioner',
            text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial rather than eukaryotic in origin?',
          },
          {
            role: 'clarifier',
            text: 'Regarding the misconception of inward pinching, cardiolipin proves bacterial ancestry because eukaryotes do not synthesize it in outer membranes.',
            resolvedMisconceptionId: 'misc-endo-1',
          },
        ]),
    },
    async ({ passageId, userResponses }) => {
      const passage =
        CANONICAL_TEXT_PASSAGES.find((p) => p.id === passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
      const turns: DialogueTurn[] = userResponses.map((r, i) => {
        const { icapLevel, causalScore } = classifyICAPEngagement(r.text, i > 0)
        return {
          id: `turn-eval-${i}`,
          speaker: 'user',
          role: r.role,
          turnIndex: i,
          text: r.text,
          timestamp: Date.now() - (userResponses.length - i) * 10000,
          icapLevel,
          elaborationScore: causalScore,
          resolvedMisconceptionId: r.resolvedMisconceptionId,
        }
      })
      const evaluation = evaluateReciprocalSession(turns, passage)

      return json({
        passageTitle: passage.title,
        rdms: evaluation.rdms,
        masteryBand: evaluation.masteryBand,
        icap: evaluation.icap,
        strategy: evaluation.strategy,
        elaboration: evaluation.elaboration,
        repair: evaluation.repair,
        feedback: evaluation.feedback,
        recommendations: evaluation.recommendations,
      })
    },
  ),

  tool(
    'rt_generate_deck',
    'Synthesizes calibrated FSRS-6 spaced repetition cards from reciprocal dialogue with stability and difficulty scaled by dialogue maturity.',
    {
      passageId: z.string().default('passage-endosymbiosis'),
      sampleText: z
        .string()
        .default('Cardiolipin proves endosymbiosis because eukaryotes lack it.'),
    },
    async ({ passageId, sampleText }) => {
      const passage =
        CANONICAL_TEXT_PASSAGES.find((p) => p.id === passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
      const turns: DialogueTurn[] = [
        {
          id: 'turn-sample',
          speaker: 'user',
          role: 'clarifier',
          turnIndex: 0,
          text: sampleText,
          timestamp: Date.now(),
          icapLevel: 'constructive',
          elaborationScore: 75,
        },
      ]
      const evaluation = evaluateReciprocalSession(turns, passage)
      const deck = generateReciprocalFSRSDeck(passage, turns, evaluation)

      return json({
        passageTitle: passage.title,
        rdmsBaseline: deck.rdmsBaseline,
        cardsCount: deck.cards.length,
        cards: deck.cards,
      })
    },
  ),

  // ── 12. Claim-Evidence-Reasoning (CER) & Epistemic Argumentation (McNeill & Krajcik, Osborne) ──
  tool(
    'cer_list_debates',
    'Lists all canonical multidisciplinary scientific debate cases across climatology, quantum foundations, epigenetics, neuropharmacology, and cognitive linguistics.',
    {},
    async () => {
      const debates = CANONICAL_SCIENTIFIC_DEBATES
      return json({
        count: debates.length,
        debates: debates.map((d) => ({
          id: d.id,
          title: d.title,
          domain: d.domain,
          difficulty: d.difficulty,
          focalQuestion: d.focalQuestion,
          claimsCount: d.competingClaims.length,
          evidenceCount: d.evidencePool.length,
          principlesCount: d.scientificPrinciples.length,
        })),
      })
    },
  ),

  tool(
    'cer_counter_argue',
    'Generates an authentic adversarial counter-argument and challenge prompt for a given claim in a scientific debate.',
    {
      debateId: z.string().default('debate-amoc-tipping'),
      selectedClaimId: z.string().default('claim-amoc-tipping-near'),
    },
    async ({ debateId, selectedClaimId }) => {
      const debate =
        CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === debateId) ??
        CANONICAL_SCIENTIFIC_DEBATES[0]!
      const counter = generateAdversarialCounterArgument(debate, selectedClaimId)
      return json({
        debateTitle: debate.title,
        counterTheorist: counter.counterTheorist,
        counterClaim: counter.counterClaim,
        counterEvidence: counter.counterEvidence,
        rebuttalChallenge: counter.rebuttalChallenge,
      })
    },
  ),

  tool(
    'cer_evaluate_argument',
    'Evaluates an argument submission against the McNeill-Krajcik CER framework and Erduran-Osborne TAP 5-level hierarchy, calculating CCS, EQI, RDI, TAP, and ERS.',
    {
      // Payload shape owned by core (C8); the tool only layers its demo defaults on top.
      ...CERArgumentSubmissionSchema.shape,
      debateId: CERArgumentSubmissionSchema.shape.debateId.default('debate-amoc-tipping'),
      selectedClaimId:
        CERArgumentSubmissionSchema.shape.selectedClaimId.default('claim-amoc-tipping-near'),
      claimStatement: CERArgumentSubmissionSchema.shape.claimStatement.default(
        'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
      ),
      selectedEvidenceIds: CERArgumentSubmissionSchema.shape.selectedEvidenceIds.default([
        'ev-amoc-sst-autocorr',
        'ev-amoc-paleo-glacier',
      ]),
      userEvidenceSynthesis: CERArgumentSubmissionSchema.shape.userEvidenceSynthesis.default(
        'Subpolar SST fingerprints exhibit critical slowing down with increased variance and Heinrich Stadial 1 paleorecords show massive freshwater shutdown.',
      ),
      selectedPrincipleIds: CERArgumentSubmissionSchema.shape.selectedPrincipleIds.default([
        'princ-salt-advection',
        'princ-critical-slowing',
      ]),
      userReasoningStatement: CERArgumentSubmissionSchema.shape.userReasoningStatement.default(
        'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, creating runaway positive feedback.',
      ),
      userRebuttalStatement: CERArgumentSubmissionSchema.shape.userRebuttalStatement.default(
        'Opponents cite RAPID-MOCHA mooring data; however, 18 years of instrumental data is statistically insufficient to distinguish multi-decadal variability from centennial collapse.',
      ),
    },
    async ({
      debateId,
      selectedClaimId,
      claimStatement,
      selectedEvidenceIds,
      userEvidenceSynthesis,
      selectedPrincipleIds,
      userReasoningStatement,
      userRebuttalStatement,
    }) => {
      const debate =
        CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === debateId) ??
        CANONICAL_SCIENTIFIC_DEBATES[0]!
      const submission: CERArgumentSubmission = {
        debateId: debate.id,
        selectedClaimId,
        claimStatement,
        selectedEvidenceIds,
        userEvidenceSynthesis,
        selectedPrincipleIds,
        userReasoningStatement,
        userRebuttalStatement,
      }
      const evaluation = evaluateCERArgument(debate, submission)
      return json({
        debateTitle: debate.title,
        ers: evaluation.ers,
        ccs: evaluation.ccs,
        eqi: evaluation.eqi,
        rdi: evaluation.rdi,
        tapLevel: evaluation.tapLevel,
        masteryBand: evaluation.masteryBand,
        feedback: evaluation.feedback,
        epistemicStrengths: evaluation.epistemicStrengths,
        vulnerabilities: evaluation.vulnerabilities,
      })
    },
  ),

  tool(
    'cer_generate_deck',
    'Synthesizes calibrated FSRS-6 spaced repetition cards from a scientific debate with parameters scaled by Epistemic Rigor Score.',
    {
      debateId: z.string().default('debate-amoc-tipping'),
      claimStatement: z.string().default('The AMOC has crossed early-warning tipping thresholds.'),
    },
    async ({ debateId, claimStatement }) => {
      const debate =
        CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === debateId) ??
        CANONICAL_SCIENTIFIC_DEBATES[0]!
      const submission: CERArgumentSubmission = {
        debateId: debate.id,
        selectedClaimId: debate.competingClaims[0]!.id,
        claimStatement,
        selectedEvidenceIds: [debate.evidencePool[0]!.id],
        userEvidenceSynthesis: 'Observational fingerprint data.',
        selectedPrincipleIds: [debate.scientificPrinciples[0]!.id],
        userReasoningStatement: 'Salt advection positive feedback.',
      }
      const evaluation = evaluateCERArgument(debate, submission)
      const deck = generateCERFSRSDeck(debate, submission, evaluation)
      return json({
        debateTitle: debate.title,
        ersBaseline: deck.ersBaseline,
        cardsCount: deck.cards.length,
        cards: deck.cards,
      })
    },
  ),

  // ── 12. Anchored Instruction & Situated Macrocontext (CTGV 1990, 1992) ──
  tool(
    'anchored_list_macrocontexts',
    'Lists all canonical Anchored Instruction macrocontext scenarios (CTGV 1990, 1992, Jasper Woodbury framework) across aviation, marine geophysics, astrobiology, epidemiology, and power grids.',
    {},
    async () => {
      return json({
        count: CANONICAL_MACROCONTEXT_CASES.length,
        macrocontexts: CANONICAL_MACROCONTEXT_CASES.map((c) => ({
          id: c.id,
          domain: c.domain,
          title: c.title,
          difficulty: c.difficulty,
          missionGoal: c.missionGoal,
          embeddedDataCount: c.embeddedData.length,
          subGoalsCount: c.subGoalHierarchy.length,
          constraintsCount: c.constraints.length,
        })),
      })
    },
  ),

  tool(
    'anchored_evaluate_solution',
    'Evaluates a learner situated solution submission within an anchored macrocontext, calculating SGAI, EIER, CPR, IKRS, and constraint violations.',
    {
      // Payload shape owned by core (C8); the tool only layers its demo defaults on top.
      ...LearnerSolutionSubmissionSchema.shape,
      caseId: LearnerSolutionSubmissionSchema.shape.caseId.default('case-jasper-flight'),
      extractedDataValues: LearnerSolutionSubmissionSchema.shape.extractedDataValues.default({
        'data-dist-leg1': 120,
        'data-speed-cruise': 140,
        'data-fuel-cap': 48,
        'data-fuel-burn': 12,
      }),
      subGoalSequence: LearnerSolutionSubmissionSchema.shape.subGoalSequence.default([
        'sg-flight-time',
        'sg-fuel-burn',
        'sg-reserve-check',
      ]),
      calculatedSubGoalOutputs:
        LearnerSolutionSubmissionSchema.shape.calculatedSubGoalOutputs.default({
          'sg-flight-time': 0.857,
          'sg-fuel-burn': 10.28,
          'sg-reserve-check': 37.72,
        }),
      finalDecisionChoice:
        LearnerSolutionSubmissionSchema.shape.finalDecisionChoice.default('choice-direct-flight'),
      decisionJustification: LearnerSolutionSubmissionSchema.shape.decisionJustification.default(
        'Fuel reserves exceed required 45-minute FAA reserves under visual flight rules.',
      ),
    },
    async ({
      caseId,
      extractedDataValues,
      subGoalSequence,
      calculatedSubGoalOutputs,
      finalDecisionChoice,
      decisionJustification,
    }) => {
      const macroCase =
        CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === caseId) ??
        CANONICAL_MACROCONTEXT_CASES[0]!
      const submission: LearnerSolutionSubmission = {
        caseId: macroCase.id,
        extractedDataValues,
        subGoalSequence,
        calculatedSubGoalOutputs,
        finalDecisionChoice,
        decisionJustification,
      }
      const evaluation = evaluateAnchoredSolution(macroCase, submission)
      return json({
        caseTitle: macroCase.title,
        ikrs: evaluation.ikrs,
        sgai: evaluation.sgai,
        eier: evaluation.eier,
        cpr: evaluation.cpr,
        maturityBand: evaluation.maturityBand,
        decisionApproved: evaluation.decisionApproved,
        pedagogicalFeedback: evaluation.pedagogicalFeedback,
        strengths: evaluation.strengths,
        vulnerabilities: evaluation.vulnerabilities,
        subGoalFeedback: evaluation.subGoalFeedback,
      })
    },
  ),

  tool(
    'anchored_simulate_sensitivity',
    'Performs what-if sensitivity simulations by modifying a single embedded narrative parameter and recalculating macrocontext constraints.',
    {
      caseId: z.string().default('case-jasper-flight'),
      parameterId: z.string().default('data-headwind-speed'),
      variedValue: z.number().default(25),
    },
    async ({ caseId, parameterId, variedValue }) => {
      const macroCase =
        CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === caseId) ??
        CANONICAL_MACROCONTEXT_CASES[0]!
      const simulation = simulateAnchoredSensitivity(macroCase, parameterId, variedValue)
      return json(simulation)
    },
  ),

  tool(
    'anchored_generate_deck',
    'Generates calibrated FSRS-6 spaced repetition cards from an anchored macrocontext case, scaled by Inert Knowledge Resistance Score.',
    {
      caseId: z.string().default('case-jasper-flight'),
      ikrsScore: z.number().min(0).max(100).default(85),
    },
    async ({ caseId, ikrsScore }) => {
      const macroCase =
        CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === caseId) ??
        CANONICAL_MACROCONTEXT_CASES[0]!
      const dummySubmission: LearnerSolutionSubmission = {
        caseId: macroCase.id,
        extractedDataValues: {},
        subGoalSequence: macroCase.subGoalHierarchy.map((sg) => sg.id),
        calculatedSubGoalOutputs: {},
        finalDecisionChoice: 'optimal_decision',
        decisionJustification: 'Optimal calibrated pathway.',
      }
      const evaluation = evaluateAnchoredSolution(macroCase, dummySubmission)
      evaluation.ikrs = ikrsScore
      const deck = generateAnchoredFSRSDeck(macroCase, evaluation)
      return json({
        caseTitle: macroCase.title,
        ikrsBaseline: deck.ikrsBaseline,
        cardsCount: deck.cards.length,
        cards: deck.cards,
      })
    },
  ),

  // ── 13. Contrasting Cases & Inventing with Examples (Schwartz & Bransford 1998, 2004) ──
  tool(
    'contrasting_list_sets',
    'Lists all canonical Contrasting Case sets (Schwartz & Bransford 1998 "A Time for Telling") across fluid mechanics, statistics, machine learning, thermodynamics, and computer architecture.',
    {},
    async () => {
      return json({
        count: CANONICAL_CONTRASTING_SETS.length,
        sets: CANONICAL_CONTRASTING_SETS.map((s) => ({
          id: s.id,
          domain: s.domain,
          title: s.title,
          difficulty: s.difficulty,
          problemOverview: s.problemOverview,
          variantsCount: s.variants.length,
          dimensionsCount: s.dimensions.length,
          formalLawName: s.canonicalTelling.formalLawName,
          formalEquation: s.canonicalTelling.formalEquation,
        })),
      })
    },
  ),

  tool(
    'contrasting_evaluate_invention',
    'Evaluates a learner invented metric or general rule across contrasting cases, calculating FDRS, IMI, PFRI, and CDTS.',
    {
      // Payload shape owned by core (C8); the tool only layers its demo defaults on top.
      // impasseEncountered (default true) is inherited from the core schema.
      ...InventedMetricSubmissionSchema.shape,
      setId: InventedMetricSubmissionSchema.shape.setId.default('set-density-buoyancy'),
      inventedMetricName:
        InventedMetricSubmissionSchema.shape.inventedMetricName.default('Packing Density Ratio'),
      formulaDescription: InventedMetricSubmissionSchema.shape.formulaDescription.default(
        'Dividing mass by volume yields density; values below 1.0 float, while values above 1.0 sink to bottom.',
      ),
      selectedDimensionIds: InventedMetricSubmissionSchema.shape.selectedDimensionIds.default([
        'dim-mass-vol-ratio',
        'dim-displacement-equilibrium',
      ]),
      variantRankings: InventedMetricSubmissionSchema.shape.variantRankings.default([
        'cyl-balsa-disc',
        'cyl-hollow-steel',
        'cyl-oak-block',
        'cyl-neutral-gel',
        'cyl-aluminum-rod',
        'cyl-lead-bullet',
      ]),
      reflectionNotes: InventedMetricSubmissionSchema.shape.reflectionNotes.default(
        'Heavy oak floats while light lead sinks because of displaced water volume.',
      ),
    },
    async ({
      setId,
      inventedMetricName,
      formulaDescription,
      selectedDimensionIds,
      variantRankings,
      impasseEncountered,
      reflectionNotes,
    }) => {
      const caseSet =
        CANONICAL_CONTRASTING_SETS.find((s) => s.id === setId) ?? CANONICAL_CONTRASTING_SETS[0]!
      const submission: InventedMetricSubmission = {
        setId: caseSet.id,
        inventedMetricName,
        formulaDescription,
        selectedDimensionIds,
        variantRankings,
        impasseEncountered,
        reflectionNotes,
      }
      const evaluation = evaluateContrastingAttempt(caseSet, submission)
      return json({
        setTitle: caseSet.title,
        cdts: evaluation.cdts,
        fdrs: evaluation.fdrs,
        imi: evaluation.imi,
        pfri: evaluation.pfri,
        rankingAccuracy: evaluation.rankingAccuracy,
        impasseProductive: evaluation.impasseProductive,
        maturityBand: evaluation.maturityBand,
        identifiedDeepDimensions: evaluation.identifiedDeepDimensions,
        superficialDistractorsChosen: evaluation.superficialDistractorsChosen,
        pedagogicalFeedback: evaluation.pedagogicalFeedback,
        strengths: evaluation.strengths,
        vulnerabilities: evaluation.vulnerabilities,
      })
    },
  ),

  tool(
    'contrasting_generate_deck',
    'Generates calibrated FSRS-6 spaced repetition cards from a contrasting case set, scaled by Contrasting Differentiation & Transfer Score (CDTS).',
    {
      setId: z.string().default('set-density-buoyancy'),
      cdtsScore: z.number().min(0).max(100).optional(),
      cdtsBaseline: z.number().min(0).max(100).optional(),
    },
    async ({ setId, cdtsScore, cdtsBaseline }) => {
      const caseSet =
        CANONICAL_CONTRASTING_SETS.find((s) => s.id === setId) ?? CANONICAL_CONTRASTING_SETS[0]!
      const dummySubmission: InventedMetricSubmission = {
        setId: caseSet.id,
        inventedMetricName: 'Optimal Model',
        formulaDescription: 'Dimensional ratio coordinating all cases.',
        selectedDimensionIds: caseSet.dimensions.filter((d) => d.isDeepDimension).map((d) => d.id),
        variantRankings: caseSet.variants.map((v) => v.id),
        impasseEncountered: true,
        reflectionNotes: 'Optimal reflection on invariant ratios.',
      }
      const evaluation = evaluateContrastingAttempt(caseSet, dummySubmission)
      evaluation.cdts = cdtsScore ?? cdtsBaseline ?? 90
      const deck = generateContrastingFSRSDeck(caseSet, evaluation)
      return json({
        setId: caseSet.id,
        setTitle: caseSet.title,
        cdtsBaseline: deck.cdtsBaseline,
        cardsCount: deck.cards.length,
        cards: deck.cards,
      })
    },
  ),

  // ── 15. Collaborative Scripts & Transactive Discourse (King 1997, 1999; Weinberger & Fischer 2006) ──
  tool(
    'collaborative_list_scenarios',
    'Lists all canonical CSCL collaborative scenarios, dilemmas, competing perspectives, and simulated peer profiles.',
    {},
    async () => {
      const scenarios = CANONICAL_COLLABORATIVE_SCENARIOS.map((s) => ({
        id: s.id,
        title: s.title,
        domain: s.domain,
        difficulty: s.difficulty,
        centralDilemma: s.centralDilemma,
        perspectivesCount: s.competingPerspectives.length,
        invariantsCount: s.invariantsForSynthesis.length,
        peerName: s.simulatedPeer.name,
        peerRole: s.simulatedPeer.role,
      }))
      return json({
        count: scenarios.length,
        scenarios,
      })
    },
  ),

  tool(
    'collaborative_generate_partner_turn',
    'Generates an automated Socratic peer response turn based on Alison King prompts and simulated peer profile.',
    {
      scenarioId: z.string().default('collab-neuro-synaptic-plasticity'),
      learnerTurnText: z.string(),
      turnIndex: z.number().int().min(0).default(0),
    },
    async ({ scenarioId, learnerTurnText, turnIndex }) => {
      const scenario =
        CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === scenarioId) ??
        CANONICAL_COLLABORATIVE_SCENARIOS[0]!
      const peerTurn = generateCollaborativePeerTurn(scenario, learnerTurnText, turnIndex)
      return json({
        scenarioId: scenario.id,
        peerTurn,
      })
    },
  ),

  tool(
    'collaborative_evaluate_discourse',
    'Evaluates collaborative dialogue against Transactive Discourse Index (TDI), Epistemic Elaboration Depth (EED), and Script Compliance (SCR).',
    {
      // Payload shape owned by core (C8); the tool only adds the scenario default.
      ...DiscourseSubmissionSchema.shape,
      scenarioId: DiscourseSubmissionSchema.shape.scenarioId.default(
        'collab-neuro-synaptic-plasticity',
      ),
    },
    async (submission) => {
      const scenario =
        CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === submission.scenarioId) ??
        CANONICAL_COLLABORATIVE_SCENARIOS[0]!
      const evaluation = evaluateCollaborativeDiscourse(scenario, submission)
      return json({
        scenarioTitle: scenario.title,
        cei: evaluation.cei,
        tdi: evaluation.tdi,
        eed: evaluation.eed,
        scr: evaluation.scr,
        maturityBand: evaluation.maturityBand,
        transactiveCounts: evaluation.transactiveCounts,
        synthesizedInvariantsIdentified: evaluation.synthesizedInvariantsIdentified,
        strengths: evaluation.strengths,
        vulnerabilities: evaluation.vulnerabilities,
        pedagogicalFeedback: evaluation.pedagogicalFeedback,
      })
    },
  ),

  tool(
    'collaborative_generate_deck',
    'Generates calibrated FSRS-6 spaced repetition cards derived from collaborative discourse insights, scaled by CEI.',
    {
      scenarioId: z.string().default('collab-neuro-synaptic-plasticity'),
      ceiScore: z.number().min(0).max(100).optional(),
      ceiBaseline: z.number().min(0).max(100).optional(),
    },
    async ({ scenarioId, ceiScore, ceiBaseline }) => {
      const scenario =
        CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === scenarioId) ??
        CANONICAL_COLLABORATIVE_SCENARIOS[0]!
      const dummySubmission: DiscourseSubmission = {
        scenarioId: scenario.id,
        learnerInitialPosition: 'Optimal initial positioning.',
        dialogueTurns: [
          {
            id: 'turn-dummy',
            speaker: 'learner',
            role: 'synthesizer',
            text: 'Because we coordinate both mechanisms, homeostatic plasticity prevents catastrophic saturation.',
            speechAct: 'transactive_synthesis',
            epistemicKeywords: [],
          },
        ],
        jointSynthesis: 'Integrated model coordinating both perspectives.',
        individualTransferAnswer: 'Applied to parallel domain.',
      }
      const evaluation = evaluateCollaborativeDiscourse(scenario, dummySubmission)
      evaluation.cei = ceiScore ?? ceiBaseline ?? 88
      const deck = generateCollaborativeFSRSDeck(scenario, evaluation)
      return json({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        ceiBaseline: deck.ceiBaseline,
        cardsCount: deck.cards.length,
        cards: deck.cards,
      })
    },
  ),

  // ── 16. System Dynamics & Feedback Loop Modeling (Forrester 1968, Sterman 2000, Meadows 2008) ──
  tool(
    'system_dynamics_list_scenarios',
    'Lists all canonical system dynamics scenarios, stocks, flows, causal loops, archetypes, and leverage points.',
    {},
    async () => {
      const scenarios = CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.map((s) => ({
        id: s.id,
        title: s.title,
        domain: s.domain,
        difficulty: s.difficulty,
        stocksCount: s.stocks.length,
        flowsCount: s.flows.length,
        loopsCount: s.canonicalLoops.length,
        archetype: s.canonicalArchetype,
        leveragePointsCount: s.leveragePoints.length,
      }))
      return json({
        count: scenarios.length,
        scenarios,
      })
    },
  ),

  tool(
    'system_dynamics_simulate_trajectory',
    'Runs deterministic Euler numerical integration for a system dynamics scenario with policy multipliers.',
    {
      scenarioId: z.string().default('climate-permafrost-methane'),
      stepsCount: z.number().int().min(5).max(300).default(50),
      dt: z.number().min(0.01).max(10).default(1.0),
      policyMultipliers: z.record(z.string(), z.number()).optional(),
    },
    async ({ scenarioId, stepsCount, dt, policyMultipliers }) => {
      const scenario =
        CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === scenarioId) ??
        CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
      const simulationRun = runEulerSimulation(scenario, stepsCount, dt, {
        flowRateMultipliers: policyMultipliers,
      })
      return json({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        stepsCount: simulationRun.steps.length,
        hasOvershoot: simulationRun.hasOvershoot,
        hasOscillation: simulationRun.hasOscillation,
        finalEquilibrium: simulationRun.finalEquilibrium,
        summary: simulationRun.summary,
        finalStocks: simulationRun.steps[simulationRun.steps.length - 1]?.stocks ?? {},
      })
    },
  ),

  tool(
    'system_dynamics_evaluate_model',
    'Evaluates a learner systems thinking model for Stock-Flow Discrimination (SFDR), Loop Polarity (FLIA), Delay Awareness (DAM), and Archetype Recognition (ARS).',
    {
      scenarioId: z.string().default('climate-permafrost-methane'),
      classifiedVariables: z.array(
        z.object({
          id: z.string(),
          nature: z.enum(['stock', 'flow', 'auxiliary', 'parameter']),
        }),
      ),
      identifiedLoops: z.array(
        z.object({
          id: z.string(),
          polarity: z.enum(['reinforcing', 'balancing']),
          elementIds: z.array(z.string()),
          delayIdentified: z.boolean(),
        }),
      ),
      identifiedArchetype: z.enum([
        'limits_to_growth',
        'shifting_the_burden',
        'tragedy_of_the_commons',
        'fixes_that_fail',
        'eroding_goals',
        'escalation',
      ]),
      proposedHighLeverageIntervention: z.string(),
      predictedBehavior: z.enum([
        'exponential_growth',
        's_shaped_growth',
        'overshoot_and_collapse',
        'damped_oscillation',
        'asymptotic_stability',
      ]),
    },
    async (hypothesis) => {
      const scenario =
        CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === hypothesis.scenarioId) ??
        CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
      const evaluation = evaluateLearnerModel(scenario, hypothesis as LearnerModelHypothesis)
      return json({
        scenarioTitle: scenario.title,
        sdi: evaluation.sdi,
        sfdr: evaluation.sfdr,
        flia: evaluation.flia,
        dam: evaluation.dam,
        ars: evaluation.ars,
        maturityTier: evaluation.maturityTier,
        strengths: evaluation.strengths,
        systemicFeedback: evaluation.systemicFeedback,
        archetypeDiscrepancies: evaluation.archetypeDiscrepancies,
        leveragePointAnalysis: evaluation.leveragePointAnalysis,
      })
    },
  ),

  tool(
    'system_dynamics_generate_deck',
    'Generates calibrated FSRS-6 spaced repetition cards anchored to stock-flow distinctions, loop polarities, and high-leverage points.',
    {
      scenarioId: z.string().default('climate-permafrost-methane'),
      sdiBaseline: z.number().min(0).max(100).default(85),
    },
    async ({ scenarioId, sdiBaseline }) => {
      const scenario =
        CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === scenarioId) ??
        CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
      const mockEvaluation = {
        sfdr: sdiBaseline,
        flia: sdiBaseline,
        dam: sdiBaseline,
        ars: sdiBaseline,
        sdi: sdiBaseline,
        maturityTier:
          sdiBaseline >= 85 ? ('leverage_strategist' as const) : ('dynamic_simulator' as const),
        strengths: ['Evaluated via MCP tool invocation.'],
        systemicFeedback: [],
        archetypeDiscrepancies: [],
        leveragePointAnalysis: 'Direct MCP deck synthesis.',
      }
      const deck = generateSystemDynamicsFSRSDeck(scenario, mockEvaluation)
      return json({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        sdi: deck.sdi,
        cardsCount: deck.cards.length,
        cards: deck.cards,
      })
    },
  ),

  // ── 17. Model-Based Inquiry & Gedankenexperiment Simulation (Clement 2008, Nersessian 2002) ──
  tool(
    'model_inquiry_list_scenarios',
    'Lists all canonical Gedankenexperiment scenarios, extreme case variables, simulative steps, bridging analogies, and canonical principles.',
    {},
    async () => {
      const scenarios = listGedankenScenarios().map((s) => ({
        id: s.id,
        title: s.title,
        domain: s.domain,
        historicalOrigin: s.historicalOrigin,
        targetPhenomenon: s.targetPhenomenon,
        folkConception: s.folkConception,
        extremeCasesCount: s.extremeCases.length,
        simulativeStepsCount: s.simulativeSteps.length,
        bridgingCount: s.bridgingAnalogies.length,
        canonicalResolution: s.canonicalResolution.title,
      }))
      return json({
        count: scenarios.length,
        scenarios,
      })
    },
  ),

  tool(
    'model_inquiry_perturb_extreme_case',
    'Simulates pushing an extreme case variable to its asymptotic boundary limit to reveal contradictions.',
    {
      scenarioId: z.string().default('galileo_falling_bodies'),
      extremeCaseId: z.string().default('ec_feather_cannonball'),
      parameterLimit: z.string().optional(),
    },
    async ({ scenarioId, extremeCaseId, parameterLimit }) => {
      const result = perturbExtremeCase(scenarioId, extremeCaseId, parameterLimit)
      return json(result)
    },
  ),

  tool(
    'model_inquiry_simulate_mental_run',
    'Executes a step-by-step kinetic mental animation sequence and reveals contradictory deduction branches.',
    {
      scenarioId: z.string().default('galileo_falling_bodies'),
      stepIds: z
        .array(z.string())
        .default([
          'step_drop_isolated',
          'step_connect_cord',
          'step_deduction_drag',
          'step_deduction_combined_mass',
          'step_contradiction_crucible',
        ]),
    },
    async ({ scenarioId, stepIds }) => {
      const result = simulateMentalAnimation(scenarioId, stepIds)
      return json(result)
    },
  ),

  tool(
    'model_inquiry_evaluate_session',
    'Evaluates a complete model inquiry session across ECDI, SAF, BAS, MMS, and assigns a cognitive maturity tier.',
    {
      // Session payload shape owned by core (C8); the tool only adds the scenario default.
      session: z.object({
        ...InquirySessionInputSchema.shape,
        scenarioId: InquirySessionInputSchema.shape.scenarioId.default('galileo_falling_bodies'),
      }),
    },
    async ({ session }) => {
      const evaluation = evaluateInquirySession(session)
      const deck = generateModelInquiryFsrsDeck(session.scenarioId, evaluation)
      return json({
        evaluation,
        cardsCount: deck.length,
        cards: deck,
      })
    },
  ),

  tool(
    'model_inquiry_generate_deck',
    'Generates calibrated FSRS-6 spaced repetition cards anchored to thought experiments, limiting cases, and bridging anchors.',
    {
      scenarioId: z.string().default('galileo_falling_bodies'),
    },
    async ({ scenarioId }) => {
      const deck = generateModelInquiryFsrsDeck(scenarioId)
      return json({
        scenarioId,
        cardsCount: deck.length,
        cards: deck,
      })
    },
  ),

  // ── Knowledge Space Theory (Doignon & Falmagne 1985, 1999) ──
  tool(
    'kst_list_spaces',
    'Lists all canonical Knowledge Space Theory structures with domain items, states count, and well-graded status.',
    {},
    async () => {
      const spaces = getCanonicalKnowledgeSpaces()
      return json({
        count: spaces.length,
        spaces: spaces.map((s) => ({
          domainId: s.domainId,
          title: s.title,
          description: s.description,
          itemsCount: s.domainItems.length,
          statesCount: s.states.length,
          isWellGraded: s.isWellGraded,
          domainItems: s.domainItems,
        })),
      })
    },
  ),

  tool(
    'kst_start_session',
    'Initializes a new Markovian adaptive assessment session with uniform or difficulty-weighted prior distribution.',
    {
      domainId: z.string().default('elementary-algebra'),
      priorType: z.enum(['uniform', 'difficulty_weighted']).default('uniform'),
    },
    async ({ domainId, priorType }) => {
      const spaces = getCanonicalKnowledgeSpaces()
      const structure = spaces.find((s) => s.domainId === domainId) || spaces[0]!
      const session = initializeMarkovianSession(structure, priorType)
      const diagnosis = diagnoseLearner(session, structure)

      return json({
        domainId: structure.domainId,
        domainTitle: structure.title,
        session,
        diagnosis,
      })
    },
  ),

  tool(
    'kst_submit_response',
    'Submits a learner response to a probe item, updates the Bayesian posterior distribution, and selects the next optimal probe.',
    {
      domainId: z.string().default('elementary-algebra'),
      session: AdaptiveAssessmentSessionSchema,
      itemId: z.string(),
      isCorrect: z.boolean(),
      responseTimeMs: z.number().int().nonnegative().default(3000),
    },
    async ({ domainId, session, itemId, isCorrect, responseTimeMs }) => {
      const spaces = getCanonicalKnowledgeSpaces()
      const structure = spaces.find((s) => s.domainId === domainId) || spaces[0]!
      const updatedSession = updateBeliefPosterior(session, structure, {
        itemId,
        isCorrect,
        responseTimeMs,
      })
      const diagnosis = diagnoseLearner(updatedSession, structure)

      return json({
        session: updatedSession,
        diagnosis,
      })
    },
  ),

  tool(
    'kst_compute_fringes',
    'Computes the inner fringe K⁻ (frontier retention) and outer fringe K⁺ (proximal ZPD readiness) for a knowledge state.',
    {
      domainId: z.string().default('elementary-algebra'),
      stateItems: z.array(z.string()).default([]),
    },
    async ({ domainId, stateItems }) => {
      const spaces = getCanonicalKnowledgeSpaces()
      const structure = spaces.find((s) => s.domainId === domainId) || spaces[0]!
      const fringes = computeFringes(stateItems, structure)

      return json({
        domainId: structure.domainId,
        stateId: fringes.stateId,
        innerFringe: fringes.innerFringe,
        outerFringe: fringes.outerFringe,
        readyToLearnCount: fringes.outerFringe.length,
      })
    },
  ),

  tool(
    'kst_generate_deck',
    'Generates calibrated FSRS-6 spaced repetition cards derived from inner and outer fringes in a knowledge space.',
    {
      domainId: z.string().default('elementary-algebra'),
      stateId: z.string().optional(),
      maxCards: z.number().int().positive().default(12),
    },
    async ({ domainId, stateId, maxCards }) => {
      const spaces = getCanonicalKnowledgeSpaces()
      const structure = spaces.find((s) => s.domainId === domainId) || spaces[0]!
      const targetState = stateId
        ? structure.states.find((s) => s.stateId === stateId) ||
          structure.states[1] ||
          structure.states[0]!
        : structure.states[1] || structure.states[0]!

      const cards = generateKSTCalibratedDeck(structure, targetState, { maxCards })
      return json({
        domainId: structure.domainId,
        stateId: targetState.stateId,
        cardsCount: cards.length,
        cards,
      })
    },
  ),

  tool(
    'kst_audit_curriculum',
    'Ingests a curriculum structure and performs a Knowledge Space Theory audit for well-gradedness and bottlenecks.',
    {
      curriculum: z.object({
        id: z.string(),
        title: z.string(),
        modules: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            lessons: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                prerequisites: z.array(z.string()).optional(),
                difficulty: z.number().optional(),
              }),
            ),
          }),
        ),
      }),
    },
    async ({ curriculum }) => {
      const report = auditCurriculumStructure(curriculum)
      return json({
        report,
      })
    },
  ),
]
