/**
 * Learning HUB headless server — STUDIOS routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CANONICAL_MACROCONTEXT_CASES,
  evaluateAnchoredSolution,
  simulateAnchoredSensitivity,
  generateAnchoredFSRSDeck,
  LearnerSolutionSubmission,
  LearnerSolutionSubmissionSchema,
  CANONICAL_CONTRASTING_SETS,
  evaluateContrastingAttempt,
  generateContrastingFSRSDeck,
  InventedMetricSubmission,
  InventedMetricSubmissionSchema,
  CANONICAL_COLLABORATIVE_SCENARIOS,
  evaluateCollaborativeDiscourse,
  generateCollaborativePeerTurn,
  generateCollaborativeFSRSDeck,
  DiscourseSubmission,
  DiscourseSubmissionSchema,
  CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  evaluateLearnerModel,
  generateSystemDynamicsFSRSDeck,
  runEulerSimulation,
  LearnerModelHypothesis,
  listGedankenScenarios,
  perturbExtremeCase,
  simulateMentalAnimation,
  evaluateInquirySession,
  generateModelInquiryFsrsDeck,
  InquirySessionInput,
  InquirySessionInputSchema,
  CANONICAL_CATEGORIZATION_SETS,
  categorizationSubmissionSchema,
  evaluateCategorizationSession,
  findCategorySet,
  generateCategorizationDeck,
  planCategorizationStudy,
  planDiscriminatingBlock,
  studyPlanOptionsSchema,
  studyPlanSessionSchema,
  StudyPlan,
  listMicroWorldScenarios,
  simulateMicroWorldStep,
  evaluateCPSSession,
  generateCPSFSRSDeck,
  MicroWorldStateSchema,
} from '@learning-hub/core'
import { sendJson, readJson } from '../http'
import type { Route } from './shared'

const anchoredEvaluateBodySchema = LearnerSolutionSubmissionSchema.extend({
  caseId: LearnerSolutionSubmissionSchema.shape.caseId.default('case-jasper-flight'),
  extractedDataValues: LearnerSolutionSubmissionSchema.shape.extractedDataValues.default({}),
  subGoalSequence: LearnerSolutionSubmissionSchema.shape.subGoalSequence.default([]),
  calculatedSubGoalOutputs: LearnerSolutionSubmissionSchema.shape.calculatedSubGoalOutputs.default(
    {},
  ),
  finalDecisionChoice:
    LearnerSolutionSubmissionSchema.shape.finalDecisionChoice.default('choice-direct-flight'),
  decisionJustification: LearnerSolutionSubmissionSchema.shape.decisionJustification.default(
    'Standard navigation flight plan.',
  ),
})

const anchoredSensitivityBodySchema = z.object({
  caseId: z.string().default('case-jasper-flight'),
  parameterId: z.string().default('data-headwind-speed'),
  variedValue: z.number().default(25),
})

const anchoredDeckBodySchema = z.object({
  caseId: z.string().default('case-jasper-flight'),
  ikrsBaseline: z.number().min(0).max(100).default(85),
})

// Payload shape owned by core (C8); the route only layers its demo defaults on top.
// impasseEncountered (default true) is inherited from the core schema.
const contrastingEvaluateBodySchema = InventedMetricSubmissionSchema.extend({
  setId: InventedMetricSubmissionSchema.shape.setId.default('set-density-buoyancy'),
  inventedMetricName:
    InventedMetricSubmissionSchema.shape.inventedMetricName.default('Density Ratio Invariant'),
  formulaDescription: InventedMetricSubmissionSchema.shape.formulaDescription.default(
    'Ratio of object mass to displacement volume across contrasting variants.',
  ),
  selectedDimensionIds: InventedMetricSubmissionSchema.shape.selectedDimensionIds.default([
    'dim-mass',
    'dim-volume',
  ]),
  variantRankings: InventedMetricSubmissionSchema.shape.variantRankings.default([]),
  reflectionNotes: InventedMetricSubmissionSchema.shape.reflectionNotes.default(
    'Noticed that volume or mass alone fails, but mass/volume coordinates cases.',
  ),
})

const contrastingDeckBodySchema = z.object({
  setId: z.string().default('set-density-buoyancy'),
  cdtsBaseline: z.number().min(0).max(100).default(85),
})

const collaborativePartnerBodySchema = z.object({
  scenarioId: z.string().default('collab-neuro-synaptic-plasticity'),
  learnerTurnText: z.string().default('Initial question regarding stability.'),
  turnIndex: z.number().int().min(0).default(0),
})

// Payload shape owned by core (C8); the route only layers its demo defaults on top.
const collaborativeEvaluateBodySchema = DiscourseSubmissionSchema.extend({
  scenarioId: DiscourseSubmissionSchema.shape.scenarioId.default(
    'collab-neuro-synaptic-plasticity',
  ),
  learnerInitialPosition: DiscourseSubmissionSchema.shape.learnerInitialPosition.default(
    'Initial framing position.',
  ),
  dialogueTurns: DiscourseSubmissionSchema.shape.dialogueTurns.default([]),
  jointSynthesis: DiscourseSubmissionSchema.shape.jointSynthesis.default(
    'Joint invariant reconciliation statement.',
  ),
  individualTransferAnswer: DiscourseSubmissionSchema.shape.individualTransferAnswer.default(
    'Transfer generalization application.',
  ),
})

const collaborativeDeckBodySchema = z.object({
  scenarioId: z.string().default('collab-neuro-synaptic-plasticity'),
  ceiBaseline: z.number().min(0).max(100).default(85),
})

const systemDynamicsSimulateBodySchema = z.object({
  scenarioId: z.string().default('climate-permafrost-methane'),
  stepsCount: z.number().int().min(5).max(300).default(50),
  dt: z.number().min(0.01).max(10).default(1.0),
  policyMultipliers: z.record(z.string(), z.number()).optional(),
})

const systemDynamicsEvaluateBodySchema = z.object({
  scenarioId: z.string().default('climate-permafrost-methane'),
  classifiedVariables: z
    .array(
      z.object({
        id: z.string(),
        nature: z.enum(['stock', 'flow', 'auxiliary', 'parameter']),
      }),
    )
    .default([]),
  identifiedLoops: z
    .array(
      z.object({
        id: z.string(),
        polarity: z.enum(['reinforcing', 'balancing']),
        elementIds: z.array(z.string()),
        delayIdentified: z.boolean(),
      }),
    )
    .default([]),
  identifiedArchetype: z
    .enum([
      'limits_to_growth',
      'shifting_the_burden',
      'tragedy_of_the_commons',
      'fixes_that_fail',
      'eroding_goals',
      'escalation',
    ])
    .default('limits_to_growth'),
  proposedHighLeverageIntervention: z
    .string()
    .default('Rewire system rules and information channels.'),
  predictedBehavior: z
    .enum([
      'exponential_growth',
      's_shaped_growth',
      'overshoot_and_collapse',
      'damped_oscillation',
      'asymptotic_stability',
    ])
    .default('overshoot_and_collapse'),
})

const systemDynamicsDeckBodySchema = z.object({
  scenarioId: z.string().default('climate-permafrost-methane'),
  sdiBaseline: z.number().min(0).max(100).default(85),
})

const modelInquiryPerturbBodySchema = z.object({
  scenarioId: z.string().default('galileo_falling_bodies'),
  extremeCaseId: z.string().default('ec_feather_cannonball'),
  parameterLimit: z.string().optional(),
})

const modelInquirySimulateBodySchema = z.object({
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
})

// Payload shape owned by core (C8); the route adds only the scenario default.
const modelInquiryEvaluateBodySchema = InquirySessionInputSchema.extend({
  scenarioId: InquirySessionInputSchema.shape.scenarioId.default('galileo_falling_bodies'),
})

const modelInquiryDeckBodySchema = z.object({
  scenarioId: z.string().default('galileo_falling_bodies'),
})

// Payload shapes owned by core; the route only layers its schedule defaults.
const prototypeExemplarPlanBodySchema = z.object({
  setId: z.string().default('proto-bird-typicality'),
  maxTrials: z.number().int().min(1).max(24).default(6),
  sessions: studyPlanSessionSchema.array().max(500).default([]),
  scheduleOptions: studyPlanOptionsSchema.omit({ now: true }).partial().default({}),
  now: z.string().optional(),
})

const prototypeExemplarDeckBodySchema = z.object({
  setId: z.string().default('proto-bird-typicality'),
  criBaseline: z.number().min(0).max(100).default(50),
})

const cpsStepBodySchema = z.object({
  scenarioId: z.string().default('tanaland_desert_ecosystem'),
  currentState: MicroWorldStateSchema,
  selectedPolicyIds: z.array(z.string()).default([]),
  inspectedVariableIds: z.array(z.string()).default([]),
})

const cpsEvaluateBodySchema = z.object({
  scenarioId: z.string().default('tanaland_desert_ecosystem'),
  finalState: MicroWorldStateSchema,
})

const cpsDeckBodySchema = z.object({
  scenarioId: z.string().default('tanaland_desert_ecosystem'),
})

/** GET /cognitive/anchored/cases — list canonical anchored macrocontexts */
async function getAnchoredCases(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cases = CANONICAL_MACROCONTEXT_CASES
  sendJson(res, 200, {
    ok: true,
    cases: cases.map((c) => ({
      id: c.id,
      title: c.title,
      domain: c.domain,
      difficulty: c.difficulty,
      missionGoal: c.missionGoal,
      embeddedDataCount: c.embeddedData.length,
      subGoalsCount: c.subGoalHierarchy.length,
      constraintsCount: c.constraints.length,
    })),
  })
}

/** POST /cognitive/anchored/evaluate — evaluate situated problem-solving trajectory */
/** POST /cognitive/anchored/evaluate — evaluate situated problem-solving trajectory */
async function postAnchoredEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, anchoredEvaluateBodySchema)
  const macroCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === body.caseId) ??
    CANONICAL_MACROCONTEXT_CASES[0]!
  const submission: LearnerSolutionSubmission = {
    caseId: macroCase.id,
    extractedDataValues: body.extractedDataValues,
    subGoalSequence: body.subGoalSequence,
    calculatedSubGoalOutputs: body.calculatedSubGoalOutputs,
    finalDecisionChoice: body.finalDecisionChoice,
    decisionJustification: body.decisionJustification,
  }
  const evaluation = evaluateAnchoredSolution(macroCase, submission)
  sendJson(res, 200, {
    ok: true,
    caseTitle: macroCase.title,
    evaluation,
  })
}

/** POST /cognitive/anchored/sensitivity — what-if sensitivity simulator */
/** POST /cognitive/anchored/sensitivity — what-if sensitivity simulator */
async function postAnchoredSensitivity(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, anchoredSensitivityBodySchema)
  const macroCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === body.caseId) ??
    CANONICAL_MACROCONTEXT_CASES[0]!
  const simulation = simulateAnchoredSensitivity(macroCase, body.parameterId, body.variedValue)
  sendJson(res, 200, {
    ok: true,
    simulation,
  })
}

/** POST /cognitive/anchored/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/anchored/deck — generate calibrated FSRS-6 review deck */
async function postAnchoredDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, anchoredDeckBodySchema)
  const macroCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === body.caseId) ??
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
  evaluation.ikrs = body.ikrsBaseline
  const deck = generateAnchoredFSRSDeck(macroCase, evaluation)
  sendJson(res, 200, {
    ok: true,
    caseTitle: macroCase.title,
    ikrsBaseline: deck.ikrsBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/contrasting/sets — list canonical contrasting cases and invention sets */
/** GET /cognitive/contrasting/sets — list canonical contrasting cases and invention sets */
async function getContrastingSets(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sets = CANONICAL_CONTRASTING_SETS
  sendJson(res, 200, {
    ok: true,
    sets: sets.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      difficulty: s.difficulty,
      problemOverview: s.problemOverview,
      variantsCount: s.variants.length,
      dimensionsCount: s.dimensions.length,
      canonicalGoal: s.canonicalTelling.formalLawName,
      canonicalEquation: s.canonicalTelling.formalEquation,
    })),
  })
}

/** POST /cognitive/contrasting/evaluate — evaluate contrasting cases invention attempt */
/** POST /cognitive/contrasting/evaluate — evaluate contrasting cases invention attempt */
async function postContrastingEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, contrastingEvaluateBodySchema)
  const caseSet =
    CANONICAL_CONTRASTING_SETS.find((s) => s.id === body.setId) ?? CANONICAL_CONTRASTING_SETS[0]!
  const submission: InventedMetricSubmission = {
    setId: caseSet.id,
    inventedMetricName: body.inventedMetricName,
    formulaDescription: body.formulaDescription,
    selectedDimensionIds: body.selectedDimensionIds,
    variantRankings:
      body.variantRankings.length > 0
        ? body.variantRankings
        : [...caseSet.variants].sort((a, b) => a.outcomeValue - b.outcomeValue).map((v) => v.id),
    impasseEncountered: body.impasseEncountered,
    reflectionNotes: body.reflectionNotes,
  }
  const evaluation = evaluateContrastingAttempt(caseSet, submission)
  sendJson(res, 200, {
    ok: true,
    setTitle: caseSet.title,
    evaluation,
  })
}

/** POST /cognitive/contrasting/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/contrasting/deck — generate calibrated FSRS-6 review deck */
async function postContrastingDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, contrastingDeckBodySchema)
  const caseSet =
    CANONICAL_CONTRASTING_SETS.find((s) => s.id === body.setId) ?? CANONICAL_CONTRASTING_SETS[0]!
  const dummySubmission: InventedMetricSubmission = {
    setId: caseSet.id,
    inventedMetricName: 'Ratio Invariant',
    formulaDescription: 'Invariant ratio coordinating variants across dimensions.',
    selectedDimensionIds: caseSet.dimensions.filter((d) => d.isDeepDimension).map((d) => d.id),
    variantRankings: [...caseSet.variants]
      .sort((a, b) => a.outcomeValue - b.outcomeValue)
      .map((v) => v.id),
    impasseEncountered: true,
    reflectionNotes: 'Productive impasse generated prior to canonical lecture.',
  }
  const evaluation = evaluateContrastingAttempt(caseSet, dummySubmission)
  evaluation.cdts = body.cdtsBaseline
  const deck = generateContrastingFSRSDeck(caseSet, evaluation)
  sendJson(res, 200, {
    ok: true,
    setTitle: caseSet.title,
    cdtsBaseline: deck.cdtsBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/collaborative/scenarios — list canonical CSCL scenarios */
/** GET /cognitive/collaborative/scenarios — list canonical CSCL scenarios */
async function getCollaborativeScenarios(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const scenarios = CANONICAL_COLLABORATIVE_SCENARIOS
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      difficulty: s.difficulty,
      centralDilemma: s.centralDilemma,
      perspectivesCount: s.competingPerspectives.length,
      invariantsCount: s.invariantsForSynthesis.length,
      peerName: s.simulatedPeer.name,
      peerRole: s.simulatedPeer.role,
    })),
  })
}

/** POST /cognitive/collaborative/partner — generate automated Socratic peer response turn */
/** POST /cognitive/collaborative/partner — generate automated Socratic peer response turn */
async function postCollaborativePartner(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, collaborativePartnerBodySchema)
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!
  const peerTurn = generateCollaborativePeerTurn(scenario, body.learnerTurnText, body.turnIndex)
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    peerTurn,
  })
}

/** POST /cognitive/collaborative/evaluate — evaluate collaborative discourse (TDI, EED, SCR, CEI) */
/** POST /cognitive/collaborative/evaluate — evaluate collaborative discourse (TDI, EED, SCR, CEI) */
async function postCollaborativeEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, collaborativeEvaluateBodySchema)
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!
  const evaluation = evaluateCollaborativeDiscourse(scenario, body as DiscourseSubmission)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    evaluation,
  })
}

/** POST /cognitive/collaborative/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/collaborative/deck — generate calibrated FSRS-6 review deck */
async function postCollaborativeDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, collaborativeDeckBodySchema)
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
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
  evaluation.cei = body.ceiBaseline
  const deck = generateCollaborativeFSRSDeck(scenario, evaluation)
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    ceiBaseline: deck.ceiBaseline,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/system-dynamics/scenarios — list canonical system dynamics scenarios */
/** GET /cognitive/system-dynamics/scenarios — list canonical system dynamics scenarios */
async function getSystemDynamicsScenarios(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const scenarios = CANONICAL_SYSTEM_DYNAMICS_SCENARIOS
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      difficulty: s.difficulty,
      stocksCount: s.stocks.length,
      flowsCount: s.flows.length,
      loopsCount: s.canonicalLoops.length,
      archetype: s.canonicalArchetype,
      leveragePointsCount: s.leveragePoints.length,
    })),
  })
}

/** POST /cognitive/system-dynamics/simulate — run deterministic Euler numerical integration */
/** POST /cognitive/system-dynamics/simulate — run deterministic Euler numerical integration */
async function postSystemDynamicsSimulate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req, systemDynamicsSimulateBodySchema)
  const scenario =
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
  const simulationRun = runEulerSimulation(scenario, body.stepsCount, body.dt, {
    flowRateMultipliers: body.policyMultipliers,
  })
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    simulationRun,
  })
}

/** POST /cognitive/system-dynamics/evaluate — evaluate systems model (SFDR, FLIA, DAM, ARS, SDI) */
/** POST /cognitive/system-dynamics/evaluate — evaluate systems model (SFDR, FLIA, DAM, ARS, SDI) */
async function postSystemDynamicsEvaluate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req, systemDynamicsEvaluateBodySchema)
  const scenario =
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
  const evaluation = evaluateLearnerModel(scenario, body as LearnerModelHypothesis)
  sendJson(res, 200, {
    ok: true,
    scenarioTitle: scenario.title,
    evaluation,
  })
}

/** POST /cognitive/system-dynamics/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/system-dynamics/deck — generate calibrated FSRS-6 review deck */
async function postSystemDynamicsDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, systemDynamicsDeckBodySchema)
  const scenario =
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!
  const mockEvaluation = {
    sfdr: body.sdiBaseline,
    flia: body.sdiBaseline,
    dam: body.sdiBaseline,
    ars: body.sdiBaseline,
    sdi: body.sdiBaseline,
    maturityTier:
      body.sdiBaseline >= 85 ? ('leverage_strategist' as const) : ('dynamic_simulator' as const),
    strengths: ['Headless server synthesized baseline.'],
    systemicFeedback: [],
    archetypeDiscrepancies: [],
    leveragePointAnalysis: 'Direct REST deck synthesis.',
  }
  const deck = generateSystemDynamicsFSRSDeck(scenario, mockEvaluation)
  sendJson(res, 200, {
    ok: true,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    sdiBaseline: deck.sdi,
    cardsCount: deck.cards.length,
    cards: deck.cards,
  })
}

/** GET /cognitive/model-inquiry/scenarios — list canonical Gedankenexperiment scenarios */
/** GET /cognitive/model-inquiry/scenarios — list canonical Gedankenexperiment scenarios */
async function getModelInquiryScenarios(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const scenarios = listGedankenScenarios()
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
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
    })),
  })
}

/** POST /cognitive/model-inquiry/perturb — simulate extreme case perturbation */
/** POST /cognitive/model-inquiry/perturb — simulate extreme case perturbation */
async function postModelInquiryPerturb(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquiryPerturbBodySchema)
  const result = perturbExtremeCase(body.scenarioId, body.extremeCaseId, body.parameterLimit)
  sendJson(res, 200, {
    ok: true,
    result,
  })
}

/** POST /cognitive/model-inquiry/simulate — run mental animation sequence */
/** POST /cognitive/model-inquiry/simulate — run mental animation sequence */
async function postModelInquirySimulate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquirySimulateBodySchema)
  const result = simulateMentalAnimation(body.scenarioId, body.stepIds)
  sendJson(res, 200, {
    ok: true,
    result,
  })
}

/** POST /cognitive/model-inquiry/evaluate — evaluate model-based inquiry session */
/** POST /cognitive/model-inquiry/evaluate — evaluate model-based inquiry session */
async function postModelInquiryEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquiryEvaluateBodySchema)
  const evaluation = evaluateInquirySession(body as InquirySessionInput)
  const deck = generateModelInquiryFsrsDeck(body.scenarioId, evaluation)
  sendJson(res, 200, {
    ok: true,
    evaluation,
    cardsCount: deck.length,
    cards: deck,
  })
}

/** POST /cognitive/model-inquiry/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/model-inquiry/deck — generate calibrated FSRS-6 review deck */
async function postModelInquiryDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, modelInquiryDeckBodySchema)
  const deck = generateModelInquiryFsrsDeck(body.scenarioId)
  sendJson(res, 200, {
    ok: true,
    scenarioId: body.scenarioId,
    cardsCount: deck.length,
    cards: deck,
  })
}

// ── Prototype & Exemplar Categorization (Rosch 1975; Reed 1972; Nosofsky 1986;
//    Ashby & Gott 1988; Landauer & Bjork 1978; Kang 2016) — same engine calls
//    and response shapes as the web handler (host-parity contract) ──────────

/** GET /cognitive/prototype-exemplar/scenarios — canonical category sets */
/** GET /cognitive/prototype-exemplar/scenarios — canonical category sets */
function getPrototypeExemplarScenarios(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    ok: true,
    scenarios: CANONICAL_CATEGORIZATION_SETS,
  })
}

/** POST /cognitive/prototype-exemplar/evaluate — full session telemetry */
/** POST /cognitive/prototype-exemplar/evaluate — full session telemetry */
async function postPrototypeExemplarEvaluate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const submission = await readJson(req, categorizationSubmissionSchema)
  const set = findCategorySet(submission.setId)
  const evaluation = evaluateCategorizationSession(set, submission)
  sendJson(res, 200, {
    ok: true,
    evaluation,
  })
}

/** POST /cognitive/prototype-exemplar/plan — discriminating trials + optional schedule */
/** POST /cognitive/prototype-exemplar/plan — discriminating trials + optional schedule */
async function postPrototypeExemplarPlan(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, prototypeExemplarPlanBodySchema)
  const set = findCategorySet(body.setId)
  const plan = planDiscriminatingBlock(set, body.maxTrials)
  let schedule: StudyPlan | null = null
  if (body.sessions.length > 0) {
    try {
      schedule = planCategorizationStudy(body.sessions, {
        ...body.scheduleOptions,
        now: body.now ?? new Date().toISOString(),
      })
    } catch {
      schedule = null // malformed history: the trial plan still returns
    }
  }
  sendJson(res, 200, {
    ok: true,
    plan,
    schedule,
  })
}

/** POST /cognitive/prototype-exemplar/deck — FSRS cards scaled by the CRI */
/** POST /cognitive/prototype-exemplar/deck — FSRS cards scaled by the CRI */
async function postPrototypeExemplarDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, prototypeExemplarDeckBodySchema)
  const set = findCategorySet(body.setId)
  const neutralEvaluation = evaluateCategorizationSession(set, { setId: set.id })
  neutralEvaluation.cri = body.criBaseline
  const deck = generateCategorizationDeck(set, neutralEvaluation)
  sendJson(res, 200, {
    ok: true,
    deck,
  })
}

/** GET /cognitive/cps/scenarios — list canonical Dörner Micro-World scenarios */
/** GET /cognitive/cps/scenarios — list canonical Dörner Micro-World scenarios */
async function getCPSScenarios(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const scenarios = listMicroWorldScenarios()
  sendJson(res, 200, {
    ok: true,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      domain: s.domain,
      historicalContext: s.historicalContext,
      coreDilemma: s.coreDilemma,
      variablesCount: s.variables.length,
      policiesCount: s.availablePolicies.length,
      canonicalFailureMode: s.canonicalFailureMode,
    })),
  })
}

/** POST /cognitive/cps/step — simulate micro-world decision cycle */
/** POST /cognitive/cps/step — simulate micro-world decision cycle */
async function postCPSStep(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cpsStepBodySchema)
  const result = simulateMicroWorldStep(
    body.scenarioId,
    body.currentState,
    body.selectedPolicyIds,
    body.inspectedVariableIds,
  )
  sendJson(res, 200, {
    ok: true,
    result,
  })
}

/** POST /cognitive/cps/evaluate — evaluate CPS session & diagnose failure pathologies */
/** POST /cognitive/cps/evaluate — evaluate CPS session & diagnose failure pathologies */
async function postCPSEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cpsEvaluateBodySchema)
  const evaluation = evaluateCPSSession(body.scenarioId, body.finalState)
  const deck = generateCPSFSRSDeck(body.scenarioId, evaluation)
  sendJson(res, 200, {
    ok: true,
    evaluation,
    cardsCount: deck.length,
    deck,
  })
}

/** POST /cognitive/cps/deck — generate calibrated FSRS-6 review deck */
/** POST /cognitive/cps/deck — generate calibrated FSRS-6 review deck */
async function postCPSDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, cpsDeckBodySchema)
  const deck = generateCPSFSRSDeck(body.scenarioId)
  sendJson(res, 200, {
    ok: true,
    scenarioId: body.scenarioId,
    cardsCount: deck.length,
    cards: deck,
  })
}

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const studiosRoutes: Route[] = [
  {
    method: 'GET',
    path: '/cognitive/anchored/cases',
    summary: 'list canonical anchored macrocontext problem-solving cases (CTGV 1990, 1992)',
    handler: getAnchoredCases,
  },
  {
    method: 'POST',
    path: '/cognitive/anchored/evaluate',
    summary: 'evaluate situated problem-solving solution (SGAI, EIER, CPR, IKRS)',
    handler: postAnchoredEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/anchored/sensitivity',
    summary: 'simulate what-if parameter sensitivity across macrocontext constraints',
    handler: postAnchoredSensitivity,
  },
  {
    method: 'POST',
    path: '/cognitive/anchored/deck',
    summary: 'generate calibrated FSRS-6 review deck for anchored macrocontext',
    handler: postAnchoredDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/contrasting/sets',
    summary:
      'list canonical contrasting case sets for invention and perceptual differentiation (Schwartz & Bransford 1998, 2004)',
    handler: getContrastingSets,
  },
  {
    method: 'POST',
    path: '/cognitive/contrasting/evaluate',
    summary: 'evaluate contrasting cases invention attempt (FDRS, IMI, PFRI, CDTS)',
    handler: postContrastingEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/contrasting/deck',
    summary: 'generate calibrated FSRS-6 review deck for contrasting cases',
    handler: postContrastingDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/collaborative/scenarios',
    summary:
      'list canonical CSCL collaborative dilemmas and scripts (King 1997, 1999; Weinberger & Fischer 2006)',
    handler: getCollaborativeScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/collaborative/partner',
    summary: 'generate automated Socratic peer response turn',
    handler: postCollaborativePartner,
  },
  {
    method: 'POST',
    path: '/cognitive/collaborative/evaluate',
    summary: 'evaluate collaborative discourse (TDI, EED, SCR, CEI)',
    handler: postCollaborativeEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/collaborative/deck',
    summary: 'generate calibrated FSRS-6 review deck for collaborative dialectics',
    handler: postCollaborativeDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/system-dynamics/scenarios',
    summary:
      'list canonical system dynamics scenarios (Forrester 1968, Sterman 2000, Meadows 2008)',
    handler: getSystemDynamicsScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/system-dynamics/simulate',
    summary: 'run deterministic Euler numerical integration for system dynamics',
    handler: postSystemDynamicsSimulate,
  },
  {
    method: 'POST',
    path: '/cognitive/system-dynamics/evaluate',
    summary: 'evaluate systems thinking model (SFDR, FLIA, DAM, ARS, SDI)',
    handler: postSystemDynamicsEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/system-dynamics/deck',
    summary: 'generate calibrated FSRS-6 review deck for system dynamics',
    handler: postSystemDynamicsDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/model-inquiry/scenarios',
    summary: 'list canonical Gedankenexperiment scenarios (Clement 2008, Nersessian 2002)',
    handler: getModelInquiryScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/perturb',
    summary: 'simulate extreme case boundary perturbation for Gedankenexperimente',
    handler: postModelInquiryPerturb,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/simulate',
    summary: 'run simulative mental animation step sequence and expose contradictions',
    handler: postModelInquirySimulate,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/evaluate',
    summary: 'evaluate model-based inquiry session (ECDI, SAF, BAS, MMS, MBRI)',
    handler: postModelInquiryEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/model-inquiry/deck',
    summary: 'generate calibrated FSRS-6 review deck for model-based inquiry',
    handler: postModelInquiryDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/prototype-exemplar/scenarios',
    summary:
      'list canonical categorization category sets (Rosch 1975; Medin & Schaffer 1978; Nosofsky 1986; Ashby & Gott 1988)',
    handler: getPrototypeExemplarScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/prototype-exemplar/evaluate',
    summary:
      'evaluate a categorization session (TSC, CTS, MCD, CRI, maturity band, model comparison)',
    handler: postPrototypeExemplarEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/prototype-exemplar/plan',
    summary:
      'plan model-diagnostic trials + optional multi-day study schedule (expanding retrieval, interleaving)',
    handler: postPrototypeExemplarPlan,
  },
  {
    method: 'POST',
    path: '/cognitive/prototype-exemplar/deck',
    summary: 'generate calibrated FSRS-6 review deck for categorization',
    handler: postPrototypeExemplarDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/categorization/scenarios',
    summary:
      'list canonical categorization category sets (Rosch 1975; Medin & Schaffer 1978; Nosofsky 1986; Ashby & Gott 1988)',
    handler: getPrototypeExemplarScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/categorization/evaluate',
    summary:
      'evaluate a categorization session (TSC, CTS, MCD, CRI, maturity band, model comparison)',
    handler: postPrototypeExemplarEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/categorization/plan',
    summary:
      'plan model-diagnostic trials + optional multi-day study schedule (expanding retrieval, interleaving)',
    handler: postPrototypeExemplarPlan,
  },
  {
    method: 'POST',
    path: '/cognitive/categorization/deck',
    summary: 'generate calibrated FSRS-6 review deck for categorization',
    handler: postPrototypeExemplarDeck,
  },
  {
    method: 'GET',
    path: '/cognitive/cps/scenarios',
    summary: 'list canonical Dietrich Dörner Micro-World scenarios (Dörner 1996, Rasmussen 1983)',
    handler: getCPSScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/cps/step',
    summary: 'simulate micro-world decision cycle with delayed side-effect cascades',
    handler: postCPSStep,
  },
  {
    method: 'POST',
    path: '/cognitive/cps/evaluate',
    summary: 'evaluate complex problem solving session (DCE, SEAI, TFS, FMR, CPSI)',
    handler: postCPSEvaluate,
  },
  {
    method: 'POST',
    path: '/cognitive/cps/deck',
    summary: 'generate calibrated FSRS-6 review deck for micro-world CPS',
    handler: postCPSDeck,
  },
]
