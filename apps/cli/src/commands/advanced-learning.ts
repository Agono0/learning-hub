/**
 * Advanced Learning Science & Cognitive Expansion CLI Commands:
 * 1. skills: Matt Pocock agent skills catalog & autonomous code audit
 * 2. relearning: Rawson & Dunlosky (2011, 2012) successive relearning & Ebbinghaus savings
 * 3. srl: Zimmerman (2000) self-regulated learning & metacognitive matrix
 * 4. epistemic: Shaffer (2016) epistemic network analysis & quantitative ethnography
 * 5. causal: Judea Pearl (2000, 2009) structural causal modeling & counterfactuals
 * 6. threshold: Meyer & Land (2003, 2005) threshold concepts & liminal space navigation
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
