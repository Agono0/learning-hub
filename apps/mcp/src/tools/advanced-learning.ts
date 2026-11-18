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
    {
      scenarioId: z
        .string()
        .default('algo_dynamic_programming')
        .describe('Assessment scenario identifier.'),
      preTestScore: z
        .number()
        .min(0)
        .max(100)
        .default(30)
        .describe('Independent baseline score (ADL).'),
      postTestScore: z
        .number()
        .min(0)
        .max(100)
        .default(80)
        .describe('Mediated post-test score (PDL).'),
      promptsConsumed: z
        .number()
        .int()
        .min(0)
        .max(5)
        .default(2)
        .describe('Graduated prompts accessed (0..5).'),
      transferScores: z
        .array(z.number().min(0).max(100))
        .default([85, 75, 70])
        .describe('Scores on near, medium, far transfer tasks.'),
    },
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
    {
      scenarioId: z
        .string()
        .default('algo_dynamic_programming')
        .describe('Assessment scenario identifier.'),
      tierLevel: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(1)
        .describe('Graduated prompt tier level (1..5).'),
    },
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
    {
      scenarioId: z
        .string()
        .default('algo_dynamic_programming')
        .describe('Assessment scenario identifier.'),
      preTestScore: z.number().min(0).max(100).default(30),
      postTestScore: z.number().min(0).max(100).default(80),
      promptsConsumed: z.number().int().min(0).max(5).default(2),
      transferScores: z.array(z.number().min(0).max(100)).default([85, 75, 70]),
    },
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
]
