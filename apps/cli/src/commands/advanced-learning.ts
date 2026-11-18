/**
 * Advanced Learning Science & Cognitive Expansion CLI Commands:
 * 1. skills: Matt Pocock agent skills catalog & autonomous code audit
 * 2. relearning: Rawson & Dunlosky (2011, 2012) successive relearning & Ebbinghaus savings
 * 3. srl: Zimmerman (2000) self-regulated learning & metacognitive matrix
 * 4. epistemic: Shaffer (2016) epistemic network analysis & quantitative ethnography
 * 5. causal: Judea Pearl (2000, 2009) structural causal modeling & counterfactuals
 * 6. threshold: Meyer & Land (2003, 2005) threshold concepts & liminal space navigation
 * 7. zpd: Vygotsky (1978) Zone of Proximal Development & graduated dynamic scaffolding
 * 8. pf: Kapur (2008, 2016) Productive Failure & canonical representation assembly
 * 9. pi: Eric Mazur (1997) Peer Instruction & ConcepTest voting analytics
 * 10. inquiry: de Jong & van Joolingen (1998) Inquiry-Based Learning & virtual experimentation
 * 11. reciprocal: Palincsar & Brown (1984) Reciprocal Teaching & dialogic comprehension
 * 12. cer: McNeill & Krajcik (2012) Claim-Evidence-Reasoning & epistemic argumentation
 * 13. anchored: CTGV (1990, 1992) Anchored Instruction & Situated Macrocontext Studio
 * 14. contrasting: Schwartz & Bransford (1998, 2004) Contrasting Cases & Inventing with Examples
 */

import {
  CANONICAL_SKILLS,
  executeSkillSimulation,
  auditCodeAgainstAgentsRules,
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
  evaluateReciprocalSession,
  generatePeerDialogicTurn,
  generateReciprocalFSRSDeck,
  CANONICAL_SCIENTIFIC_DEBATES,
  evaluateCERArgument,
  generateAdversarialCounterArgument,
  generateCERFSRSDeck,
  type CERArgumentSubmission,
  CANONICAL_MACROCONTEXT_CASES,
  evaluateAnchoredSolution,
  simulateAnchoredSensitivity,
  generateAnchoredFSRSDeck,
  type LearnerSolutionSubmission,
  CANONICAL_CONTRASTING_SETS,
  evaluateContrastingAttempt,
  generateContrastingFSRSDeck,
  type InventedMetricSubmission,
  CANONICAL_COLLABORATIVE_SCENARIOS,
  evaluateCollaborativeDiscourse,
  generateCollaborativePeerTurn,
  generateCollaborativeFSRSDeck,
  type DiscourseSubmission,
  CANONICAL_SYSTEM_DYNAMICS_SCENARIOS,
  evaluateLearnerModel,
  generateSystemDynamicsFSRSDeck,
  runEulerSimulation,
  type LearnerModelHypothesis,
  listGedankenScenarios,
  getGedankenScenario,
  perturbExtremeCase,
  simulateMentalAnimation,
  evaluateInquirySession,
  generateModelInquiryFsrsDeck,
  type InquirySessionInput,
} from '@learning-hub/core'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

// ── 1. Skills Command (Matt Pocock Framework) ───────────────────────────────

export function skillsCommand(args: string[]): void {
  const sub = args[0] || 'catalog'

  if (sub === 'catalog') {
    const category = parseFlag(args, '--category')?.toLowerCase()
    const all = Object.values(CANONICAL_SKILLS)
    const list = category ? all.filter((s) => s.meta.category.toLowerCase() === category) : all

    console.log(`\n🛠️  Canonical Agent Skills Catalog (${list.length} available)`)
    console.log('═'.repeat(65))
    for (const skill of list) {
      console.log(
        `• [${skill.meta.category.toUpperCase()}] ${skill.meta.title} (${skill.meta.name})`,
      )
      console.log(`  ${skill.meta.description}`)
      console.log(`  Phases: ${skill.phases.map((p) => p.name).join(' → ')}`)
      console.log()
    }
    return
  }

  if (sub === 'audit') {
    const code =
      parseFlag(args, '--code') || 'export async function getData() { return fetch("/api"); }'
    const file = parseFlag(args, '--file') || 'apps/web/app/example/page.tsx'

    console.log(`\n🛡️  Autonomous Architectural Invariant Rule Audit`)
    console.log(`Target: ${file}`)
    console.log('─'.repeat(55))

    const violations = auditCodeAgainstAgentsRules(code, file)
    if (violations.length === 0) {
      console.log('✅ 100% Compliant — No AGENTS.md invariant violations detected.')
    } else {
      console.log(`⚠️  ${violations.length} Violation(s) Detected:`)
      for (const v of violations) {
        console.log(`  [Rule ${v.ruleId}] ${v.ruleName} (${v.severity.toUpperCase()})`)
        console.log(`    Detail:      ${v.message}`)
        console.log(`    Remediation: ${v.remedy}`)
      }
    }
    return
  }

  if (sub === 'run') {
    const skillName = parseFlag(args, '--skill') || 'code-review'
    const skill = CANONICAL_SKILLS[skillName] || Object.values(CANONICAL_SKILLS)[0]!

    console.log(`\n🚀 Executing Autonomous Skill Simulation: ${skill.meta.title}`)
    const result = executeSkillSimulation(skill.meta.name, {
      topic: 'Automated Code Review Invariants',
      context: 'export function calculateMetrics() { return 42; }',
    })

    console.log(`Clarity Score: ${result.clarityIndex}%`)
    console.log(`Rigor Score:   ${result.rigorScore}%`)
    console.log(`Output:        ${result.rawOutput.slice(0, 150)}...`)
    return
  }

  console.log(
    'Usage: learning-hub skills [catalog|audit|run] [--category <cat>] [--file <path>] [--skill <name>]',
  )
}

// ── 2. Successive Relearning Command (Rawson & Dunlosky 2011) ─────────────────

export function relearningCommand(args: string[]): void {
  const initial = Number(parseFlag(args, '--initial') || '600')
  const relearn = Number(parseFlag(args, '--relearn') || '210')
  const days = Number(parseFlag(args, '--days') || '7')
  const trials = Number(parseFlag(args, '--trials') || '3')

  const savings = calculateEbbinghausSavings(initial, relearn)
  const retention = predictRetentionAtDays(0.08, days)
  const fsrsStability = calibrateFSRSStability(0.08)
  const fsrsDifficulty = calibrateFSRSDifficulty(trials, 1)

  console.log('\n📈 Successive Relearning & Ebbinghaus Savings Diagnostic')
  console.log('Citation: Rawson & Dunlosky (2011, 2012); Ebbinghaus (1885)')
  console.log('═'.repeat(65))
  console.log(`Initial Practice:     ${initial}s`)
  console.log(`Relearning Practice:  ${relearn}s`)
  console.log(
    `Memory Savings:       ${savings.toFixed(1)}% (${savings >= 50 ? 'EXEMPLARY' : 'MODERATE'})`,
  )
  console.log(`Predicted Retention:  ${Math.round(retention * 100)}% at ${days} days`)
  console.log(
    `Calibrated FSRS:      Stability = ${fsrsStability.toFixed(1)}d, Difficulty = ${fsrsDifficulty.toFixed(2)}`,
  )
  console.log('─'.repeat(65))
  if (savings >= 50) {
    console.log(
      '💡 Recommendation: Strong memory savings achieved. Safe to expand review interval by 2.5x.',
    )
  } else {
    console.log(
      '💡 Recommendation: Sub-threshold savings. Perform an immediate successive retrieval trial.',
    )
  }
}

// ── 3. SRL Zimmerman Metacognitive Matrix Command ────────────────────────────

export function srlCommand(args: string[]): void {
  const forethought = Number(parseFlag(args, '--forethought') || '8')
  const performance = Number(parseFlag(args, '--performance') || '7')
  const reflection = Number(parseFlag(args, '--reflection') || '9')
  const challengeId = parseFlag(args, '--challenge')

  const index = calculateSRLMaturityIndex(forethought, performance, reflection)
  const tier = evaluateSRLMaturityTier(index)
  const gas = calculateGoalAttainmentScale(performance / 10, reflection >= 6, forethought / 10)

  console.log('\n🎯 Zimmerman (2000) Cyclical Self-Regulated Learning (SRL) Matrix')
  console.log('═'.repeat(65))
  console.log(`Forethought (Planning):        ${forethought}/10`)
  console.log(`Performance (Volition/Monitor):${performance}/10`)
  console.log(`Self-Reflection (Attribution): ${reflection}/10`)
  console.log(`Overall SRL Maturity Index:    ${index.toFixed(2)} (${tier.toUpperCase()})`)
  console.log(`Goal Attainment Scale (GAS):   ${gas >= 0 ? `+${gas}` : gas} (Scale: -2 to +2)`)
  console.log('─'.repeat(65))

  if (challengeId && CALIBRATED_SRL_CHALLENGES[challengeId]) {
    const ch = CALIBRATED_SRL_CHALLENGES[challengeId]!
    console.log(`\n🔍 Diagnosed Challenge: ${ch.title} (${ch.domain})`)
    console.log(`Complexity:            ${ch.complexityLevel}`)
    console.log(`Task Description:      ${ch.taskDescription}`)
    console.log(`Forethought Heuristic: ${ch.expertForethoughtHeuristic}`)
    console.log(`Reflection Prompt:     ${ch.expertSelfReflectionPrompt}`)
  } else {
    console.log(
      'Prescription: Strategic self-monitoring with cyclical forethought and adaptive attribution',
    )
  }
}

// ── 4. Epistemic Network Analysis Command (Shaffer 2016) ──────────────────────

export function epistemicCommand(args: string[]): void {
  const baseMastery = Number(parseFlag(args, '--mastery') || '0.75')

  const sampleUtterances = [
    {
      id: 'cli_utt_1',
      unitId: 'cli_unit',
      conversationId: 'cli_conv',
      lineIndex: 0,
      timestamp: new Date().toISOString(),
      speaker: 'Learner',
      text: 'Because the gradient is steep, the weights oscillate instead of converging smoothly.',
      appliedCodes: ['code_domain_principle', 'code_causal_reasoning'],
    },
    {
      id: 'cli_utt_2',
      unitId: 'cli_unit',
      conversationId: 'cli_conv',
      lineIndex: 1,
      timestamp: new Date().toISOString(),
      speaker: 'Learner',
      text: 'Adding momentum or Adam optimization damps these high variance oscillations.',
      appliedCodes: ['code_empirical_evidence', 'code_causal_reasoning'],
    },
    {
      id: 'cli_utt_3',
      unitId: 'cli_unit',
      conversationId: 'cli_conv',
      lineIndex: 2,
      timestamp: new Date().toISOString(),
      speaker: 'Learner',
      text: 'In practice, batch normalization also stabilizes activations across hidden layers.',
      appliedCodes: ['code_empirical_evidence', 'code_domain_principle'],
    },
  ]

  const model = buildEpistemicDiscourseModel(
    'cli_model',
    'CLI Cognitive Architecture Discourse',
    'Deep Learning',
    sampleUtterances,
  )

  const bridge = bridgeEpistemicToCurriculum(model, baseMastery)

  console.log('\n🕸️  Shaffer (2016) Epistemic Network Analysis (ENA) Engine')
  console.log('═'.repeat(65))
  console.log(`Discourse Title:      ${model.title} (${model.domain})`)
  console.log(`Network Density:      ${(model.network.networkDensity * 100).toFixed(1)}%`)
  console.log(`Vector Dimension:     ${model.network.upperTriangleVector.length} connections`)
  console.log(
    `Projection Centroid:  (${model.projection.dimension1Coord.toFixed(3)}, ${model.projection.dimension2Coord.toFixed(3)})`,
  )
  console.log(`Epistemic Interpretation: ${model.projection.epistemicInterpretation}`)
  console.log(
    `Curriculum Multiplier:${bridge.transferMultiplier}x (Modulated Mastery: ${(bridge.modulatedMastery * 100).toFixed(1)}%)`,
  )
  console.log('─'.repeat(65))
  console.log(`Overall Coherence:    ${model.overallMaturityScore}%`)
}

// ── 5. Causal Modeling & Pearl Counterfactual Command ────────────────────────

export function causalCommand(args: string[]): void {
  const target = parseFlag(args, '--target') || 'ExamScore'
  const studyIntervention = Number(parseFlag(args, '--study') || '16')

  const model = createStandardEducationSCM()
  const result = evaluateCounterfactual(model, {
    modelId: model.id,
    evidence: { StudyHours: 6, PriorKnowledge: 45, ExamScore: 50 },
    interventions: { StudyHours: studyIntervention },
    targetVariableId: target,
  })

  const backdoor = evaluateBackdoorAdmissibility(model, 'StudyHours', target, ['Aptitude'])
  const dsep = checkDSeparation(model, 'StudyHours', target, ['Aptitude'])

  console.log('\n🔮 Judea Pearl Structural Causal Model & Counterfactual Simulator')
  console.log('Citation: Pearl (2000, 2009) Causality; Woodward (2003)')
  console.log('═'.repeat(65))
  console.log(`Factual Baseline (${target}):         ${result.factualValue.toFixed(1)} pts`)
  console.log(
    `Counterfactual do(StudyHours=${studyIntervention}):  ${result.counterfactualValue.toFixed(1)} pts`,
  )
  console.log(
    `Causal Lift (Δ):                    ${result.causalLift >= 0 ? '+' : ''}${result.causalLift.toFixed(1)} pts`,
  )
  console.log(
    `Backdoor Criterion Admissible:      ${backdoor.isAdmissible ? 'YES (Valid causal identifiability)' : 'NO'}`,
  )
  console.log(`D-Separation Tested Paths:          ${dsep.paths.length} path(s) evaluated`)
  console.log('─'.repeat(65))
  console.log(`Explanation: ${result.narrativeExplanation}`)
}

// ── 6. Threshold Concepts & Liminal Navigation Command ───────────────────────

export function thresholdCommand(args: string[]): void {
  const conceptId = parseFlag(args, '--concept') || 'tc_pointers_memory'
  const baseMastery = Number(parseFlag(args, '--mastery') || '0.70')

  const concepts = getStandardThresholdConcepts()
  const concept = concepts.find((c) => c.id === conceptId) || concepts[0]!

  const diagnostic = evaluateLiminalTrajectory(concept.id, {
    probe_ptr_address_vs_val: 'opt_ptr_add_correct',
    probe_stack_heap_lifetime: 'opt_sh_correct',
  })

  const bridge = bridgeThresholdToCurriculum(
    baseMastery,
    diagnostic.overallFluencyScore,
    diagnostic.phase,
    concept.id,
  )

  const tsi = computeThresholdSignificanceIndex(concept.criteriaScores)
  console.log('\n🚪 Meyer & Land (2003, 2005) Threshold Concepts & Liminal Navigation')
  console.log('═'.repeat(65))
  console.log(`Concept:               ${concept.title} [${concept.discipline}]`)
  console.log(
    `Threshold Index (TSI): ${(tsi * 100).toFixed(0)}% (Transformative/Irreversible/Integrative)`,
  )
  console.log(`Liminal Phase:         ${diagnostic.phase.toUpperCase()}`)
  console.log(
    `Portal Crossed:        ${diagnostic.canCrossPortal ? 'YES (State transformed)' : 'IN PROGRESS'}`,
  )
  console.log(`Fluency Score:         ${(diagnostic.overallFluencyScore * 100).toFixed(1)}%`)
  console.log(`Mimicry Risk:          ${(diagnostic.mimicryRiskScore * 100).toFixed(1)}%`)
  console.log(
    `Gateway Multiplier:    ${bridge.gatewayMultiplier}x (Modulated Mastery: ${(bridge.modulatedMastery * 100).toFixed(1)}%)`,
  )
  console.log(`Unlocked Downstream:   ${concept.unlockedDownstreamConcepts.join(', ')}`)
  console.log('─'.repeat(65))
  console.log(`Pedagogical Remedy:    ${diagnostic.prescribedRemediation}`)
}

// ── 7. Dynamic Assessment & Zone of Proximal Development Command ─────────────

export function zpdCommand(args: string[]): void {
  const sub = args[0] || 'eval'
  const scenarioId = parseFlag(args, '--scenario') || 'algo_dynamic_programming'

  if (sub === 'scenarios' || sub === 'list') {
    const scenarios = listZpdScenarios()
    console.log('\n🎯 Dynamic Assessment Canonical Scenarios (Vygotsky & Feuerstein)')
    console.log('═'.repeat(65))
    scenarios.forEach((s) => {
      console.log(`• [${s.id}] ${s.title}`)
      console.log(`  Domain: ${s.domain}`)
      console.log(`  Core:   ${s.theoreticalCore}`)
    })
    return
  }

  if (sub === 'prompt') {
    const tier = Number(parseFlag(args, '--tier') || '1')
    const scenario = getZpdScenarioById(scenarioId) || listZpdScenarios()[0]!
    const prompt = getGraduatedPromptAtTier(scenario.mediatedProblem, tier)
    console.log(`\n💡 Graduated Prompt (Tier ${tier}/5) — ${scenario.title}`)
    console.log('═'.repeat(65))
    if (!prompt) {
      console.log('Prompt not found for tier', tier)
      return
    }
    console.log(`Title:               ${prompt.title}`)
    console.log(`Prompt:              ${prompt.promptText}`)
    console.log(`Mediator Rationale:  ${prompt.mediatorRationale}`)
    console.log(`Structural Principle:${prompt.structuralPrinciple}`)
    console.log(`Cognitive Load:      ${prompt.cognitiveLoadImpact}/10`)
    return
  }

  if (sub === 'deck') {
    const pre = Number(parseFlag(args, '--pre') || '30')
    const post = Number(parseFlag(args, '--post') || '85')
    const scenario = getZpdScenarioById(scenarioId) || listZpdScenarios()[0]!
    const metrics = calculateZpdMetrics(pre, post, 2, [80, 75, 70])
    const deck = generateFSRSZpdDeck(scenario, metrics)
    console.log(`\n🗂️ FSRS-6 Calibrated Flashcard Deck — ${scenario.title}`)
    console.log('═'.repeat(65))
    console.log(`Generated Cards:     ${deck.length}`)
    console.log(`Typology:            ${metrics.typology}`)
    console.log(`Budoff LPS:          ${(metrics.learningPotentialScore * 100).toFixed(0)}%`)
    console.log(`Feuerstein CMI:      ${(metrics.cognitiveModifiabilityIndex * 100).toFixed(0)}%`)
    console.log('─'.repeat(65))
    deck.slice(0, 3).forEach((card, idx) => {
      console.log(`Card ${idx + 1}: ${card.front} (S0: ${card.recommendedStabilityDays}d)`)
    })
    return
  }

  // Default: eval
  const pre = Number(parseFlag(args, '--pre') || '25')
  const post = Number(parseFlag(args, '--post') || '80')
  const hints = Number(parseFlag(args, '--hints') || '2')
  const scenario = getZpdScenarioById(scenarioId) || listZpdScenarios()[0]!
  const metrics = calculateZpdMetrics(pre, post, hints, [85, 75, 70])

  console.log('\n🎯 Dynamic Assessment & Zone of Proximal Development Diagnostic')
  console.log(
    'Citation: Vygotsky (1978); Feuerstein (1979); Budoff (1987); Campione & Brown (1987)',
  )
  console.log('═'.repeat(65))
  console.log(`Scenario:              ${scenario.title} [${scenario.domain}]`)
  console.log(`Actual Level (ADL):    ${metrics.actualDevelopmentalLevel}% (Independent baseline)`)
  console.log(`Potential Level (PDL): ${metrics.potentialDevelopmentalLevel}% (Assisted ceiling)`)
  console.log(`Active ZPD Bandwidth:  +${metrics.zpdBandwidth}% (Optimal developmental zone)`)
  console.log(
    `Learning Potential:    ${(metrics.learningPotentialScore * 100).toFixed(0)}% (Budoff gain ratio)`,
  )
  console.log(
    `Cognitive Modifiability: ${(metrics.cognitiveModifiabilityIndex * 100).toFixed(0)}% (Feuerstein CMI)`,
  )
  console.log(
    `Prompt Autonomy:       ${(metrics.promptEfficiencyScore * 100).toFixed(0)}% (${metrics.promptsConsumedCount}/5 hints)`,
  )
  console.log(
    `Transfer Autonomy:     ${(metrics.transferAutonomyScore * 100).toFixed(0)}% (Near/Med/Far)`,
  )
  console.log(`Learner Typology:      ${metrics.typology.toUpperCase()}`)
  console.log(`Frustration Horizon:   ~${metrics.frustrationHorizon}%`)
  console.log('─'.repeat(65))
  console.log(`Diagnostic Summary:    ${metrics.typologyDescription}`)
}

// ── 8. Productive Failure & Canonical Consolidation Command ──────────────────

export function pfCommand(args: string[]): void {
  const sub = args[0] || 'metrics'
  const scenarioId = parseFlag(args, '--scenario') || 'pf-variance-dispersion'

  if (sub === 'scenarios' || sub === 'list') {
    const scenarios = getCanonicalPFScenarios()
    console.log('\n🧠 Productive Failure Canonical Scenarios (Kapur & Sinha)')
    console.log('═'.repeat(65))
    scenarios.forEach((s) => {
      console.log(`• [${s.id}] ${s.title}`)
      console.log(`  Domain:  ${s.domain}`)
      console.log(`  Focus:   ${s.subtitle}`)
      console.log(`  Target:  ${s.targetConcept}`)
      console.log('─'.repeat(65))
    })
    return
  }

  const scenario = getPFScenarioById(scenarioId) ?? getCanonicalPFScenarios()[0]

  if (sub === 'eval') {
    const title = parseFlag(args, '--title') || 'Intuitive Heuristic Model'
    const mechanism = parseFlag(args, '--mechanism') || 'Linear spread calculation'
    const evalResult = evaluateStudentRepresentation(scenario.id, {
      title,
      description: 'Model authored via CLI',
      mechanism,
      structuralFeatures: ['outlier sensitivity', 'deviation from center'],
    })

    console.log('\n🔬 Student-Generated Representation (SGR) Evaluation')
    console.log('═'.repeat(65))
    console.log(`Scenario:          ${scenario.title}`)
    console.log(`Model Title:       ${evalResult.title}`)
    console.log(`Mechanism:         ${evalResult.mechanism}`)
    console.log(`Plausibility:      ${evalResult.intuitivePlausibilityScore}%`)
    console.log(`Formal Validity:   ${evalResult.formalValidityScore}%`)
    console.log(`Features Matched:  ${evalResult.structuralFeaturesIdentified.join(', ')}`)
    return
  }

  if (sub === 'deck') {
    const _pfi = parseInt(parseFlag(args, '--pfi') || '85', 10)
    const cig = parseInt(parseFlag(args, '--cig') || '80', 10)

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

    const deck = generatePFFSRSCards(scenario, dummyMetrics)

    console.log('\n📦 Calibrated FSRS-6 Productive Failure Deck')
    console.log(`Scenario:          ${scenario.title}`)
    console.log(`Cards Generated:   ${deck.length}`)
    console.log(`Initial Stability: ${deck[0]?.initialStabilityDays} days (S0)`)
    console.log(`Initial Diff:      ${deck[0]?.initialDifficulty} / 10 (D0)`)
    console.log('═'.repeat(65))
    deck.forEach((c, idx) => {
      console.log(`[Card ${idx + 1}] (${c.conceptualDepth})`)
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: metrics evaluation
  const repCount = parseInt(parseFlag(args, '--reps') || '3', 10)
  const affective = parseInt(parseFlag(args, '--affective') || '4', 10)
  const cigScore = parseInt(parseFlag(args, '--cig') || '85', 10)

  const metrics = calculatePFMetrics({
    representations: scenario.exemplarStudentRepresentations.slice(0, repCount),
    impasse: {
      impasseEncountered: true,
      failureModeIdentified: 'Boundary distortion breakdown',
      boundaryConditionsTested: ['Outliers', 'Zeros'],
      knowledgeGapArticulated: 'Need canonical invariant parameterization',
      affectiveImpasseRating: affective,
      impasseDepthScore: 75,
    },
    consolidationRatings: {
      featureAlignment: cigScore,
      parameterMapping: cigScore,
      invariantGrasp: cigScore,
    },
    transferResults: scenario.transferProbes.map((p) => ({
      probeId: p.probeId,
      isCorrect: true,
      confidence: 4,
    })),
  })

  console.log('\n🧠 Productive Failure Cognitive Diagnostics (Manu Kapur 2008, 2016)')
  console.log('═'.repeat(65))
  console.log(`Scenario:              ${scenario.title} [${scenario.domain}]`)
  console.log(`Productive Failure:    ${metrics.productiveFailureIndex}% (PFI overall score)`)
  console.log(
    `Generation Diversity:  ${(metrics.generationDiversityIndex * 100).toFixed(0)}% (GDI breadth)`,
  )
  console.log(`Impasse Sensitivity:   ${metrics.impasseSensitivityScore}% (ISS depth)`)
  console.log(`Consolidation Gain:    ${metrics.consolidationIntegrationGain}% (CIG assembly)`)
  console.log(`Adaptive Transfer:     ${metrics.adaptiveTransferScore}% (ATS deep invariance)`)
  console.log(`Failure/Mastery Ratio: Φ = ${metrics.failureToMasteryRatio.toFixed(2)}x`)
  console.log(`Mastery Band:          ${metrics.masteryBand.toUpperCase()}`)
  console.log('─'.repeat(65))
  console.log(`Diagnostic Feedback:   ${metrics.qualitativeFeedback}`)
  console.log(`Recommendation:        ${metrics.recommendedIntervention}`)
}

// ── 9. Peer Instruction & Interactive ConcepTests Command ────────────────────

export function piCommand(args: string[]): void {
  const sub = args[0] || 'eval'
  const suiteId = parseFlag(args, '--suite') || 'ct-thermal-expansion-plate'

  if (sub === 'suites' || sub === 'list') {
    const suites = getCanonicalConcepTestSuites()
    console.log('\n👥 Peer Instruction Canonical ConcepTests (Eric Mazur)')
    console.log('═'.repeat(65))
    suites.forEach((s) => {
      console.log(`• [${s.id}] ${s.title}`)
      console.log(`  Domain:    ${s.domain}`)
      console.log(`  Premise:   ${s.subtitle}`)
      console.log(`  Invariant: ${s.canonicalInvariant}`)
      console.log('─'.repeat(65))
    })
    return
  }

  const suite = getConcepTestSuiteById(suiteId) ?? getCanonicalConcepTestSuites()[0]

  if (sub === 'dialogue') {
    console.log('\n💬 Simulated Peer Deliberation Dialogue (Smith et al. 2009)')
    console.log('═'.repeat(65))
    console.log(`Suite: ${suite.title}`)
    console.log(`Q1:    ${suite.q1Prompt}\n`)
    suite.simulatedPeers.forEach((peer) => {
      console.log(`[${peer.peerName}]`)
      console.log(`Advocating:   Option ${peer.initialChoiceOptionId}`)
      console.log(`Argument:     "${peer.qualitativeArgument}"`)
      console.log(`Mental Model: ${peer.heuristicMentalModel}`)
      console.log(`Counter-Arg:  ${peer.counterArgumentTrigger}`)
      console.log('─'.repeat(65))
    })
    return
  }

  if (sub === 'deck') {
    const hakeGain = parseFloat(parseFlag(args, '--gain') || '0.75')
    const dummyMetrics = calculatePIMetrics({
      suite,
      q1InitialOptionId: suite.q1Options[0].id,
      q1InitialConfidence: 3,
      q1RevoteOptionId: suite.q1Options.find((o) => o.isCorrect)!.id,
      q1RevoteConfidence: 5,
      q2TransferOptionId: suite.q2Options.find((o) => o.isCorrect)!.id,
      peerDiscussionOccurred: true,
      simulatedClassroomAccuracyVote1: 35,
      simulatedClassroomAccuracyVote2: Math.round(35 + hakeGain * 65),
    })
    const deck = generatePIFSRSCards(suite, dummyMetrics)

    console.log('\n📦 Calibrated FSRS-6 ConcepTest Flashcards')
    console.log(`Suite:             ${suite.title}`)
    console.log(`Cards Generated:   ${deck.length}`)
    console.log(`Initial Stability: ${deck[0]?.initialStabilityDays} days (S0)`)
    console.log(`Initial Diff:      ${deck[0]?.initialDifficulty} / 10 (D0)`)
    console.log('═'.repeat(65))
    deck.forEach((c, idx) => {
      console.log(`[Card ${idx + 1}] (${c.cardDepth})`)
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: eval / trajectory
  const vote1 = parseInt(parseFlag(args, '--pre') || '38', 10)
  const vote2 = parseInt(parseFlag(args, '--post') || '82', 10)
  const q1Correct = suite.q1Options.find((o) => o.isCorrect)!.id
  const q2Correct = suite.q2Options.find((o) => o.isCorrect)!.id

  const metrics = calculatePIMetrics({
    suite,
    q1InitialOptionId: suite.q1Options[0].id,
    q1InitialConfidence: 3,
    q1RevoteOptionId: q1Correct,
    q1RevoteConfidence: 5,
    q2TransferOptionId: q2Correct,
    peerDiscussionOccurred: true,
    simulatedClassroomAccuracyVote1: vote1,
    simulatedClassroomAccuracyVote2: vote2,
  })

  console.log('\n👥 Peer Instruction & ConcepTest Diagnostic (Eric Mazur 1997)')
  console.log('═'.repeat(65))
  console.log(`ConcepTest:        ${suite.title} [${suite.domain}]`)
  console.log(
    `Hake Gain ⟨g⟩:     ${metrics.hakeNormalizedGain.toFixed(2)} (${metrics.engagementBand})`,
  )
  console.log(
    `Vote Polarization: ${(metrics.mazurPolarizationIndex * 100).toFixed(0)}% (PI entropy)`,
  )
  console.log(
    `Discussion Ratio:  ${(metrics.peerDiscussionConvergence * 100).toFixed(0)}% (DCR consensus)`,
  )
  console.log(`Smith Q2 Transfer: ${metrics.isomorphicTransferScore}% (Isomorphic precision)`)
  console.log(`Mazur Window:      ${metrics.mazurWindowRecommendedAction.toUpperCase()}`)
  console.log(
    `Learning Verif:    ${metrics.smithLearningVerification ? 'VERIFIED (Science 2009)' : 'PENDING'}`,
  )
  console.log('─'.repeat(65))
  console.log(`Summary:           ${metrics.qualitativeSummary}`)
  console.log(`Pedagogical Advice: ${metrics.pedagogicalAdvice}`)
}

// ── 10. Scientific Discovery & Inquiry Simulation Command ───────────────────

export function inquiryCommand(args: string[]): void {
  const sub = args[0] || 'eval'
  const labId = parseFlag(args, '--lab') || 'lab-pendulum-period'

  if (sub === 'labs' || sub === 'list') {
    const labs = getCanonicalInquiryLabs()
    console.log('\n🔬 Canonical Scientific Inquiry Laboratories (Klahr & Dunbar 1988)')
    console.log('═'.repeat(65))
    labs.forEach((l) => {
      console.log(`• [${l.id}] ${l.title}`)
      console.log(`  Domain:    ${l.domain}`)
      console.log(`  Question:  ${l.researchQuestion}`)
      console.log(`  Invariant: ${l.canonicalInvariantLaw}`)
      console.log('─'.repeat(65))
    })
    return
  }

  const lab = getInquiryLabById(labId) ?? getCanonicalInquiryLabs()[0]!

  if (sub === 'trial') {
    const trial = runInquiryTrial(lab, 0, {
      length: parseFloat(parseFlag(args, '--length') || '1.0'),
      mass: parseFloat(parseFlag(args, '--mass') || '0.2'),
      angle: parseFloat(parseFlag(args, '--angle') || '15'),
      gravity: parseFloat(parseFlag(args, '--gravity') || '9.81'),
    })

    console.log('\n🔬 Scientific Inquiry Experimental Trial Simulation')
    console.log('═'.repeat(65))
    console.log(`Laboratory: ${lab.title}`)
    console.log(`Outputs:`)
    Object.entries(trial.observedOutputs).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}`)
    })
    return
  }

  if (sub === 'deck') {
    const sdiScore = parseInt(parseFlag(args, '--sdi') || '85', 10)
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
          reaction: sdiScore >= 70 ? 'theory_revision' : 'ignore',
          articulatedExplanation: 'Calibrated invariant model',
        },
      ],
      falsificationTrialCount: 1,
      finalHypothesisCapturesInvariant: sdiScore >= 60,
    })

    const deck = generateInquiryFSRSCards(lab, dummyMetrics)

    console.log('\n📦 Calibrated FSRS-6 Scientific Inquiry Deck')
    console.log(`Laboratory:        ${lab.title}`)
    console.log(`Cards Generated:   ${deck.length}`)
    console.log(`Initial Stability: ${deck[0]?.initialStabilityDays} days (S0)`)
    console.log(`Initial Diff:      ${deck[0]?.initialDifficulty} / 10 (D0)`)
    console.log('═'.repeat(65))
    deck.forEach((c, idx) => {
      console.log(`[Card ${idx + 1}] (${c.cardDepth})`)
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: evaluation
  const votatRigor = parseFloat(parseFlag(args, '--vri') || '1.0')
  const reaction =
    (parseFlag(args, '--reaction') as
      | 'ignore'
      | 'reject'
      | 'exclude'
      | 'hold_in_abeyance'
      | 'reinterpretation'
      | 'peripheral_change'
      | 'theory_revision') || 'theory_revision'

  const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
  const t2Settings =
    votatRigor >= 0.5
      ? { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 }
      : { length: 1.5, mass: 0.8, angle: 45, gravity: 9.81 }
  const t2 = runInquiryTrial(lab, 1, t2Settings, t1.variableSettings)

  const metrics = calculateInquiryMetrics({
    lab,
    trials: [t1, t2],
    anomalousSubmissions: [
      {
        anomalyId: lab.anomalousScenarios[0]?.id ?? 'a1',
        reaction,
        articulatedExplanation: 'Accommodated invariant schema',
      },
    ],
    falsificationTrialCount: 1,
    finalHypothesisCapturesInvariant: true,
  })

  console.log('\n🔬 Scientific Discovery & Inquiry Telemetry (SDDS Engine)')
  console.log('═'.repeat(65))
  console.log(`Laboratory:        ${lab.title} [${lab.domain}]`)
  console.log(
    `VOTAT Rigor (VRI): ${(metrics.votatRigorIndex * 100).toFixed(0)}% (Chen & Klahr 1999)`,
  )
  console.log(
    `Confirmation Bias: ${(metrics.confirmationBiasIndex * 100).toFixed(0)}% (Wason 1960)`,
  )
  console.log(`Anomaly Resolution: ${metrics.anomalousDataResolutionIndex}% (Chinn & Brewer 1993)`)
  console.log(`Discovery Index:   ${metrics.scientificDiscoveryIndex} / 100 SDI`)
  console.log(`Mastery Band:      ${metrics.inquiryMasteryBand}`)
  console.log(`SDDS Efficiency:   ${(metrics.sddsSearchEfficiencyRatio * 100).toFixed(0)}%`)
  console.log('─'.repeat(65))
  console.log(`Diagnostic:        ${metrics.qualitativeDiagnostic}`)
  console.log(`Instructional:     ${metrics.pedagogicalAdvice}`)
}

// ── 11. Reciprocal Teaching & Dialogic Questioning Command ───────────────────
export async function reciprocalTeachingCommand(args: string[]): Promise<void> {
  const passages = CANONICAL_TEXT_PASSAGES
  const sub = args[0]

  if (sub === 'passages' || sub === 'list') {
    console.log('\n📚 Reciprocal Teaching Text Passages (Palincsar & Brown 1984)')
    console.log('═'.repeat(65))
    passages.forEach((p) => {
      console.log(`• [${p.id}] ${p.title}`)
      console.log(
        `  Discipline: ${p.discipline} | Difficulty: ${p.difficulty} | Words: ${p.wordCount}`,
      )
      console.log(`  Core Thesis: ${p.coreThesis}`)
      console.log(`  Stems: ${p.stems.length} | Misconceptions: ${p.commonMisconceptions.length}`)
      console.log('─'.repeat(65))
    })
    return
  }

  const passageId = parseFlag(args, '--passage') || 'passage-endosymbiosis'
  const passage = passages.find((p) => p.id === passageId) ?? passages[0]!

  if (sub === 'peer') {
    const roleFlag = parseFlag(args, '--role') as
      'questioner' | 'clarifier' | 'summarizer' | 'predictor' | undefined
    const peer = generatePeerDialogicTurn(passage, [], roleFlag)
    console.log('\n💬 Socratic Reciprocal Peer Turn (Palincsar Scaffolding)')
    console.log('═'.repeat(65))
    console.log(`Passage:     ${passage.title}`)
    console.log(`Peer Role:   ${peer.role.toUpperCase()}`)
    console.log(`ICAP Level:  ${peer.icapLevel.toUpperCase()}`)
    console.log('─'.repeat(65))
    console.log(`Peer Dialogue:\n"${peer.text}"`)
    return
  }

  if (sub === 'deck') {
    const sampleTurns = [
      {
        id: 'turn-sample',
        speaker: 'user' as const,
        role: 'clarifier' as const,
        turnIndex: 0,
        text: 'The inner mitochondrial membrane contains cardiolipin which proves bacterial origin because eukaryotes lack it.',
        timestamp: Date.now(),
        icapLevel: 'constructive' as const,
        elaborationScore: 80,
      },
    ]
    const evaluation = evaluateReciprocalSession(sampleTurns, passage)
    const deck = generateReciprocalFSRSDeck(passage, sampleTurns, evaluation)

    console.log('\n📦 Calibrated FSRS-6 Reciprocal Spaced Repetition Deck')
    console.log(`Passage:           ${deck.passageTitle}`)
    console.log(`Dialogue Maturity: ${deck.rdmsBaseline}/100 RDMS`)
    console.log(`Cards Generated:   ${deck.cards.length}`)
    console.log('═'.repeat(65))
    deck.cards.forEach((c, idx) => {
      console.log(
        `[Card ${idx + 1}] Role: ${c.role.toUpperCase()} (S: ${c.fsrsParameters.stability}d, D: ${c.fsrsParameters.difficulty})`,
      )
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: eval
  const sampleTurns = [
    {
      id: 't-1',
      speaker: 'user' as const,
      role: 'questioner' as const,
      turnIndex: 0,
      text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial rather than eukaryotic in origin?',
      timestamp: Date.now() - 30000,
      icapLevel: 'constructive' as const,
      elaborationScore: 75,
    },
    {
      id: 't-2',
      speaker: 'user' as const,
      role: 'clarifier' as const,
      turnIndex: 1,
      text: 'Building on what you said, cardiolipin in the inner membrane refutes inward pinching because eukaryotic membranes lack cardiolipin.',
      timestamp: Date.now() - 20000,
      icapLevel: 'interactive' as const,
      elaborationScore: 85,
      resolvedMisconceptionId: 'misc-endo-1',
    },
    {
      id: 't-3',
      speaker: 'user' as const,
      role: 'summarizer' as const,
      turnIndex: 2,
      text: 'To synthesize, symbiogenesis proves that macroevolutionary transitions occur through genomic fusion rather than isolated point mutations.',
      timestamp: Date.now() - 10000,
      icapLevel: 'constructive' as const,
      elaborationScore: 70,
    },
    {
      id: 't-4',
      speaker: 'user' as const,
      role: 'predictor' as const,
      turnIndex: 3,
      text: 'Consequently, exposing cells to chloramphenicol arrests mitochondrial translation because their 70S ribosomes share bacterial antibiotic sensitivity.',
      timestamp: Date.now(),
      icapLevel: 'interactive' as const,
      elaborationScore: 90,
    },
  ]

  const evalResult = evaluateReciprocalSession(sampleTurns, passage)

  console.log('\n📊 Reciprocal Dialogue Cognitive Telemetry (Palincsar & Brown 1984, Chi 2014)')
  console.log('═'.repeat(65))
  console.log(`Passage:               ${passage.title}`)
  console.log(`Dialogue Maturity:     ${evalResult.rdms}/100 RDMS`)
  console.log(`Mastery Band:          ${evalResult.masteryBand.toUpperCase()}`)
  console.log(`ICAP Composite (ICS):  ${evalResult.icap.ics}/100`)
  console.log(
    `ICAP Distribution:     Inter: ${(evalResult.icap.interactiveRatio * 100).toFixed(0)}% | Const: ${(evalResult.icap.constructiveRatio * 100).toFixed(0)}% | Act: ${(evalResult.icap.activeRatio * 100).toFixed(0)}%`,
  )
  console.log(`Strategy Balance:      ${evalResult.strategy.rsbs}/100 RSBS (Entropy)`)
  console.log(
    `Elaboration Depth:     EDI ${evalResult.elaboration.edi} (${evalResult.elaboration.causalConnectorsCount} causal connectors)`,
  )
  console.log(
    `Metacognitive Repair:  ${(evalResult.repair.mrr * 100).toFixed(0)}% MRR (${evalResult.repair.successfulRepairs}/${evalResult.repair.attemptedRepairs})`,
  )
  console.log('─'.repeat(65))
  console.log(`Feedback: ${evalResult.feedback.join(' ')}`)
}

// ── 12. Claim-Evidence-Reasoning (CER) & Epistemic Argumentation Command ──────
export async function cerCommand(args: string[]): Promise<void> {
  const debates = CANONICAL_SCIENTIFIC_DEBATES
  const sub = args[0]

  if (sub === 'debates' || sub === 'list') {
    console.log('\n⚖️ Canonical Scientific Debates (McNeill & Krajcik 2012, Kuhn 1991)')
    console.log('═'.repeat(65))
    debates.forEach((d) => {
      console.log(`• [${d.id}] ${d.title}`)
      console.log(`  Domain: ${d.domain} | Difficulty: ${d.difficulty}`)
      console.log(`  Question: "${d.focalQuestion}"`)
      console.log(
        `  Claims: ${d.competingClaims.length} | Evidence Items: ${d.evidencePool.length} | Principles: ${d.scientificPrinciples.length}`,
      )
      console.log('─'.repeat(65))
    })
    return
  }

  const debateId = parseFlag(args, '--debate') || 'debate-amoc-tipping'
  const debate = debates.find((d) => d.id === debateId) ?? debates[0]!

  if (sub === 'counter') {
    const claimId = parseFlag(args, '--claim') || debate.competingClaims[0]!.id
    const counter = generateAdversarialCounterArgument(debate, claimId)
    console.log('\n⚔️ Socratic Counter-Argument Crucible (TAP Level 4/5)')
    console.log('═'.repeat(65))
    console.log(`Debate:       ${debate.title}`)
    console.log(`Opponent:     ${counter.counterTheorist}`)
    console.log(`Counter-Claim: "${counter.counterClaim}"`)
    console.log(`Basis:        ${counter.counterEvidence}`)
    console.log('─'.repeat(65))
    console.log(`Challenge Prompt:\n"${counter.rebuttalChallenge}"`)
    return
  }

  if (sub === 'deck') {
    const submission: CERArgumentSubmission = {
      debateId: debate.id,
      selectedClaimId: debate.competingClaims[0]!.id,
      claimStatement: debate.competingClaims[0]!.claim,
      selectedEvidenceIds: [debate.evidencePool[0]!.id],
      userEvidenceSynthesis: 'Primary observational evidence.',
      selectedPrincipleIds: [debate.scientificPrinciples[0]!.id],
      userReasoningStatement: 'Salt-advection density feedback slows down AMOC.',
    }
    const evaluation = evaluateCERArgument(debate, submission)
    const deck = generateCERFSRSDeck(debate, submission, evaluation)

    console.log('\n📦 Calibrated FSRS-6 Epistemic Argumentation Deck')
    console.log(`Debate:            ${deck.debateTitle}`)
    console.log(`Epistemic Rigor:   ${deck.ersBaseline}/100 ERS`)
    console.log(`Cards Generated:   ${deck.cards.length}`)
    console.log('═'.repeat(65))
    deck.cards.forEach((c, idx) => {
      console.log(
        `[Card ${idx + 1}] Type: ${c.cardType.toUpperCase()} (S: ${c.fsrsParameters.stability}d, D: ${c.fsrsParameters.difficulty})`,
      )
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: eval
  const robustSubmission: CERArgumentSubmission = {
    debateId: debate.id,
    selectedClaimId: 'claim-amoc-tipping-near',
    claimStatement:
      'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
    selectedEvidenceIds: ['ev-amoc-sst-autocorr', 'ev-amoc-paleo-glacier', 'ev-amoc-cmip6-bias'],
    userEvidenceSynthesis:
      'Subpolar SST fingerprints exhibit critical slowing down with increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
    selectedPrincipleIds: ['princ-salt-advection', 'princ-critical-slowing'],
    userReasoningStatement:
      'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
    targetedCounterArgumentId: 'counter-amoc-rapid',
    userRebuttalStatement:
      'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
  }

  const evalResult = evaluateCERArgument(debate, robustSubmission)

  console.log('\n⚖️ Claim-Evidence-Reasoning Telemetry (McNeill & Krajcik 2012, Osborne 2004)')
  console.log('═'.repeat(65))
  console.log(`Debate:              ${debate.title}`)
  console.log(`Epistemic Rigor:     ${evalResult.ers}/100 ERS`)
  console.log(`Toulmin Level:       Level ${evalResult.tapLevel} / 5 TAP`)
  console.log(`Mastery Band:        ${evalResult.masteryBand.toUpperCase()}`)
  console.log(`CER Completeness:    ${evalResult.ccs}/100 CCS`)
  console.log(`Evidence Quality:    ${evalResult.eqi}/100 EQI (Reliability & Triangulation)`)
  console.log(`Reasoning Depth:     ${evalResult.rdi}/100 RDI (Causal Warrants)`)
  console.log('─'.repeat(65))
  console.log(`Strengths:   ${evalResult.epistemicStrengths.join('; ')}`)
  console.log(`Feedback:    ${evalResult.feedback.join(' ')}`)
}

// ── 13. Anchored Instruction & Situated Macrocontext Command (CTGV 1990, 1992) ──
export async function anchoredCommand(args: string[]): Promise<void> {
  const cases = CANONICAL_MACROCONTEXT_CASES
  const sub = args[0]

  if (sub === 'cases' || sub === 'list') {
    console.log('\n⚓ Canonical Macrocontext Scenarios (CTGV 1990, 1992, Jasper Woodbury)')
    console.log('═'.repeat(65))
    cases.forEach((c) => {
      console.log(`• [${c.id}] ${c.title}`)
      console.log(`  Domain: ${c.domain} | Difficulty: ${c.difficulty}`)
      console.log(`  Mission Goal: "${c.missionGoal}"`)
      console.log(
        `  Embedded Data: ${c.embeddedData.length} items | Sub-Goals: ${c.subGoalHierarchy.length} | Constraints: ${c.constraints.length}`,
      )
      console.log('─'.repeat(65))
    })
    return
  }

  const caseId = parseFlag(args, '--case') || 'case-jasper-flight'
  const macroCase = cases.find((c) => c.id === caseId) ?? cases[0]!

  if (sub === 'sensitivity') {
    const paramId = parseFlag(args, '--param') || 'data-headwind-speed'
    const valueStr = parseFlag(args, '--val') || '25'
    const variedValue = parseFloat(valueStr)
    const sim = simulateAnchoredSensitivity(macroCase, paramId, variedValue)

    console.log('\n🎛️ Anchored What-If Sensitivity Simulator')
    console.log('═'.repeat(65))
    console.log(`Case:          ${macroCase.title}`)
    console.log(
      `Parameter:     ${sim.parameterId} (Original: ${sim.originalValue} -> Varied: ${sim.variedValue})`,
    )
    console.log('─'.repeat(65))
    console.log('Simulated Outputs:')
    Object.entries(sim.simulatedOutputs).forEach(([k, v]) => {
      console.log(`  • ${k}: ${v.toFixed(3)}`)
    })
    console.log('─'.repeat(65))
    console.log('Constraint Impacts:')
    sim.constraintImpacts.forEach((ci) => {
      const status = ci.isSatisfied ? '✅ SATISFIED' : '❌ VIOLATED'
      console.log(
        `  [${status}] ${ci.constraintId} (margin: ${ci.margin.toFixed(2)}) ${ci.warningMessage ? '— ' + ci.warningMessage : ''}`,
      )
    })
    return
  }

  if (sub === 'deck') {
    const dummySubmission: LearnerSolutionSubmission = {
      caseId: macroCase.id,
      extractedDataValues: {},
      subGoalSequence: macroCase.subGoalHierarchy.map((sg) => sg.id),
      calculatedSubGoalOutputs: {},
      finalDecisionChoice: 'optimal_decision',
      decisionJustification: 'Optimal calibrated pathway.',
    }
    const evaluation = evaluateAnchoredSolution(macroCase, dummySubmission)
    evaluation.ikrs = 88
    const deck = generateAnchoredFSRSDeck(macroCase, evaluation)

    console.log('\n📦 Calibrated FSRS-6 Anchored Problem-Solving Deck')
    console.log(`Case:             ${deck.caseTitle}`)
    console.log(`IKRS Baseline:    ${deck.ikrsBaseline}/100 IKRS`)
    console.log(`Cards Generated:  ${deck.cards.length}`)
    console.log('═'.repeat(65))
    deck.cards.forEach((c, idx) => {
      console.log(
        `[Card ${idx + 1}] Type: ${c.cardType.toUpperCase()} (S: ${c.fsrsParameters.stability}d, D: ${c.fsrsParameters.difficulty})`,
      )
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: eval
  const sampleSubmission: LearnerSolutionSubmission = {
    caseId: macroCase.id,
    extractedDataValues: Object.fromEntries(
      macroCase.embeddedData.filter((d) => d.isRelevant).map((d) => [d.id, d.value]),
    ),
    subGoalSequence: macroCase.subGoalHierarchy.map((sg) => sg.id),
    calculatedSubGoalOutputs: Object.fromEntries(
      macroCase.subGoalHierarchy.map((sg) => [sg.id, sg.expectedValue]),
    ),
    finalDecisionChoice: 'optimal_decision',
    decisionJustification:
      'All navigation, fuel reserves, and flight constraints met with verified margin across daylight hours and fuel limits.',
  }

  const evalResult = evaluateAnchoredSolution(macroCase, sampleSubmission)

  console.log('\n⚓ Anchored Problem-Solving Telemetry (CTGV 1990, 1992, Catrambone 1998)')
  console.log('═'.repeat(65))
  console.log(`Case:                ${macroCase.title}`)
  console.log(`IKRS Score:          ${evalResult.ikrs}/100 (Inert Knowledge Resistance Score)`)
  console.log(`Maturity Band:       ${evalResult.maturityBand.toUpperCase()}`)
  console.log(`Sub-Goal Alignment:  ${evalResult.sgai}/100 SGAI`)
  console.log(`Data Extraction:     ${evalResult.eier}/100 EIER (Signal vs Distractor)`)
  console.log(`Constraint Rigor:    ${evalResult.cpr}/100 CPR`)
  console.log(`Decision Approved:   ${evalResult.decisionApproved ? 'YES' : 'NO'}`)
  console.log('─'.repeat(65))
  console.log(`Strengths:    ${evalResult.strengths.join('; ')}`)
  console.log(`Feedback:     ${evalResult.pedagogicalFeedback.join(' ')}`)
}

// ── 14. Contrasting Cases Command (Schwartz & Bransford 1998, 2004) ─────────

export function contrastingCommand(args: string[]): void {
  const sub = args[0] || 'sets'
  const setId = parseFlag(args, '--id') || 'set-density-buoyancy'
  const caseSet =
    CANONICAL_CONTRASTING_SETS.find((s) => s.id === setId) || CANONICAL_CONTRASTING_SETS[0]

  if (sub === 'sets' || sub === 'list') {
    console.log(
      `\n🔍 Canonical Contrasting Cases & Invention Sets (${CANONICAL_CONTRASTING_SETS.length} available)`,
    )
    console.log('═'.repeat(65))
    CANONICAL_CONTRASTING_SETS.forEach((s) => {
      console.log(`• [${s.domain.toUpperCase()}] ${s.title} (${s.id})`)
      console.log(`  Difficulty:      ${s.difficulty}`)
      console.log(`  Variants:        ${s.variants.length} contrasting cases`)
      console.log(`  Dimensions:      ${s.dimensions.length} perceptual dimensions`)
      console.log(`  Canonical Goal:  ${s.canonicalTelling.formalLawName}`)
      console.log(`  Equation:        ${s.canonicalTelling.formalEquation}`)
      console.log()
    })
    return
  }

  if (sub === 'deck') {
    const dummySubmission: InventedMetricSubmission = {
      setId: caseSet.id,
      inventedMetricName: 'Crowding Ratio Index',
      formulaDescription:
        'Computes the ratio of structural mass or items per unit dimensional volume or area across all contrasting cases.',
      selectedDimensionIds: caseSet.dimensions.filter((d) => d.isDeepDimension).map((d) => d.id),
      variantRankings: [...caseSet.variants]
        .sort((a, b) => a.outcomeValue - b.outcomeValue)
        .map((v) => v.id),
      impasseEncountered: true,
      reflectionNotes:
        'Encountered impasse when trying to use single dimension; coordinated two dimensions.',
    }
    const evaluation = evaluateContrastingAttempt(caseSet, dummySubmission)
    evaluation.cdts = 88
    const deck = generateContrastingFSRSDeck(caseSet, evaluation)

    console.log('\n📦 Calibrated FSRS-6 Contrasting Cases Deck')
    console.log(`Set:             ${deck.setTitle}`)
    console.log(`CDTS Baseline:   ${deck.cdtsBaseline}/100 CDTS`)
    console.log(`Cards Generated: ${deck.cards.length}`)
    console.log('═'.repeat(65))
    deck.cards.forEach((c, idx) => {
      console.log(
        `[Card ${idx + 1}] Type: ${c.cardType.toUpperCase()} (S: ${c.fsrsParameters.stability}d, D: ${c.fsrsParameters.difficulty})`,
      )
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: eval
  const sampleSubmission: InventedMetricSubmission = {
    setId: caseSet.id,
    inventedMetricName: 'Density Buoyancy Ratio',
    formulaDescription:
      'Calculates ratio of mass to volume across all variants to predict flotation displacement invariant.',
    selectedDimensionIds: caseSet.dimensions.filter((d) => d.isDeepDimension).map((d) => d.id),
    variantRankings: [...caseSet.variants]
      .sort((a, b) => a.outcomeValue - b.outcomeValue)
      .map((v) => v.id),
    impasseEncountered: true,
    reflectionNotes:
      'Discovered that volume alone or mass alone fails; ratio of mass to volume yields invariant order.',
  }

  const evalResult = evaluateContrastingAttempt(caseSet, sampleSubmission)

  console.log('\n🔍 Contrasting Cases Invention Telemetry (Schwartz & Bransford 1998, 2004)')
  console.log('═'.repeat(65))
  console.log(`Set:                 ${caseSet.title}`)
  console.log(
    `CDTS Score:          ${evalResult.cdts}/100 (Contrasting Differentiation & Transfer Score)`,
  )
  console.log(`Maturity Band:       ${evalResult.maturityBand.toUpperCase()}`)
  console.log(
    `Discrimination:      ${evalResult.fdrs}/100 FDRS (Feature Discrimination Rigor Score)`,
  )
  console.log(`Metric Invariance:   ${evalResult.imi}/100 IMI (Invented Metric Invariance)`)
  console.log(`Preparation Transfer:${evalResult.pfri}/100 PFRI (Preparation for Future Learning)`)
  console.log(`Ranking Accuracy:    ${evalResult.rankingAccuracy}%`)
  console.log(`Productive Impasse:  ${evalResult.impasseProductive ? 'YES' : 'NO'}`)
  console.log('─'.repeat(65))
  console.log(`Strengths:    ${evalResult.strengths.join('; ')}`)
  console.log(`Feedback:     ${evalResult.pedagogicalFeedback.join(' ')}`)
}

// ── 15. Collaborative Scripts Command (King 1997, 1999; Weinberger & Fischer 2006) ──

export function collaborativeCommand(args: string[]): void {
  const sub = args[0] || 'scenarios'
  const scenarioId = parseFlag(args, '--id') || 'collab-neuro-synaptic-plasticity'
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === scenarioId) ||
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!

  if (sub === 'scenarios' || sub === 'list') {
    console.log(
      `\n🤝 Canonical CSCL Collaborative Dilemmas & Scripts (${CANONICAL_COLLABORATIVE_SCENARIOS.length} available)`,
    )
    console.log('═'.repeat(65))
    CANONICAL_COLLABORATIVE_SCENARIOS.forEach((s) => {
      console.log(`• [${s.domain.toUpperCase()}] ${s.title} (${s.id})`)
      console.log(`  Difficulty:      ${s.difficulty}`)
      console.log(`  Perspectives:    ${s.competingPerspectives.map((p) => p.label).join(' vs ')}`)
      console.log(`  Invariants:      ${s.invariantsForSynthesis.map((i) => i.name).join('; ')}`)
      console.log(`  Simulated Peer:  ${s.simulatedPeer.name} (${s.simulatedPeer.role})`)
      console.log(`  Dilemma:         ${s.centralDilemma}`)
      console.log()
    })
    return
  }

  if (sub === 'partner') {
    const learnerTurn =
      parseFlag(args, '--text') ||
      'Because you argued late-LTP is sufficient, how do you prevent catastrophic saturation?'
    const peerTurn = generateCollaborativePeerTurn(scenario, learnerTurn, 0)
    console.log(`\n💬 Simulated Socratic Peer Response (${scenario.simulatedPeer.name})`)
    console.log('═'.repeat(65))
    console.log(`Speaker:    ${peerTurn.speaker} (${peerTurn.role})`)
    console.log(`Speech Act: ${peerTurn.speechAct}`)
    console.log(`Reply:      ${peerTurn.text}`)
    return
  }

  if (sub === 'deck') {
    const dummySubmission: DiscourseSubmission = {
      scenarioId: scenario.id,
      learnerInitialPosition: 'Initial position statement.',
      dialogueTurns: [
        {
          id: 'turn-dummy',
          speaker: 'learner',
          role: 'synthesizer',
          text: 'Because we integrate Frey-Morris synaptic tagging with homeostatic scaling, local tags capture global PRPs while homeostatic depression maintains contrast.',
          speechAct: 'transactive_synthesis',
          epistemicKeywords: [],
        },
      ],
      jointSynthesis: 'Integrated invariant model coordinating both perspectives.',
      individualTransferAnswer: 'Transferred to artificial neural networks.',
    }
    const evaluation = evaluateCollaborativeDiscourse(scenario, dummySubmission)
    evaluation.cei = 90
    const deck = generateCollaborativeFSRSDeck(scenario, evaluation)

    console.log('\n📦 Calibrated FSRS-6 Collaborative Dialectic Deck')
    console.log(`Scenario:        ${deck.scenarioTitle}`)
    console.log(`CEI Baseline:    ${deck.ceiBaseline}/100 CEI`)
    console.log(`Cards Generated: ${deck.cards.length}`)
    console.log('═'.repeat(65))
    deck.cards.forEach((c, idx) => {
      console.log(
        `[Card ${idx + 1}] Type: ${c.cardType.toUpperCase()} (S: ${c.fsrsParameters.stability}d, D: ${c.fsrsParameters.difficulty})`,
      )
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: eval
  const sampleSubmission: DiscourseSubmission = {
    scenarioId: scenario.id,
    learnerInitialPosition:
      'Late-LTP provides the primary protein synthesis substrate for synaptic efficacy, but requires spatial regulation to prevent saturation.',
    dialogueTurns: [
      {
        id: 'turn-1',
        speaker: 'learner',
        role: 'proposer',
        text: 'Because you stated that local protein synthesis at dendritic spines is the sole determinant of retention, how does your proposal account for the BCM paradox where untagged neighboring synapses drift into runaway excitability?',
        speechAct: 'transactive_critique',
        epistemicKeywords: ['bcm_paradox'],
      },
      {
        id: 'turn-2',
        speaker: 'learner',
        role: 'synthesizer',
        text: 'Building upon your argument, if we integrate Frey-Morris synaptic tagging with homeostatic synaptic scaling, weak stimulation sets a local tag whereas strong stimulation triggers cell-wide PRPs, therefore reconciling local specificity with global dynamic range.',
        speechAct: 'transactive_synthesis',
        epistemicKeywords: ['tag_and_capture'],
      },
    ],
    jointSynthesis:
      'We conclude that memory persistence depends on Frey-Morris Synaptic Tagging & Capture Coordination combined with a BCM sliding threshold: local tags capture global PRPs while homeostatic LTD depotentiates untagged inputs to maintain contrast.',
    individualTransferAnswer:
      'When applying this to artificial neural networks, local gradient updates serve as synaptic tags while global weight decay acts as homeostatic LTD, preventing catastrophic gradient explosion.',
  }

  const evalResult = evaluateCollaborativeDiscourse(scenario, sampleSubmission)

  console.log(
    '\n🤝 CSCL Transactive Discourse Telemetry (King 1997, 1999; Weinberger & Fischer 2006)',
  )
  console.log('═'.repeat(65))
  console.log(`Scenario:            ${scenario.title}`)
  console.log(
    `CEI Score:           ${evalResult.cei}/100 (Composite Collaborative Epistemic Index)`,
  )
  console.log(`Maturity Band:       ${evalResult.maturityBand.toUpperCase()}`)
  console.log(`Transactivity:       ${evalResult.tdi}/100 TDI (Transactive Discourse Index)`)
  console.log(`Epistemic Depth:     ${evalResult.eed}/100 EED (Epistemic Elaboration Depth)`)
  console.log(`Script Compliance:   ${evalResult.scr}/100 SCR (Script Compliance Rigor)`)
  console.log(
    `Invariants Found:    ${evalResult.synthesizedInvariantsIdentified.join('; ') || 'None'}`,
  )
  console.log('─'.repeat(65))
  console.log(`Strengths:    ${evalResult.strengths.join('; ')}`)
  console.log(`Feedback:     ${evalResult.pedagogicalFeedback.join(' ')}`)
}

// ── 16. System Dynamics & Feedback Loop Modeling (Forrester 1968, Sterman 2000, Meadows 2008) ──

export function systemDynamicsCommand(args: string[]): void {
  const sub = args[0] || 'scenarios'
  const scenarioId = parseFlag(args, '--id') || 'climate-permafrost-methane'
  const scenario =
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.find((s) => s.id === scenarioId) ||
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS[0]!

  if (sub === 'scenarios' || sub === 'list') {
    console.log(
      `\n🔄 Canonical System Dynamics Scenarios (${CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.length} available)`,
    )
    console.log('═'.repeat(65))
    CANONICAL_SYSTEM_DYNAMICS_SCENARIOS.forEach((s) => {
      console.log(`• [${s.domain.toUpperCase()}] ${s.title} (${s.id})`)
      console.log(`  Difficulty:      ${s.difficulty}`)
      console.log(`  Stocks:          ${s.stocks.map((st) => st.name).join(', ')}`)
      console.log(`  Flows:           ${s.flows.map((f) => f.name).join(', ')}`)
      console.log(`  Archetype:       ${s.canonicalArchetype.toUpperCase()}`)
      console.log(`  Leverage Points: ${s.leveragePoints.length} Meadows leverage interventions`)
      console.log(`  Context:         ${s.contextDescription}`)
      console.log()
    })
    return
  }

  if (sub === 'simulate') {
    const steps = parseInt(parseFlag(args, '--steps') || '40', 10)
    const multiplier = parseFloat(parseFlag(args, '--multiplier') || '1.0')
    const primaryFlow = scenario.flows[0]?.id
    const flowMultipliers: Record<string, number> = {}
    if (primaryFlow) {
      flowMultipliers[primaryFlow] = multiplier
    }

    const sim = runEulerSimulation(scenario, steps, scenario.defaultDt, {
      flowRateMultipliers: flowMultipliers,
    })

    console.log(`\n📈 Euler Numerical Integration Trajectory (${scenario.title})`)
    console.log('═'.repeat(65))
    console.log(`Steps:           ${sim.durationSteps} (dt = ${sim.dt})`)
    console.log(`Overshoot:       ${sim.hasOvershoot ? 'YES (Tipping Threshold)' : 'No'}`)
    console.log(`Oscillation:     ${sim.hasOscillation ? 'YES (Delay Resonance)' : 'No'}`)
    console.log(`Final State:     ${sim.summary}`)
    console.log('─'.repeat(65))
    const sampleSteps = sim.steps.filter((_, idx) => idx % Math.ceil(steps / 8) === 0)
    sampleSteps.forEach((st) => {
      const stockSummary = Object.entries(st.stocks)
        .map(([k, v]) => `${k}=${Math.round(v * 10) / 10}`)
        .join(', ')
      console.log(`Step ${st.step} (t=${st.time}): ${stockSummary}`)
    })
    return
  }

  if (sub === 'deck') {
    const sdi = parseInt(parseFlag(args, '--sdi') || '85', 10)
    const mockEvaluation = {
      sfdr: sdi,
      flia: sdi,
      dam: sdi,
      ars: sdi,
      sdi,
      maturityTier: sdi >= 85 ? ('leverage_strategist' as const) : ('dynamic_simulator' as const),
      strengths: ['CLI synthesized evaluation baseline.'],
      systemicFeedback: [],
      archetypeDiscrepancies: [],
      leveragePointAnalysis: 'High leverage rule intervention.',
    }
    const deck = generateSystemDynamicsFSRSDeck(scenario, mockEvaluation)

    console.log('\n📦 Calibrated FSRS-6 System Dynamics Deck')
    console.log(`Scenario:        ${deck.scenarioTitle}`)
    console.log(`SDI Baseline:    ${deck.sdi}/100 SDI`)
    console.log(`Cards Generated: ${deck.cards.length}`)
    console.log('═'.repeat(65))
    deck.cards.forEach((c, idx) => {
      console.log(
        `[Card ${idx + 1}] Type: ${c.cardType.toUpperCase()} (S: ${c.fsrsParameters.stability}d, D: ${c.fsrsParameters.difficulty})`,
      )
      console.log(`Q: ${c.front}`)
      console.log(`A: ${c.back}`)
      console.log('─'.repeat(65))
    })
    return
  }

  // Default: eval
  const sampleHypothesis: LearnerModelHypothesis = {
    scenarioId: scenario.id,
    classifiedVariables: [
      ...scenario.stocks.map((st) => ({ id: st.id, nature: 'stock' as const })),
      ...scenario.flows.map((f) => ({ id: f.id, nature: 'flow' as const })),
    ],
    identifiedLoops: scenario.canonicalLoops.map((cl) => ({
      id: cl.id,
      polarity: cl.polarity,
      elementIds: cl.elementIds,
      delayIdentified: (cl.delaySteps ?? 0) > 0,
    })),
    identifiedArchetype: scenario.canonicalArchetype,
    proposedHighLeverageIntervention:
      'Rewire systemic rules and information channels to alter loop dominance.',
    predictedBehavior: 'overshoot_and_collapse',
  }

  const evalResult = evaluateLearnerModel(scenario, sampleHypothesis)

  console.log(
    '\n🔄 System Dynamics Evaluation Telemetry (Forrester 1968, Sterman 2000, Meadows 2008)',
  )
  console.log('═'.repeat(65))
  console.log(`Scenario:            ${scenario.title}`)
  console.log(`SDI Score:           ${evalResult.sdi}/100 (Composite System Dynamics Index)`)
  console.log(`Maturity Tier:       ${evalResult.maturityTier.toUpperCase()}`)
  console.log(`Stock-Flow (SFDR):   ${evalResult.sfdr}/100 (Bathtub Discrimination)`)
  console.log(`Loop Polarity(FLIA): ${evalResult.flia}/100 (Polarity Accuracy)`)
  console.log(`Delay Metric (DAM):  ${evalResult.dam}/100 (Lag Awareness)`)
  console.log(`Archetype (ARS):     ${evalResult.ars}/100 (Archetype Alignment)`)
  console.log('─'.repeat(65))
  console.log(`Strengths:    ${evalResult.strengths.join('; ')}`)
  console.log(`Feedback:     ${evalResult.systemicFeedback.join(' ') || 'None'}`)
  console.log(`Leverage:     ${evalResult.leveragePointAnalysis}`)
}

export function modelInquiryCommand(args: string[]): void {
  const sub = args[0] || 'scenarios'
  const scenarioId = parseFlag(args, '--id') || 'galileo_falling_bodies'
  const scenarios = listGedankenScenarios()
  const scenario = getGedankenScenario(scenarioId) || scenarios[0]!

  if (sub === 'scenarios' || sub === 'list') {
    console.log(`\n🔭 Canonical Gedankenexperiment Scenarios (${scenarios.length} available)`)
    console.log('═'.repeat(65))
    scenarios.forEach((s) => {
      console.log(`• [${s.domain.toUpperCase()}] ${s.title} (${s.id})`)
      console.log(`  Origin:          ${s.historicalOrigin}`)
      console.log(`  Target:          ${s.targetPhenomenon}`)
      console.log(`  Folk Barrier:    ${s.folkConception}`)
      console.log(`  Extreme Cases:   ${s.extremeCases.map((e) => e.name).join(', ')}`)
      console.log(`  Resolution:      ${s.canonicalResolution.title}`)
      console.log()
    })
    return
  }

  if (sub === 'perturb') {
    const caseId = parseFlag(args, '--case') || scenario.extremeCases[0]?.id || ''
    const result = perturbExtremeCase(scenario.id, caseId)

    console.log(`\n⚡ Extreme Case Perturbation (${scenario.title})`)
    console.log('═'.repeat(65))
    if (!result.valid) {
      console.log(`Error: ${result.consequence}`)
      return
    }
    console.log(`Variable:        ${result.extremeCase?.name}`)
    console.log(`Asymptotic Run:  ${result.asymptoticBehavior}`)
    console.log(`Paradox Outcome: ${result.consequence}`)
    console.log(`Explanation:     ${result.extremeCase?.scientificExplanation}`)
    return
  }

  if (sub === 'simulate') {
    const stepIds = scenario.simulativeSteps.map((s) => s.id)
    const result = simulateMentalAnimation(scenario.id, stepIds)

    console.log(`\n🧠 Simulative Mental Animation (${scenario.title})`)
    console.log('═'.repeat(65))
    console.log(`Fidelity Score:  ${result.fidelityScore}%`)
    console.log(`Contradictions:  ${result.contradictionsExposed.length} identified`)
    console.log('─'.repeat(65))
    result.observations.forEach((obs) => console.log(`• ${obs}`))
    if (result.contradictionsExposed.length > 0) {
      console.log('─'.repeat(65))
      console.log('⚠️ Contradiction Crucibles:')
      result.contradictionsExposed.forEach((c) => console.log(`  ! ${c}`))
    }
    return
  }

  if (sub === 'deck') {
    const deck = generateModelInquiryFsrsDeck(scenario.id)

    console.log('\n📦 Calibrated FSRS-6 Model Inquiry Deck')
    console.log(`Scenario:        ${scenario.title}`)
    console.log(`Cards Generated: ${deck.length}`)
    console.log('─'.repeat(65))
    deck.forEach((c, i) => {
      console.log(`[Card ${i + 1}] ${c.front.split('\n')[0]}`)
      console.log(`Back: ${c.back.slice(0, 100)}...`)
      console.log()
    })
    return
  }

  // Default: evaluate
  const sampleInput: InquirySessionInput = {
    scenarioId: scenario.id,
    selectedExtremeCaseIds: scenario.extremeCases.map((e) => e.id),
    extremeCasePredictions: {
      [scenario.extremeCases[0]?.id || '']: 'Symmetrical invariance eliminates boundary disparity.',
    },
    simulativeStepOrder: scenario.simulativeSteps.map((s) => s.id),
    identifiedContradictions: ['Simultaneous incompatible deduction branches in folk model'],
    selectedBridgingId: scenario.bridgingAnalogies[0]?.id,
    bridgingExplanation:
      'Intermediate symmetrical analogy demonstrates that physical connection cannot alter acceleration.',
    revisedModelHypothesis:
      'Inertial mass cancels gravitational mass; gravitational acceleration is invariant with respect to falling mass.',
  }

  const evalResult = evaluateInquirySession(sampleInput)

  console.log(
    '\n🔭 Model-Based Inquiry Telemetry (Clement 2008, Nersessian 2002, Johnson-Laird 1983)',
  )
  console.log('═'.repeat(65))
  console.log(`Scenario:            ${scenario.title}`)
  console.log(`MBRI Score:          ${evalResult.compositeIndex}/100 (Model-Based Reasoning Index)`)
  console.log(`Maturity Tier:       ${evalResult.tier.toUpperCase()}`)
  console.log(`Extreme Case (ECDI): ${evalResult.extremeCaseScore}/100`)
  console.log(`Animation (SAF):     ${evalResult.animationFidelityScore}/100`)
  console.log(`Bridging (BAS):      ${evalResult.bridgingAnalogyScore}/100`)
  console.log(`Modification (MMS):  ${evalResult.modelModificationScore}/100`)
  console.log('─'.repeat(65))
  console.log(`Strengths:           ${evalResult.feedback.strengths.join('; ')}`)
  if (evalResult.feedback.recommendations.length > 0) {
    console.log(`Recommendations:     ${evalResult.feedback.recommendations.join('; ')}`)
  }
}
