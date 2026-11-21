/**
 * Learning HUB headless server — ADVANCED routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CANONICAL_SKILLS,
  auditCodeAgainstAgentsRules,
  executeSkillSimulation,
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
  computeThresholdSignificanceIndex,
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
  DialogueTurn,
  CANONICAL_SCIENTIFIC_DEBATES,
  evaluateCERArgument,
  generateAdversarialCounterArgument,
  generateCERFSRSDeck,
  CERArgumentSubmission,
  CERArgumentSubmissionSchema,
} from '@learning-hub/core'
import { sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

const skillsCatalogQuerySchema = z.object({
  category: z.string().optional(),
})

const skillsAuditBodySchema = z.object({
  code: z.string().min(1),
  file: z.string().min(1),
})

const skillsRunBodySchema = z.object({
  skillName: z.string().min(1),
  topic: z.string().min(1).default('Autonomous Drill'),
  context: z.string().optional(),
})

const relearningSavingsBodySchema = z.object({
  initialLearningSeconds: z.number().positive(),
  relearningSeconds: z.number().positive(),
  daysElapsed: z.number().positive().default(7),
  initialTrialsCount: z.number().int().min(1).default(3),
})

const srlEvaluateBodySchema = z.object({
  forethoughtScore: z.number().min(0).max(10),
  performanceScore: z.number().min(0).max(10),
  reflectionScore: z.number().min(0).max(10),
  challengeId: z.string().optional(),
})

const epistemicAnalyzeBodySchema = z.object({
  discourseTexts: z.array(z.string()).min(1),
  baseMastery: z.number().min(0).max(1).default(0.75),
})

const causalCounterfactualBodySchema = z.object({
  evidence: z.record(z.string(), z.number()),
  interventions: z.record(z.string(), z.number()),
  targetVariableId: z.string().default('ExamScore'),
})

const thresholdLiminalBodySchema = z.object({
  conceptId: z.string().default('tc_pointers_memory'),
  probeResponses: z.record(z.string(), z.string()),
  baseMastery: z.number().min(0).max(1).default(0.75),
})

const pfEvaluateBodySchema = z.object({
  scenarioId: z.string().default('pf-variance-dispersion'),
  title: z.string().default('Intuitive Hypothesis'),
  description: z.string().default(''),
  mechanism: z.string().default(''),
  structuralFeatures: z.array(z.string()).default([]),
})

const pfMetricsBodySchema = z.object({
  scenarioId: z.string().default('pf-variance-dispersion'),
  representationCount: z.number().int().min(1).max(10).default(3),
  impasseEncountered: z.boolean().default(true),
  affectiveImpasseRating: z.number().min(1).max(5).default(4),
  impasseDepthScore: z.number().min(0).max(100).default(75),
  featureAlignment: z.number().min(0).max(100).default(85),
  parameterMapping: z.number().min(0).max(100).default(80),
  invariantGrasp: z.number().min(0).max(100).default(80),
  transferSuccessCount: z.number().int().min(0).max(3).default(3),
})

const pfDeckBodySchema = z.object({
  scenarioId: z.string().default('pf-variance-dispersion'),
  pfiScore: z.number().min(0).max(100).default(85),
  cigScore: z.number().min(0).max(100).default(80),
})

const piDialogueBodySchema = z.object({
  suiteId: z.string().default('ct-thermal-expansion-plate'),
})

const piEvaluateBodySchema = z.object({
  suiteId: z.string().default('ct-thermal-expansion-plate'),
  q1InitialOptionId: z.string().optional(),
  q1InitialConfidence: z.number().min(1).max(5).default(3),
  q1RevoteOptionId: z.string().optional(),
  q1RevoteConfidence: z.number().min(1).max(5).default(4),
  q2TransferOptionId: z.string().optional(),
  peerDiscussionOccurred: z.boolean().default(true),
  vote1AccuracyPct: z.number().min(0).max(100).default(38),
  vote2AccuracyPct: z.number().min(0).max(100).default(82),
})

const piDeckBodySchema = z.object({
  suiteId: z.string().default('ct-thermal-expansion-plate'),
  hakeGain: z.number().min(0).max(1).default(0.75),
  isomorphicCorrect: z.boolean().default(true),
})

const inquiryTrialBodySchema = z.object({
  labId: z.string().default('lab-pendulum-period'),
  trialIndex: z.number().int().nonnegative().default(0),
  variableSettings: z.record(z.string(), z.number()).default({}),
  previousSettings: z.record(z.string(), z.number()).optional(),
})

const inquiryEvaluateBodySchema = z.object({
  labId: z.string().default('lab-pendulum-period'),
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
})

const inquiryDeckBodySchema = z.object({
  labId: z.string().default('lab-pendulum-period'),
  sdiScore: z.number().min(0).max(100).default(85),
})

const rtPeerBodySchema = z.object({
  passageId: z.string().default('passage-endosymbiosis'),
  preferredRole: z.enum(['questioner', 'clarifier', 'summarizer', 'predictor']).optional(),
  userText: z.string().default('What structural evidence proves endosymbiosis?'),
})

const rtEvaluateBodySchema = z.object({
  passageId: z.string().default('passage-endosymbiosis'),
  turns: z
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
        text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial?',
      },
    ]),
})

const rtDeckBodySchema = z.object({
  passageId: z.string().default('passage-endosymbiosis'),
  sampleText: z.string().default('Cardiolipin proves endosymbiosis because eukaryotes lack it.'),
})

const cerCounterBodySchema = z.object({
  debateId: z.string().default('debate-amoc-tipping'),
  claimId: z.string().default('claim-amoc-tipping-near'),
})

// Payload shape owned by core (C8); the route only layers its demo defaults on top.
const cerEvaluateBodySchema = CERArgumentSubmissionSchema.extend({
  debateId: CERArgumentSubmissionSchema.shape.debateId.default('debate-amoc-tipping'),
  selectedClaimId:
    CERArgumentSubmissionSchema.shape.selectedClaimId.default('claim-amoc-tipping-near'),
  claimStatement: CERArgumentSubmissionSchema.shape.claimStatement.default(
    'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
  ),
  selectedEvidenceIds: CERArgumentSubmissionSchema.shape.selectedEvidenceIds.default([
    'ev-amoc-sst-autocorr',
    'ev-amoc-paleo-glacier',
    'ev-amoc-cmip6-bias',
  ]),
  userEvidenceSynthesis: CERArgumentSubmissionSchema.shape.userEvidenceSynthesis.default(
    'Subpolar SST fingerprints exhibit critical slowing down with increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
  ),
  selectedPrincipleIds: CERArgumentSubmissionSchema.shape.selectedPrincipleIds.default([
    'princ-salt-advection',
    'princ-critical-slowing',
  ]),
  userReasoningStatement: CERArgumentSubmissionSchema.shape.userReasoningStatement.default(
    'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
  ),
  targetedCounterArgumentId:
    CERArgumentSubmissionSchema.shape.targetedCounterArgumentId.default('counter-amoc-rapid'),
  userRebuttalStatement: CERArgumentSubmissionSchema.shape.userRebuttalStatement.default(
    'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
  ),
})

const cerDeckBodySchema = z.object({
  debateId: z.string().default('debate-amoc-tipping'),
  ersBaseline: z.number().min(0).max(100).default(85),
})

// Payload shape owned by core (C8); the route only layers its demo defaults on top.

/** GET /cognitive/skills/catalog — lists canonical agent skills */
async function getSkillsCatalog(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, skillsCatalogQuerySchema)
  const skills = Object.values(CANONICAL_SKILLS)
  const filtered = q.category
    ? skills.filter((s) => s.meta.category.toLowerCase() === q.category!.toLowerCase())
    : skills
  sendJson(res, 200, {
    ok: true,
    count: filtered.length,
    skills: filtered.map((s) => ({
      name: s.meta.name,
      title: s.meta.title,
      category: s.meta.category,
      description: s.meta.description,
      parameters: s.parameters,
      phases: s.phases.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    })),
  })
}

/** POST /cognitive/skills/audit — audits code against AGENTS.md rules */
/** POST /cognitive/skills/audit — audits code against AGENTS.md rules */
async function postSkillsAudit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, skillsAuditBodySchema)
  const violations = auditCodeAgainstAgentsRules(body.code, body.file)
  sendJson(res, 200, {
    ok: true,
    file: body.file,
    violationsCount: violations.length,
    violations,
  })
}

/** POST /cognitive/skills/run — simulates execution of an autonomous skill drill */
/** POST /cognitive/skills/run — simulates execution of an autonomous skill drill */
async function postSkillsRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, skillsRunBodySchema)
  const skill = CANONICAL_SKILLS[body.skillName] ?? Object.values(CANONICAL_SKILLS)[0]!
  const simulation = executeSkillSimulation(skill.meta.name, {
    topic: body.topic,
    context: body.context ?? '',
  })
  sendJson(res, 200, {
    ok: true,
    skill: skill.meta.name,
    clarityIndex: simulation.clarityIndex,
    rigorScore: simulation.rigorScore,
    rawOutput: simulation.rawOutput,
    ambiguitiesResolved: simulation.ambiguitiesResolved,
    assumptionsSurfaced: simulation.assumptionsSurfaced,
  })
}

/** POST /cognitive/relearning/savings — calculates Rawson & Dunlosky Ebbinghaus savings */
/** POST /cognitive/relearning/savings — calculates Rawson & Dunlosky Ebbinghaus savings */
async function postRelearningSavings(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, relearningSavingsBodySchema)
  const savings = calculateEbbinghausSavings(body.initialLearningSeconds, body.relearningSeconds)
  const retention = predictRetentionAtDays(0.1, body.daysElapsed)
  const stability = calibrateFSRSStability(0.08)
  const difficulty = calibrateFSRSDifficulty(body.initialTrialsCount, 1)
  sendJson(res, 200, {
    ok: true,
    savingsPercentage: savings,
    predictedRetention: Math.round(retention * 100),
    calibratedFSRS: {
      stabilityDays: stability,
      difficultyScale: difficulty,
    },
    recommendation:
      savings >= 50
        ? 'Robust Ebbinghaus memory savings achieved. Safe to expand review interval by 2.5x.'
        : 'Sub-threshold memory savings. Additional successive retrieval trial recommended.',
  })
}

/** POST /cognitive/srl/evaluate — Zimmerman 3-phase cyclical SRL matrix */
/** POST /cognitive/srl/evaluate — Zimmerman 3-phase cyclical SRL matrix */
async function postSrlEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, srlEvaluateBodySchema)
  const index = calculateSRLMaturityIndex(
    body.forethoughtScore,
    body.performanceScore,
    body.reflectionScore,
  )
  const tier = evaluateSRLMaturityTier(index)
  const gas = calculateGoalAttainmentScale(
    body.performanceScore / 10,
    body.reflectionScore >= 6,
    body.forethoughtScore / 10,
  )
  const challenge = body.challengeId ? CALIBRATED_SRL_CHALLENGES[body.challengeId] : null
  sendJson(res, 200, {
    ok: true,
    maturityIndex: index,
    maturityTier: tier,
    goalAttainmentScale: gas,
    challenge: challenge
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
}

/** POST /cognitive/epistemic/analyze — Shaffer Epistemic Network Analysis */
/** POST /cognitive/epistemic/analyze — Shaffer Epistemic Network Analysis */
async function postEpistemicAnalyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, epistemicAnalyzeBodySchema)
  const utterances = body.discourseTexts.map((text, idx) => ({
    id: `server_utt_${idx}`,
    unitId: 'server_unit',
    conversationId: 'server_conv',
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
    'server_ena_model',
    'REST Discourse Analysis',
    'Cognitive Systems',
    utterances,
  )
  const bridge = bridgeEpistemicToCurriculum(model, body.baseMastery)
  sendJson(res, 200, {
    ok: true,
    networkDensity: model.network.networkDensity,
    overallMaturityScore: model.overallMaturityScore,
    dimension1Coord: model.projection.dimension1Coord,
    dimension2Coord: model.projection.dimension2Coord,
    epistemicInterpretation: model.projection.epistemicInterpretation,
    curriculumTransferMultiplier: bridge.transferMultiplier,
    modulatedMastery: bridge.modulatedMastery,
    subtractiveGapsCount: model.subtractiveGaps.length,
  })
}

/** POST /cognitive/causal/counterfactual — Pearl SCM & counterfactual evaluation */
/** POST /cognitive/causal/counterfactual — Pearl SCM & counterfactual evaluation */
async function postCausalCounterfactual(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, causalCounterfactualBodySchema)
  const model = createStandardEducationSCM()
  const result = evaluateCounterfactual(model, {
    modelId: model.id,
    evidence: body.evidence,
    interventions: body.interventions,
    targetVariableId: body.targetVariableId,
  })
  const interventionKey = Object.keys(body.interventions)[0] ?? 'StudyHours'
  const backdoor = evaluateBackdoorAdmissibility(model, interventionKey, body.targetVariableId, [
    'Aptitude',
  ])
  const dsep = checkDSeparation(model, interventionKey, body.targetVariableId, ['Aptitude'])
  sendJson(res, 200, {
    ok: true,
    factualValue: result.factualValue,
    counterfactualValue: result.counterfactualValue,
    causalLift: result.causalLift,
    exogenousStates: result.exogenousStates,
    narrativeExplanation: result.narrativeExplanation,
    isBackdoorAdmissible: backdoor.isAdmissible,
    dSeparationPathsCount: dsep.paths.length,
  })
}

/** POST /cognitive/threshold/liminal — Meyer & Land threshold concepts liminal evaluation */
/** POST /cognitive/threshold/liminal — Meyer & Land threshold concepts liminal evaluation */
async function postThresholdLiminal(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, thresholdLiminalBodySchema)
  const concepts = getStandardThresholdConcepts()
  const concept = concepts.find((c) => c.id === body.conceptId) ?? concepts[0]!
  const diagnostic = evaluateLiminalTrajectory(concept.id, body.probeResponses)
  const bridge = bridgeThresholdToCurriculum(
    body.baseMastery,
    diagnostic.overallFluencyScore,
    diagnostic.phase,
    concept.id,
  )
  const tsi = computeThresholdSignificanceIndex(concept.criteriaScores)
  sendJson(res, 200, {
    ok: true,
    concept: {
      id: concept.id,
      title: concept.title,
      discipline: concept.discipline,
      tsiScore: tsi,
      unlockedDownstreamConcepts: concept.unlockedDownstreamConcepts,
    },
    diagnostic: {
      phase: diagnostic.phase,
      canCrossPortal: diagnostic.canCrossPortal,
      overallFluencyScore: diagnostic.overallFluencyScore,
      mimicryRiskScore: diagnostic.mimicryRiskScore,
      oscillationStability: diagnostic.oscillationStability,
      prescribedRemediation: diagnostic.prescribedRemediation,
    },
    bridge: {
      gatewayMultiplier: bridge.gatewayMultiplier,
      modulatedMastery: bridge.modulatedMastery,
    },
  })
}

/** GET /cognitive/zpd/scenarios — list canonical ZPD scenarios */
/** GET /cognitive/zpd/scenarios — list canonical ZPD scenarios */
async function getZpdScenarios(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const scenarios = listZpdScenarios()
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      domain: s.domain,
      title: s.title,
      subtitle: s.subtitle,
      theoreticalCore: s.theoreticalCore,
    })),
  })
}

/** POST /cognitive/zpd/evaluate — evaluate ZPD metrics & learning potential */
/** POST /cognitive/zpd/evaluate — evaluate ZPD metrics & learning potential */
async function postZpdEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, ZpdEvaluationInputSchema)
  const scenario = getZpdScenarioById(body.scenarioId) || listZpdScenarios()[0]!
  const metrics = calculateZpdMetrics(
    body.preTestScore,
    body.postTestScore,
    body.promptsConsumed,
    body.transferScores,
  )
  sendJson(res, 200, {
    ok: true,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      domain: scenario.domain,
    },
    metrics,
  })
}

/** POST /cognitive/zpd/prompt — request graduated prompt at tier level */
/** POST /cognitive/zpd/prompt — request graduated prompt at tier level */
async function postZpdPrompt(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, ZpdPromptInputSchema)
  const scenario = getZpdScenarioById(body.scenarioId) || listZpdScenarios()[0]!
  const prompt = getGraduatedPromptAtTier(scenario.mediatedProblem, body.tierLevel)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    tierLevel: body.tierLevel,
    prompt: prompt ?? null,
  })
}

/** POST /cognitive/zpd/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/zpd/deck — generate calibrated FSRS-6 review deck */
async function postZpdDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, ZpdEvaluationInputSchema)
  const scenario = getZpdScenarioById(body.scenarioId) || listZpdScenarios()[0]!
  const metrics = calculateZpdMetrics(
    body.preTestScore,
    body.postTestScore,
    body.promptsConsumed,
    body.transferScores,
  )
  const deck = generateFSRSZpdDeck(scenario, metrics)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    metrics: {
      lps: metrics.learningPotentialScore,
      cmi: metrics.cognitiveModifiabilityIndex,
      typology: metrics.typology,
    },
    deck,
  })
}

/** GET /cognitive/pf/scenarios — list canonical Productive Failure scenarios */
/** GET /cognitive/pf/scenarios — list canonical Productive Failure scenarios */
async function getPFScenarios(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const scenarios = getCanonicalPFScenarios()
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      domain: s.domain,
      title: s.title,
      subtitle: s.subtitle,
      targetConcept: s.targetConcept,
    })),
  })
}

/** POST /cognitive/pf/evaluate — evaluate student representation against invariants */
/** POST /cognitive/pf/evaluate — evaluate student representation against invariants */
async function postPFEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, pfEvaluateBodySchema)
  const scenario = getPFScenarioById(body.scenarioId) || getCanonicalPFScenarios()[0]!
  const representation = evaluateStudentRepresentation(scenario.id, {
    title: body.title,
    description: body.description,
    mechanism: body.mechanism,
    structuralFeatures: body.structuralFeatures,
  })
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    representation,
  })
}

/** POST /cognitive/pf/metrics — compute quantitative Productive Failure metrics */
/** POST /cognitive/pf/metrics — compute quantitative Productive Failure metrics */
async function postPFMetrics(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, pfMetricsBodySchema)
  const scenario = getPFScenarioById(body.scenarioId) || getCanonicalPFScenarios()[0]!
  const representations = scenario.exemplarStudentRepresentations.slice(0, body.representationCount)
  const impasse = {
    impasseEncountered: body.impasseEncountered,
    failureModeIdentified: 'Boundary distortion breakdown',
    boundaryConditionsTested: ['Outliers', 'Zeros'],
    knowledgeGapArticulated: 'Need canonical invariant parameterization',
    affectiveImpasseRating: body.affectiveImpasseRating,
    impasseDepthScore: body.impasseDepthScore,
  }
  const consolidationRatings = {
    featureAlignment: body.featureAlignment,
    parameterMapping: body.parameterMapping,
    invariantGrasp: body.invariantGrasp,
  }
  const transferResults = scenario.transferProbes.map((probe, idx) => ({
    probeId: probe.probeId,
    isCorrect: idx < body.transferSuccessCount,
    confidence: 4,
  }))

  const metrics = calculatePFMetrics({
    representations,
    impasse,
    consolidationRatings,
    transferResults,
  })

  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    metrics,
  })
}

/** POST /cognitive/pf/deck — generate calibrated FSRS-6 deck */
/** POST /cognitive/pf/deck — generate calibrated FSRS-6 deck */
async function postPFDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, pfDeckBodySchema)
  const scenario = getPFScenarioById(body.scenarioId) || getCanonicalPFScenarios()[0]!
  const dummyMetrics = calculatePFMetrics({
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
      featureAlignment: body.cigScore,
      parameterMapping: body.cigScore,
      invariantGrasp: body.cigScore,
    },
    transferResults: scenario.transferProbes.map((p) => ({
      probeId: p.probeId,
      isCorrect: true,
      confidence: 4,
    })),
  })
  const deck = generatePFFSRSCards(scenario, dummyMetrics)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    cardsCount: deck.length,
    initialStabilityDays: deck[0]?.initialStabilityDays,
    initialDifficulty: deck[0]?.initialDifficulty,
    deck,
  })
}

/** GET /cognitive/pi/conceptests — list canonical ConcepTest suites */
/** GET /cognitive/pi/conceptests — list canonical ConcepTest suites */
async function getPIConceptests(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const suites = getCanonicalConcepTestSuites()
  sendJson(res, 200, {
    ok: true,
    suites: suites.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      subtitle: s.subtitle,
      canonicalInvariant: s.canonicalInvariant,
      q1Prompt: s.q1Prompt,
      q2IsomorphicPrompt: s.q2IsomorphicPrompt,
      peerDialogueCount: s.simulatedPeers.length,
    })),
  })
}

/** POST /cognitive/pi/dialogue — retrieve simulated peer discussion dialogue */
/** POST /cognitive/pi/dialogue — retrieve simulated peer discussion dialogue */
async function postPIDialogue(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, piDialogueBodySchema)
  const suite = getConcepTestSuiteById(body.suiteId) ?? getCanonicalConcepTestSuites()[0]!
  sendJson(res, 200, {
    ok: true,
    suiteId: suite.id,
    suiteTitle: suite.title,
    classroomVoteDistribution: suite.q1ClassroomVoteDistribution,
    simulatedPeers: suite.simulatedPeers,
  })
}

/** POST /cognitive/pi/evaluate — evaluate peer instruction trajectory metrics (Hake g, Mazur PI, DCR, ITP) */
/** POST /cognitive/pi/evaluate — evaluate peer instruction trajectory metrics (Hake g, Mazur PI, DCR, ITP) */
async function postPIEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, piEvaluateBodySchema)
  const suite = getConcepTestSuiteById(body.suiteId) ?? getCanonicalConcepTestSuites()[0]!

  const q1Correct = suite.q1Options.find((o) => o.isCorrect)?.id
  const q2Correct = suite.q2Options.find((o) => o.isCorrect)?.id

  const q1Initial = body.q1InitialOptionId ?? suite.q1Options[0]!.id
  const q1Revote = body.q1RevoteOptionId ?? q1Correct ?? q1Initial
  const q2Transfer = body.q2TransferOptionId ?? q2Correct ?? suite.q2Options[0]!.id

  const metrics = calculatePIMetrics({
    suite,
    q1InitialOptionId: q1Initial,
    q1InitialConfidence: body.q1InitialConfidence,
    q1RevoteOptionId: q1Revote,
    q1RevoteConfidence: body.q1RevoteConfidence,
    q2TransferOptionId: q2Transfer,
    peerDiscussionOccurred: body.peerDiscussionOccurred,
    simulatedClassroomAccuracyVote1: body.vote1AccuracyPct,
    simulatedClassroomAccuracyVote2: body.vote2AccuracyPct,
  })

  sendJson(res, 200, {
    ok: true,
    suiteTitle: suite.title,
    metrics,
  })
}

/** POST /cognitive/pi/deck — generate calibrated FSRS-6 ConcepTest flashcards */
/** POST /cognitive/pi/deck — generate calibrated FSRS-6 ConcepTest flashcards */
async function postPIDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, piDeckBodySchema)
  const suite = getConcepTestSuiteById(body.suiteId) ?? getCanonicalConcepTestSuites()[0]!
  const dummyMetrics = calculatePIMetrics({
    suite,
    q1InitialOptionId: suite.q1Options[0]!.id,
    q1InitialConfidence: 3,
    q1RevoteOptionId: suite.q1Options.find((o) => o.isCorrect)!.id,
    q1RevoteConfidence: 5,
    q2TransferOptionId: body.isomorphicCorrect
      ? suite.q2Options.find((o) => o.isCorrect)!.id
      : suite.q2Options[0]!.id,
    peerDiscussionOccurred: true,
    simulatedClassroomAccuracyVote1: 35,
    simulatedClassroomAccuracyVote2: 85,
  })
  const cards = generatePIFSRSCards(suite, dummyMetrics)
  sendJson(res, 200, {
    ok: true,
    suiteTitle: suite.title,
    count: cards.length,
    cards,
  })
}

/** GET /cognitive/inquiry/labs — list canonical scientific discovery inquiry laboratories */
/** GET /cognitive/inquiry/labs — list canonical scientific discovery inquiry laboratories */
async function getInquiryLabs(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const labs = getCanonicalInquiryLabs()
  sendJson(res, 200, {
    ok: true,
    labs: labs.map((l) => ({
      id: l.id,
      title: l.title,
      domain: l.domain,
      subtitle: l.subtitle,
      researchQuestion: l.researchQuestion,
      canonicalInvariantLaw: l.canonicalInvariantLaw,
      independentVariables: l.independentVariables,
      dependentOutputs: l.dependentOutputs,
      anomalousScenariosCount: l.anomalousScenarios.length,
    })),
  })
}

/** POST /cognitive/inquiry/trial — execute simulation trial and check VOTAT isolation */
/** POST /cognitive/inquiry/trial — execute simulation trial and check VOTAT isolation */
async function postInquiryTrial(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, inquiryTrialBodySchema)
  const lab = getInquiryLabById(body.labId) ?? getCanonicalInquiryLabs()[0]!
  const trial = runInquiryTrial(lab, body.trialIndex, body.variableSettings, body.previousSettings)
  sendJson(res, 200, {
    ok: true,
    labId: lab.id,
    labTitle: lab.title,
    trial,
  })
}

/** POST /cognitive/inquiry/evaluate — evaluate SDDS discovery metrics (VOTAT, CBI, ADRI, SDI) */
/** POST /cognitive/inquiry/evaluate — evaluate SDDS discovery metrics (VOTAT, CBI, ADRI, SDI) */
async function postInquiryEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, inquiryEvaluateBodySchema)
  const lab = getInquiryLabById(body.labId) ?? getCanonicalInquiryLabs()[0]!

  const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
  const t2Settings =
    body.votatCompliantFraction >= 0.5
      ? { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 }
      : { length: 1.5, mass: 0.8, angle: 45, gravity: 9.81 }
  const t2 = runInquiryTrial(lab, 1, t2Settings, t1.variableSettings)

  const metrics = calculateInquiryMetrics({
    lab,
    trials: [t1, t2],
    anomalousSubmissions: [
      {
        anomalyId: lab.anomalousScenarios[0]?.id ?? 'a1',
        reaction: body.anomalousReaction,
        articulatedExplanation: 'Accommodated invariant schema',
      },
    ],
    falsificationTrialCount: body.falsificationTrialCount,
    finalHypothesisCapturesInvariant: body.finalHypothesisCapturesInvariant,
  })

  sendJson(res, 200, {
    ok: true,
    labTitle: lab.title,
    metrics,
  })
}

/** POST /cognitive/inquiry/deck — generate calibrated FSRS-6 review flashcards */
/** POST /cognitive/inquiry/deck — generate calibrated FSRS-6 review flashcards */
async function postInquiryDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, inquiryDeckBodySchema)
  const lab = getInquiryLabById(body.labId) ?? getCanonicalInquiryLabs()[0]!
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
        anomalyId: lab.anomalousScenarios[0]?.id ?? 'a1',
        reaction: body.sdiScore >= 70 ? 'theory_revision' : 'ignore',
        articulatedExplanation: 'Calibrated model',
      },
    ],
    falsificationTrialCount: 1,
    finalHypothesisCapturesInvariant: body.sdiScore >= 60,
  })
  const cards = generateInquiryFSRSCards(lab, dummyMetrics)
  sendJson(res, 200, {
    ok: true,
    labTitle: lab.title,
    count: cards.length,
    cards,
  })
}

/** GET /cognitive/rt/passages — list canonical text passages */
/** GET /cognitive/rt/passages — list canonical text passages */
async function getReciprocalPassages(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const passages = CANONICAL_TEXT_PASSAGES
  sendJson(res, 200, {
    ok: true,
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
}

/** POST /cognitive/rt/peer — generate Socratic peer response */
/** POST /cognitive/rt/peer — generate Socratic peer response */
async function postReciprocalPeer(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, rtPeerBodySchema)
  const passage =
    CANONICAL_TEXT_PASSAGES.find((p) => p.id === body.passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
  const history: DialogueTurn[] = [
    {
      id: 'turn-user-hist',
      speaker: 'user',
      role: 'questioner',
      turnIndex: 0,
      text: body.userText,
      timestamp: Date.now() - 5000,
      icapLevel: 'constructive',
      elaborationScore: 70,
    },
  ]
  const peerTurn = generatePeerDialogicTurn(passage, history, body.preferredRole)
  sendJson(res, 200, {
    ok: true,
    passageTitle: passage.title,
    peerRole: peerTurn.role,
    peerText: peerTurn.text,
    stemId: peerTurn.stemId,
    icapLevel: peerTurn.icapLevel,
  })
}

/** POST /cognitive/rt/evaluate — evaluate dialogue session (ICAP, RSBS, EDI, MRR, RDMS) */
/** POST /cognitive/rt/evaluate — evaluate dialogue session (ICAP, RSBS, EDI, MRR, RDMS) */
async function postReciprocalEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, rtEvaluateBodySchema)
  const passage =
    CANONICAL_TEXT_PASSAGES.find((p) => p.id === body.passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
  const turns: DialogueTurn[] = body.turns.map((r, i) => {
    const { icapLevel, causalScore } = classifyICAPEngagement(r.text, i > 0)
    return {
      id: `turn-eval-${i}`,
      speaker: 'user',
      role: r.role,
      turnIndex: i,
      text: r.text,
      timestamp: Date.now() - (body.turns.length - i) * 10000,
      icapLevel,
      elaborationScore: causalScore,
      resolvedMisconceptionId: r.resolvedMisconceptionId,
    }
  })
  const evaluation = evaluateReciprocalSession(turns, passage)
  sendJson(res, 200, {
    ok: true,
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
}

/** POST /cognitive/rt/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/rt/deck — generate calibrated FSRS-6 review deck */
async function postReciprocalDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, rtDeckBodySchema)
  const passage =
    CANONICAL_TEXT_PASSAGES.find((p) => p.id === body.passageId) ?? CANONICAL_TEXT_PASSAGES[0]!
  const turns: DialogueTurn[] = [
    {
      id: 'turn-sample',
      speaker: 'user',
      role: 'clarifier',
      turnIndex: 0,
      text: body.sampleText,
      timestamp: Date.now(),
      icapLevel: 'constructive',
      elaborationScore: 75,
    },
  ]
  const evaluation = evaluateReciprocalSession(turns, passage)
  const deck = generateReciprocalFSRSDeck(passage, turns, evaluation)
  sendJson(res, 200, {
    ok: true,
    passageTitle: passage.title,
    rdmsBaseline: deck.rdmsBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/cer/debates — list canonical scientific debate cases */
/** GET /cognitive/cer/debates — list canonical scientific debate cases */
async function getScientificDebates(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const debates = CANONICAL_SCIENTIFIC_DEBATES
  sendJson(res, 200, {
    ok: true,
    debates: debates.map((d) => ({
      id: d.id,
      title: d.title,
      domain: d.domain,
      phenomenon: d.phenomenonContext,
      claimsCount: d.competingClaims.length,
      evidenceCount: d.evidencePool.length,
      principlesCount: d.scientificPrinciples.length,
      countersCount: d.counterArguments.length,
    })),
  })
}

/** POST /cognitive/cer/counter — generate adversarial counter-argument */
/** POST /cognitive/cer/counter — generate adversarial counter-argument */
async function postCERCounter(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cerCounterBodySchema)
  const debate =
    CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === body.debateId) ??
    CANONICAL_SCIENTIFIC_DEBATES[0]!
  const counter = generateAdversarialCounterArgument(debate, body.claimId)
  sendJson(res, 200, {
    ok: true,
    debateTitle: debate.title,
    counterArgument: counter,
  })
}

/** POST /cognitive/cer/evaluate — evaluate CER argument telemetry */
/** POST /cognitive/cer/evaluate — evaluate CER argument telemetry */
async function postCEREvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cerEvaluateBodySchema)
  const debate =
    CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === body.debateId) ??
    CANONICAL_SCIENTIFIC_DEBATES[0]!
  const submission: CERArgumentSubmission = {
    debateId: debate.id,
    selectedClaimId: body.selectedClaimId,
    claimStatement: body.claimStatement,
    selectedEvidenceIds: body.selectedEvidenceIds,
    userEvidenceSynthesis: body.userEvidenceSynthesis,
    selectedPrincipleIds: body.selectedPrincipleIds,
    userReasoningStatement: body.userReasoningStatement,
    targetedCounterArgumentId: body.targetedCounterArgumentId,
    userRebuttalStatement: body.userRebuttalStatement,
  }
  const evaluation = evaluateCERArgument(debate, submission)
  sendJson(res, 200, {
    ok: true,
    debateTitle: debate.title,
    evaluation,
  })
}

/** POST /cognitive/cer/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/cer/deck — generate calibrated FSRS-6 review deck */
async function postCERDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cerDeckBodySchema)
  const debate =
    CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === body.debateId) ??
    CANONICAL_SCIENTIFIC_DEBATES[0]!
  const submission: CERArgumentSubmission = {
    debateId: debate.id,
    selectedClaimId: debate.competingClaims[0]!.id,
    claimStatement: debate.competingClaims[0]!.claim,
    selectedEvidenceIds: [debate.evidencePool[0]!.id],
    userEvidenceSynthesis: 'Primary empirical observational synthesis.',
    selectedPrincipleIds: [debate.scientificPrinciples[0]!.id],
    userReasoningStatement: 'Governing causal law links observational evidence to claim.',
    targetedCounterArgumentId: debate.counterArguments[0]?.id,
    userRebuttalStatement: 'Addressing counter-evidence with boundary conditions.',
  }
  const evaluation = evaluateCERArgument(debate, submission)
  const deck = generateCERFSRSDeck(debate, submission, evaluation)
  sendJson(res, 200, {
    ok: true,
    debateTitle: debate.title,
    ersBaseline: deck.ersBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/anchored/cases — list canonical anchored macrocontexts */

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const advancedRoutes: Route[] = [
  {
    method: 'GET',
    path: '/cognitive/skills/catalog',
    summary: 'canonical agent skills catalog (?category=)',
    handler: getSkillsCatalog,
  },
  {
    method: 'POST',
    path: '/cognitive/skills/audit',
    summary: 'audit code against AGENTS.md rules',
    handler: postSkillsAudit,
  },
  {
    method: 'POST',
    path: '/cognitive/skills/run',
    summary: 'simulate execution of an autonomous skill drill',
    handler: postSkillsRun,
  },
  {
    method: 'POST',
    path: '/cognitive/relearning/savings',
    summary: 'calculate Rawson & Dunlosky successive relearning & Ebbinghaus savings',
    handler: postRelearningSavings,
  },
  {
    method: 'POST',
    path: '/cognitive/srl/evaluate',
    summary: 'evaluate Zimmerman cyclical self-regulated learning (SRL) matrix',
    handler: postSrlEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/epistemic/analyze',
    summary: 'Shaffer epistemic network analysis (ENA) & quantitative ethnography',
    handler: postEpistemicAnalyze,
  },
  {
    method: 'POST',
    path: '/cognitive/causal/counterfactual',
    summary: 'Judea Pearl structural causal models & counterfactual evaluation',
    handler: postCausalCounterfactual,
  },
  {
    method: 'POST',
    path: '/cognitive/threshold/liminal',
    summary: 'Meyer & Land threshold concepts & liminal navigation evaluation',
    handler: postThresholdLiminal,
  },
  {
    method: 'GET',
    path: '/cognitive/zpd/scenarios',
    summary: 'list Vygotsky & Feuerstein canonical dynamic assessment scenarios',
    handler: getZpdScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/zpd/evaluate',
    summary: 'evaluate ZPD actual/potential levels, Budoff LPS, and Feuerstein CMI',
    handler: postZpdEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/zpd/prompt',
    summary: 'retrieve Campione & Brown 5-tier graduated prompt',
    handler: postZpdPrompt,
  },
  {
    method: 'POST',
    path: '/cognitive/zpd/deck',
    summary: 'generate FSRS-6 review deck with stability scaled by learning potential',
    handler: postZpdDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/pf/scenarios',
    summary: 'list Manu Kapur & Tanmay Sinha canonical productive failure scenarios',
    handler: getPFScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/pf/evaluate',
    summary: 'evaluate intuitive student-generated representation against invariants',
    handler: postPFEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/pf/metrics',
    summary: 'compute quantitative productive failure metrics (PFI, GDI, ISS, CIG, ATS)',
    handler: postPFMetrics,
  },
  {
    method: 'POST',
    path: '/cognitive/pf/deck',
    summary: 'generate calibrated FSRS-6 review deck scaled by productive failure index',
    handler: postPFDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/pi/conceptests',
    summary: 'list canonical ConcepTest suites for peer instruction',
    handler: getPIConceptests,
  },
  {
    method: 'POST',
    path: '/cognitive/pi/dialogue',
    summary: 'retrieve simulated peer deliberation dialogue for ConcepTest suite',
    handler: postPIDialogue,
  },
  {
    method: 'POST',
    path: '/cognitive/pi/evaluate',
    summary: 'evaluate peer instruction trajectory metrics (Hake g, Mazur PI, DCR, ITP)',
    handler: postPIEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/pi/deck',
    summary: 'generate calibrated FSRS-6 review deck for ConcepTest suite',
    handler: postPIDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/inquiry/labs',
    summary: 'list canonical scientific discovery inquiry laboratories',
    handler: getInquiryLabs,
  },
  {
    method: 'POST',
    path: '/cognitive/inquiry/trial',
    summary: 'execute simulation trial and check VOTAT isolation',
    handler: postInquiryTrial,
  },
  {
    method: 'POST',
    path: '/cognitive/inquiry/evaluate',
    summary: 'evaluate SDDS discovery metrics (VOTAT, CBI, ADRI, SDI)',
    handler: postInquiryEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/inquiry/deck',
    summary: 'generate calibrated FSRS-6 review flashcards for inquiry lab',
    handler: postInquiryDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/rt/passages',
    summary: 'list canonical complex text passages for reciprocal teaching',
    handler: getReciprocalPassages,
  },
  {
    method: 'POST',
    path: '/cognitive/rt/peer',
    summary: 'generate responsive Socratic peer dialogic response (Palincsar scaffolding)',
    handler: postReciprocalPeer,
  },
  {
    method: 'POST',
    path: '/cognitive/rt/evaluate',
    summary: 'evaluate reciprocal dialogue session (ICAP, RSBS, EDI, MRR, RDMS)',
    handler: postReciprocalEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/rt/deck',
    summary: 'generate calibrated FSRS-6 review deck for reciprocal dialogue session',
    handler: postReciprocalDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/cer/debates',
    summary: 'list canonical scientific debate cases for claim-evidence-reasoning',
    handler: getScientificDebates,
  },
  {
    method: 'POST',
    path: '/cognitive/cer/counter',
    summary: 'generate adversarial Toulmin counter-argument for chosen claim',
    handler: postCERCounter,
  },
  {
    method: 'POST',
    path: '/cognitive/cer/evaluate',
    summary: 'evaluate CER argument telemetry (CCS, EQI, RDI, TAP level, ERS)',
    handler: postCEREvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/cer/deck',
    summary: 'generate calibrated FSRS-6 review deck for scientific debate',
    handler: postCERDeck,
  },
]
