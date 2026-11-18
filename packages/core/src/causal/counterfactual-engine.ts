import { z } from 'zod'
/**
 * Structural Causal Modeling (SCM) & Counterfactual Simulator Engine
 *
 * Grounded in Judea Pearl's Causal Hierarchy and Structural Equation Framework:
 * - Pearl, J. (2000, 2009). Causality: Models, Reasoning, and Inference. Cambridge University Press.
 * - Woodward, J. (2003). Making Things Happen: A Theory of Causal Explanation. Oxford University Press.
 * - Pearl, J., Glymour, M., & Jewell, N. P. (2016). Causal Inference in Statistics: A Primer. Wiley.
 *
 * Features:
 * 1. Pearl's 3-level Ladder of Causation:
 *    - Level 1: Association (Seeing) P(y | x)
 *    - Level 2: Intervention (Doing) P(y | do(x)) via graph surgery
 *    - Level 3: Counterfactuals (Imagining) P(y_x | x', y') via Abduction-Action-Prediction
 * 2. d-Separation & Path Analysis:
 *    - Traverses chains, forks, and colliders.
 *    - Validates whether conditioning sets block or open paths (collider bias detection).
 * 3. Backdoor Adjustment Admissibility:
 *    - Verifies backdoor criterion sets to isolate genuine causal effects from confounding.
 * 4. Structural Graph Surgery:
 *    - Mutilates incoming parent edges under do(X = x) interventions.
 * 5. Diagnostic Misconception Evaluator:
 *    - Detects confounding neglect, collider stratification fallacy, and mediator over-control.
 * 6. Curriculum Bridge:
 *    - Modulates analytical problem-solving transfer based on causal hierarchy fluency.
 */

// ── Types ────────────────────────────────────────────────────────────

export type VariableType = 'continuous' | 'discrete' | 'binary'

export interface CausalVariable {
  id: string
  name: string
  description: string
  type: VariableType
  domain: [number, number] // [min, max]
  defaultValue: number
  observedValue?: number
}

export interface StructuralEquation {
  targetId: string
  parentIds: string[]
  formulaDescription: string
  /**
   * Deterministic structural function:
   * target = f(parents, exogenousU)
   */
  evaluate: (parentValues: Record<string, number>, exogenousU: number) => number
  /**
   * Inverts equation for Abduction:
   * exogenousU = f^-1(target, parents)
   */
  abduceExogenous: (targetValue: number, parentValues: Record<string, number>) => number
  defaultExogenousU: number
}

export interface CausalEdge {
  fromId: string
  toId: string
  label?: string
  coefficient?: number // for linear approximations
}

export interface StructuralCausalModel {
  id: string
  title: string
  domain: string
  variables: Record<string, CausalVariable>
  edges: CausalEdge[]
  equations: Record<string, StructuralEquation>
}

export type PathSegmentType = 'chain' | 'fork' | 'collider'

export interface CausalPath {
  nodes: string[]
  segments: {
    nodeA: string
    nodeB: string
    nodeC: string
    type: PathSegmentType
  }[]
  isBlocked: boolean
  blockingReason: string
}

export interface Intervention {
  variableId: string
  targetValue: number
}

export interface CounterfactualQuery {
  modelId: string
  evidence: Record<string, number> // factual observations (e.g., { StudyHours: 1, Passed: 0 })
  interventions: Record<string, number> // hypothetical action do(StudyHours = 4)
  targetVariableId: string // e.g., 'Passed' or 'ExamScore'
}

export interface CounterfactualResult {
  targetVariableId: string
  factualValue: number
  counterfactualValue: number
  causalLift: number // counterfactual - factual
  exogenousStates: Record<string, number> // abduced U values
  interventionsApplied: Record<string, number>
  mutilatedEdges: CausalEdge[]
  narrativeExplanation: string
}

export type CausalLadderLevel = 'L1_ASSOCIATIONAL' | 'L2_INTERVENTIONAL' | 'L3_COUNTERFACTUAL'

export type CausalMisconceptionType =
  | 'CONFOUNDING_NEGLECT'
  | 'COLLIDER_STRATIFICATION_FALLACY'
  | 'MEDIATOR_OVERCONTROL'
  | 'COUNTERFACTUAL_BACKGROUND_MUTATION'

export interface CausalDiagnosticProblem {
  id: string
  title: string
  scenarioDescription: string
  model: StructuralCausalModel
  queryType: CausalLadderLevel
  question: string
  options: {
    id: string
    text: string
    isCorrect: boolean
    misconceptionDetected?: CausalMisconceptionType
    explanation: string
  }[]
}

export interface CausalReasoningAssessment {
  overallMasteryScore: number // 0 - 100
  ladderLevelAchieved: CausalLadderLevel
  associationalAccuracy: number // %
  interventionalAccuracy: number // %
  counterfactualAccuracy: number // %
  diagnosedMisconceptions: CausalMisconceptionType[]
  recommendation: string
}

export interface CausalCurriculumBridge {
  originalMastery: number
  causalMasteryScore: number
  ladderLevel: CausalLadderLevel
  transferMultiplier: number
  modulatedMastery: number
  reasoningNotes: string[]
}

// ── Built-In Domain Causal Models ────────────────────────────────────

/**
 * Standard Educational & Cognitive Intervention SCM:
 * Confounder (Prior Knowledge / Aptitude) -> Study Strategies -> Exam Performance
 * Confounder -> Time Invested -> Exam Performance
 * Sleep Quality -> Cognitive Load Buffer -> Exam Performance
 */
export function createStandardEducationSCM(): StructuralCausalModel {
  return {
    id: 'edu_exam_causality',
    title: 'Study Architecture & Examination Causal Network',
    domain: 'Cognitive Science & Learning Mechanics',
    variables: {
      Aptitude: {
        id: 'Aptitude',
        name: 'Prior Aptitude & Schema Base',
        description: 'Exogenous baseline foundational knowledge and schema density.',
        type: 'continuous',
        domain: [0, 100],
        defaultValue: 50,
      },
      StudyTechnique: {
        id: 'StudyTechnique',
        name: 'Study Technique Quality',
        description: '0 = Passive Rereading, 100 = Successive Retrieval & Epistemic Synthesis.',
        type: 'continuous',
        domain: [0, 100],
        defaultValue: 40,
      },
      StudyHours: {
        id: 'StudyHours',
        name: 'Deliberate Study Hours',
        description: 'Time dedicated to deliberate task execution.',
        type: 'continuous',
        domain: [0, 40],
        defaultValue: 10,
      },
      SleepRest: {
        id: 'SleepRest',
        name: 'Sleep & Synaptic Consolidation',
        description: 'Quality of SWS/REM sleep and circadian alignment.',
        type: 'continuous',
        domain: [0, 100],
        defaultValue: 70,
      },
      WorkingMemoryStrain: {
        id: 'WorkingMemoryStrain',
        name: 'Cognitive Working Memory Strain',
        description: 'Extraneous cognitive load and mental fatigue during exam.',
        type: 'continuous',
        domain: [0, 100],
        defaultValue: 35,
      },
      ExamScore: {
        id: 'ExamScore',
        name: 'Standardized Exam Score',
        description: 'Final measured objective performance (0 to 100).',
        type: 'continuous',
        domain: [0, 100],
        defaultValue: 65,
      },
    },
    edges: [
      { fromId: 'Aptitude', toId: 'StudyTechnique', label: 'Schema scaffolding' },
      { fromId: 'Aptitude', toId: 'ExamScore', label: 'Direct prior foundation' },
      { fromId: 'StudyTechnique', toId: 'ExamScore', label: 'Retrieval efficiency' },
      { fromId: 'StudyHours', toId: 'ExamScore', label: 'Repetition volume' },
      { fromId: 'StudyHours', toId: 'WorkingMemoryStrain', label: 'Mental fatigue' },
      { fromId: 'SleepRest', toId: 'WorkingMemoryStrain', label: 'Consolidation buffer' },
      { fromId: 'WorkingMemoryStrain', toId: 'ExamScore', label: 'Cognitive interference' },
    ],
    equations: {
      Aptitude: {
        targetId: 'Aptitude',
        parentIds: [],
        formulaDescription: 'Aptitude = U_Aptitude',
        evaluate: (_parents, u) => Math.min(100, Math.max(0, u)),
        abduceExogenous: (target) => target,
        defaultExogenousU: 50,
      },
      StudyTechnique: {
        targetId: 'StudyTechnique',
        parentIds: ['Aptitude'],
        formulaDescription: 'StudyTechnique = 0.4 * Aptitude + U_Tech',
        evaluate: (parents, u) => {
          const apt = parents.Aptitude ?? 50
          return Math.min(100, Math.max(0, 0.4 * apt + u))
        },
        abduceExogenous: (target, parents) => {
          const apt = parents.Aptitude ?? 50
          return target - 0.4 * apt
        },
        defaultExogenousU: 20,
      },
      StudyHours: {
        targetId: 'StudyHours',
        parentIds: [],
        formulaDescription: 'StudyHours = U_Hours',
        evaluate: (_parents, u) => Math.min(40, Math.max(0, u)),
        abduceExogenous: (target) => target,
        defaultExogenousU: 12,
      },
      SleepRest: {
        targetId: 'SleepRest',
        parentIds: [],
        formulaDescription: 'SleepRest = U_Sleep',
        evaluate: (_parents, u) => Math.min(100, Math.max(0, u)),
        abduceExogenous: (target) => target,
        defaultExogenousU: 70,
      },
      WorkingMemoryStrain: {
        targetId: 'WorkingMemoryStrain',
        parentIds: ['StudyHours', 'SleepRest'],
        formulaDescription: 'Strain = 2.0 * StudyHours - 0.5 * SleepRest + U_Strain',
        evaluate: (parents, u) => {
          const h = parents.StudyHours ?? 10
          const s = parents.SleepRest ?? 70
          return Math.min(100, Math.max(0, 2.0 * h - 0.5 * s + u))
        },
        abduceExogenous: (target, parents) => {
          const h = parents.StudyHours ?? 10
          const s = parents.SleepRest ?? 70
          return target - (2.0 * h - 0.5 * s)
        },
        defaultExogenousU: 45,
      },
      ExamScore: {
        targetId: 'ExamScore',
        parentIds: ['Aptitude', 'StudyTechnique', 'StudyHours', 'WorkingMemoryStrain'],
        formulaDescription:
          'Score = 0.35 * Aptitude + 0.30 * StudyTechnique + 0.8 * StudyHours - 0.25 * Strain + U_Exam',
        evaluate: (parents, u) => {
          const apt = parents.Aptitude ?? 50
          const tech = parents.StudyTechnique ?? 40
          const hours = parents.StudyHours ?? 10
          const strain = parents.WorkingMemoryStrain ?? 35
          const raw = 0.35 * apt + 0.3 * tech + 0.8 * hours - 0.25 * strain + u
          return Math.min(100, Math.max(0, Math.round(raw * 10) / 10))
        },
        abduceExogenous: (target, parents) => {
          const apt = parents.Aptitude ?? 50
          const tech = parents.StudyTechnique ?? 40
          const hours = parents.StudyHours ?? 10
          const strain = parents.WorkingMemoryStrain ?? 35
          return target - (0.35 * apt + 0.3 * tech + 0.8 * hours - 0.25 * strain)
        },
        defaultExogenousU: 10,
      },
    },
  }
}

// ── Graph & Topological Algorithms ───────────────────────────────────

/**
 * Returns nodes sorted in topological order (parents before children).
 */
export function getTopologicalSort(model: StructuralCausalModel): string[] {
  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}

  for (const varId of Object.keys(model.variables)) {
    inDegree[varId] = 0
    adj[varId] = []
  }

  for (const edge of model.edges) {
    if (inDegree[edge.toId] !== undefined) {
      inDegree[edge.toId]++
    }
    if (adj[edge.fromId]) {
      adj[edge.fromId].push(edge.toId)
    }
  }

  const queue: string[] = Object.keys(inDegree).filter((id) => inDegree[id] === 0)
  const sorted: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(current)

    for (const neighbor of adj[current] ?? []) {
      inDegree[neighbor]--
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor)
      }
    }
  }

  if (sorted.length !== Object.keys(model.variables).length) {
    // Cyclic graph detected, fallback to arbitrary keys
    return Object.keys(model.variables)
  }

  return sorted
}

/**
 * Returns parent IDs for a given variable.
 */
export function getParents(model: StructuralCausalModel, varId: string): string[] {
  return model.edges.filter((e) => e.toId === varId).map((e) => e.fromId)
}

/**
 * Returns child IDs for a given variable.
 */
export function getChildren(model: StructuralCausalModel, varId: string): string[] {
  return model.edges.filter((e) => e.fromId === varId).map((e) => e.toId)
}

/**
 * Returns all descendants of a variable in the DAG.
 */
export function getDescendants(model: StructuralCausalModel, varId: string): Set<string> {
  const descendants = new Set<string>()
  const queue = [...getChildren(model, varId)]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (!descendants.has(curr)) {
      descendants.add(curr)
      queue.push(...getChildren(model, curr))
    }
  }

  return descendants
}

// ── d-Separation & Path Analysis ─────────────────────────────────────

/**
 * Classifies a 3-node path segment into chain, fork, or collider.
 */
export function classifySegment(
  model: StructuralCausalModel,
  nodeA: string,
  nodeB: string,
  nodeC: string,
): PathSegmentType {
  const isAtoB = model.edges.some((e) => e.fromId === nodeA && e.toId === nodeB)
  const isBtoA = model.edges.some((e) => e.fromId === nodeB && e.toId === nodeA)
  const isBtoC = model.edges.some((e) => e.fromId === nodeB && e.toId === nodeC)
  const isCtoB = model.edges.some((e) => e.fromId === nodeC && e.toId === nodeB)

  if (isAtoB && isCtoB) return 'collider' // A -> B <- C
  if (isBtoA && isBtoC) return 'fork' // A <- B -> C
  return 'chain' // A -> B -> C or C -> B -> A
}

/**
 * Finds all simple paths between two nodes (treating edges as undirected for path exploration).
 */
export function findAllPaths(
  model: StructuralCausalModel,
  startId: string,
  endId: string,
  maxDepth = 6,
): string[][] {
  const paths: string[][] = []
  const visited = new Set<string>()

  function dfs(curr: string, currentPath: string[]) {
    if (curr === endId) {
      paths.push([...currentPath])
      return
    }
    if (currentPath.length >= maxDepth) return

    visited.add(curr)

    // Neighbors in undirected skeleton
    const neighbors: string[] = []
    for (const e of model.edges) {
      if (e.fromId === curr && !visited.has(e.toId)) neighbors.push(e.toId)
      if (e.toId === curr && !visited.has(e.fromId)) neighbors.push(e.fromId)
    }

    for (const n of neighbors) {
      dfs(n, [...currentPath, n])
    }

    visited.delete(curr)
  }

  dfs(startId, [startId])
  return paths
}

/**
 * Checks whether a given path is blocked by conditioning set Z under Pearl's d-separation rules.
 */
export function isPathBlocked(
  model: StructuralCausalModel,
  path: string[],
  conditioningSet: Set<string>,
): { isBlocked: boolean; reason: string; segments: CausalPath['segments'] } {
  if (path.length < 3) {
    return {
      isBlocked: false,
      reason: 'Direct edge path cannot be d-separated.',
      segments: [],
    }
  }

  const segments: CausalPath['segments'] = []

  for (let i = 0; i < path.length - 2; i++) {
    const a = path[i]
    const b = path[i + 1]
    const c = path[i + 2]
    const type = classifySegment(model, a, b, c)

    segments.push({ nodeA: a, nodeB: b, nodeC: c, type })

    if (type === 'collider') {
      // Collider: blocked UNLESS collider b OR one of its descendants is in conditioningSet
      const bDescendants = getDescendants(model, b)
      const bOrDescendantConditioned =
        conditioningSet.has(b) || [...bDescendants].some((d) => conditioningSet.has(d))

      if (!bOrDescendantConditioned) {
        return {
          isBlocked: true,
          reason: `Collider '${b}' is NOT conditioned upon (nor its descendants), blocking the path.`,
          segments,
        }
      }
    } else {
      // Chain or Fork: blocked IF intermediate node b is in conditioningSet
      if (conditioningSet.has(b)) {
        return {
          isBlocked: true,
          reason: `Intermediate node '${b}' in ${type} is conditioned upon, blocking spurious flow.`,
          segments,
        }
      }
    }
  }

  return {
    isBlocked: false,
    reason: 'All segments are open; path is active.',
    segments,
  }
}

/**
 * Evaluates whether X and Y are d-separated given set Z.
 */
export function checkDSeparation(
  model: StructuralCausalModel,
  xId: string,
  yId: string,
  conditioningSetIds: string[],
): { isSeparated: boolean; paths: CausalPath[] } {
  const zSet = new Set(conditioningSetIds)
  const rawPaths = findAllPaths(model, xId, yId)
  const paths: CausalPath[] = []
  let allBlocked = true

  for (const p of rawPaths) {
    const analysis = isPathBlocked(model, p, zSet)
    paths.push({
      nodes: p,
      segments: analysis.segments,
      isBlocked: analysis.isBlocked,
      blockingReason: analysis.reason,
    })
    if (!analysis.isBlocked) {
      allBlocked = false
    }
  }

  return {
    isSeparated: allBlocked,
    paths,
  }
}

/**
 * Validates whether a candidate conditioning set Z satisfies the Backdoor Criterion for (X, Y):
 * 1. No node in Z is a descendant of X.
 * 2. Z blocks every backdoor path between X and Y (paths starting with an arrow into X: X <- ...).
 */
export function evaluateBackdoorAdmissibility(
  model: StructuralCausalModel,
  xId: string,
  yId: string,
  candidateZ: string[],
): { isAdmissible: boolean; violations: string[] } {
  const violations: string[] = []
  const xDescendants = getDescendants(model, xId)
  const zSet = new Set(candidateZ)

  // Condition 1: No node in Z is a descendant of X
  for (const z of candidateZ) {
    if (xDescendants.has(z)) {
      violations.push(
        `Variable '${z}' is a descendant of '${xId}'. Conditioning on descendants introduces post-treatment bias.`,
      )
    }
  }

  // Condition 2: Must block all backdoor paths
  const allPaths = findAllPaths(model, xId, yId)
  const backdoorPaths = allPaths.filter((p) => {
    if (p.length < 2) return false
    // Backdoor path means edge points into X: p[1] -> p[0] (which is xId)
    return model.edges.some((e) => e.fromId === p[1] && e.toId === xId)
  })

  for (const bp of backdoorPaths) {
    const check = isPathBlocked(model, bp, zSet)
    if (!check.isBlocked) {
      violations.push(
        `Backdoor path [${bp.join(' ↔ ')}] remains open, confounding the causal estimate.`,
      )
    }
  }

  return {
    isAdmissible: violations.length === 0,
    violations,
  }
}

// ── Graph Surgery & Level 2 Interventions (do-calculus) ──────────────

/**
 * Mutilates graph under do(X = x) by severing all incoming edges to X.
 */
export function mutilateGraph(
  model: StructuralCausalModel,
  intervenedVariableIds: string[],
): { mutilatedModel: StructuralCausalModel; removedEdges: CausalEdge[] } {
  const intervenedSet = new Set(intervenedVariableIds)
  const removedEdges: CausalEdge[] = []
  const retainedEdges: CausalEdge[] = []

  for (const edge of model.edges) {
    if (intervenedSet.has(edge.toId)) {
      removedEdges.push(edge)
    } else {
      retainedEdges.push(edge)
    }
  }

  const mutilatedModel: StructuralCausalModel = {
    ...model,
    edges: retainedEdges,
  }

  return { mutilatedModel, removedEdges }
}

/**
 * Executes a Level 2 Interventional Forward Simulation:
 * Evaluates variables in topological order with interventions pinned.
 */
export function simulateIntervention(
  model: StructuralCausalModel,
  interventions: Record<string, number>,
  exogenousValues?: Record<string, number>,
): Record<string, number> {
  const { mutilatedModel } = mutilateGraph(model, Object.keys(interventions))
  const order = getTopologicalSort(mutilatedModel)
  const values: Record<string, number> = {}

  for (const varId of order) {
    if (interventions[varId] !== undefined) {
      values[varId] = interventions[varId]
    } else {
      const eq = model.equations[varId]
      if (eq) {
        const u = exogenousValues?.[varId] ?? eq.defaultExogenousU
        values[varId] = eq.evaluate(values, u)
      } else {
        values[varId] = model.variables[varId]?.defaultValue ?? 0
      }
    }
  }

  return values
}

// ── Level 3 Counterfactual Engine (Pearl 2000, 3-Step Algorithm) ─────

/**
 * Executes Pearl's 3-step Counterfactual Algorithm:
 * 1. Abduction: Compute background exogenous variables U given observed evidence E = e.
 * 2. Action: Replace equations of intervened variables with constant values do(X = x*).
 * 3. Prediction: Compute outcome values in the modified model using the abduced U.
 */
export function evaluateCounterfactual(
  model: StructuralCausalModel,
  query: CounterfactualQuery,
): CounterfactualResult {
  const { evidence, interventions, targetVariableId } = query
  const order = getTopologicalSort(model)

  // Step 1: ABDUCTION
  // Infer exogenous states U_i using observed evidence E
  const abducedU: Record<string, number> = {}
  const reconstructedFactual: Record<string, number> = { ...evidence }

  // Forward fill any unobserved variables with defaults first
  for (const varId of order) {
    if (reconstructedFactual[varId] === undefined) {
      const eq = model.equations[varId]
      if (eq) {
        reconstructedFactual[varId] = eq.evaluate(reconstructedFactual, eq.defaultExogenousU)
      } else {
        reconstructedFactual[varId] = model.variables[varId]?.defaultValue ?? 0
      }
    }
  }

  // Abduce U for each variable
  for (const varId of order) {
    const eq = model.equations[varId]
    if (eq) {
      abducedU[varId] = eq.abduceExogenous(reconstructedFactual[varId], reconstructedFactual)
    } else {
      abducedU[varId] = 0
    }
  }

  const factualValue = reconstructedFactual[targetVariableId] ?? 0

  // Step 2 & 3: ACTION & PREDICTION
  // Mutilate model under interventions and predict with abduced U
  const { removedEdges } = mutilateGraph(model, Object.keys(interventions))
  const counterfactualValues = simulateIntervention(model, interventions, abducedU)
  const counterfactualValue = counterfactualValues[targetVariableId] ?? 0
  const causalLift = Math.round((counterfactualValue - factualValue) * 100) / 100

  // Generate Narrative Explanation
  const interventionStrs = Object.entries(interventions)
    .map(([k, v]) => `${k} had been set to ${v}`)
    .join(' and ')

  const narrativeExplanation =
    `Factual baseline: ${targetVariableId} was ${factualValue}. ` +
    `Under the counterfactual condition that ${interventionStrs} ` +
    `(holding learner's specific background conditions U constant), ` +
    `the predicted ${targetVariableId} is ${counterfactualValue} (Δ ${causalLift > 0 ? '+' : ''}${causalLift}).`

  return {
    targetVariableId,
    factualValue,
    counterfactualValue,
    causalLift,
    exogenousStates: abducedU,
    interventionsApplied: interventions,
    mutilatedEdges: removedEdges,
    narrativeExplanation,
  }
}

// ── Diagnostic Problems & Misconception Evaluation ───────────────────

export function getStandardDiagnosticProblems(): CausalDiagnosticProblem[] {
  const model = createStandardEducationSCM()

  return [
    {
      id: 'p1_confounding_aptitude',
      title: 'Problem 1: Confounder vs Causal Mechanism',
      scenarioDescription:
        'A study finds that students who use Advanced Retrieval Practice score 25 points higher on the exam than students who reread. A researcher concludes: "Adopting retrieval practice will directly boost anyone\'s score by 25 points."',
      model,
      queryType: 'L1_ASSOCIATIONAL',
      question:
        'Why does the observational difference P(ExamScore | Technique) overestimate the true causal effect P(ExamScore | do(Technique))?',
      options: [
        {
          id: 'opt1_correct',
          text: 'Prior Aptitude acts as a common cause (confounder) influencing both technique adoption and exam performance.',
          isCorrect: true,
          explanation:
            'Correct! The fork Aptitude -> StudyTechnique and Aptitude -> ExamScore creates a spurious associational backdoor path.',
        },
        {
          id: 'opt1_confounding_neglect',
          text: 'Because study hours are irrelevant if retrieval practice is used.',
          isCorrect: false,
          misconceptionDetected: 'CONFOUNDING_NEGLECT',
          explanation:
            'Confounding Neglect: Confusing observational correlation with causal effect without accounting for pre-existing baseline confounders.',
        },
        {
          id: 'opt1_collider',
          text: 'Because testing creates a collider between aptitude and sleep.',
          isCorrect: false,
          misconceptionDetected: 'COLLIDER_STRATIFICATION_FALLACY',
          explanation:
            'Collider Stratification Fallacy: Mistaking common causes for common effects.',
        },
      ],
    },
    {
      id: 'p2_collider_fatigue',
      title: 'Problem 2: Collider Conditioning & Berkson’s Fallacy',
      scenarioDescription:
        'In our causal model, StudyHours and SleepRest both influence WorkingMemoryStrain (StudyHours -> Strain <- SleepRest). If a researcher restricts their analysis ONLY to students with high cognitive strain, what artifact occurs?',
      model,
      queryType: 'L2_INTERVENTIONAL',
      question:
        'What is the statistical effect of conditioning on WorkingMemoryStrain between StudyHours and SleepRest?',
      options: [
        {
          id: 'opt2_correct',
          text: 'It induces a spurious negative correlation between StudyHours and SleepRest (Berkson’s Paradox / Collider Bias).',
          isCorrect: true,
          explanation:
            'Conditioning on a collider opens the path between its causes, creating artificial negative dependence.',
        },
        {
          id: 'opt2_mediator_error',
          text: 'It completely isolates the pure causal effect of sleep on memory.',
          isCorrect: false,
          misconceptionDetected: 'MEDIATOR_OVERCONTROL',
          explanation:
            'Over-controlling mediator: Conditioning on downstream effects distorts the relationship between independent causes.',
        },
        {
          id: 'opt2_confounding',
          text: 'It has no effect because StudyHours and SleepRest are inherently correlated in real life.',
          isCorrect: false,
          misconceptionDetected: 'CONFOUNDING_NEGLECT',
          explanation:
            'Failed to recognize that conditioning on a collider opens a previously inactive path.',
        },
      ],
    },
    {
      id: 'p3_counterfactual_abduction',
      title: 'Problem 3: Counterfactual Imagination with Abduction',
      scenarioDescription:
        'Student Bob studied only 4 hours, had poor sleep (40/100), and scored 48 on the exam. Bob asks: "If I had studied 16 hours instead, what would I have scored?"',
      model,
      queryType: 'L3_COUNTERFACTUAL',
      question:
        'In Pearl’s 3-step counterfactual logic, why can we not simply plug StudyHours = 16 into a generic regression formula?',
      options: [
        {
          id: 'opt3_correct',
          text: 'We must first abduce Bob’s latent individual factors (U) from his actual observed outcome (48) before predicting the alternate intervention.',
          isCorrect: true,
          explanation:
            'Counterfactuals hold the specific unit’s background factors (U) invariant between the factual and counterfactual worlds.',
        },
        {
          id: 'opt3_background_mutation',
          text: 'Because studying 16 hours would automatically change his underlying aptitude and genetic predisposition.',
          isCorrect: false,
          misconceptionDetected: 'COUNTERFACTUAL_BACKGROUND_MUTATION',
          explanation:
            'Background Mutation Error: Counterfactual queries evaluate the exact same individual under altered actions, holding exogenous traits invariant.',
        },
        {
          id: 'opt3_assoc_only',
          text: 'Because counterfactuals are unscientific and only observational data matters.',
          isCorrect: false,
          misconceptionDetected: 'CONFOUNDING_NEGLECT',
          explanation:
            'Neglect of Level 3 Counterfactual Reasoning: Structural equations mathematically formalize counterfactual queries.',
        },
      ],
    },
  ]
}

/**
 * Scores user responses and diagnoses causal reasoning proficiency.
 */
export function evaluateDiagnosticResponses(
  responses: Record<string, string>, // problemId -> optionId
): CausalReasoningAssessment {
  const problems = getStandardDiagnosticProblems()
  let correctCount = 0
  let l1Correct = 0
  let l2Correct = 0
  let l3Correct = 0
  const diagnosedMisconceptions: CausalMisconceptionType[] = []

  for (const prob of problems) {
    const chosenOptionId = responses[prob.id]
    const chosenOption = prob.options.find((o) => o.id === chosenOptionId)

    if (chosenOption?.isCorrect) {
      correctCount++
      if (prob.queryType === 'L1_ASSOCIATIONAL') l1Correct++
      if (prob.queryType === 'L2_INTERVENTIONAL') l2Correct++
      if (prob.queryType === 'L3_COUNTERFACTUAL') l3Correct++
    } else if (chosenOption?.misconceptionDetected) {
      diagnosedMisconceptions.push(chosenOption.misconceptionDetected)
    }
  }

  const overallMasteryScore = Math.round((correctCount / problems.length) * 100)

  let ladderLevelAchieved: CausalLadderLevel = 'L1_ASSOCIATIONAL'
  if (l3Correct > 0 && correctCount >= 3) {
    ladderLevelAchieved = 'L3_COUNTERFACTUAL'
  } else if (l2Correct > 0 && correctCount >= 2) {
    ladderLevelAchieved = 'L2_INTERVENTIONAL'
  }

  let recommendation = 'Review basic confounding and observational correlation pitfalls.'
  if (ladderLevelAchieved === 'L3_COUNTERFACTUAL') {
    recommendation =
      'Exemplary causal reasoning: Fluidly distinguishes seeing, doing, and counterfactual imagining.'
  } else if (ladderLevelAchieved === 'L2_INTERVENTIONAL') {
    recommendation =
      'Proficient in graph surgery and do-calculus. Practice Abduction-Action-Prediction counterfactuals.'
  }

  return {
    overallMasteryScore,
    ladderLevelAchieved,
    associationalAccuracy: Math.round((l1Correct / 1) * 100),
    interventionalAccuracy: Math.round((l2Correct / 1) * 100),
    counterfactualAccuracy: Math.round((l3Correct / 1) * 100),
    diagnosedMisconceptions,
    recommendation,
  }
}

// ── Curriculum Bridge ────────────────────────────────────────────────

/**
 * Bridges causal reasoning proficiency to curriculum mastery transfer.
 * High causal literacy prevents cargo-cult study habits and optimizes intervention return.
 */
export function bridgeCausalToCurriculum(
  originalMastery: number,
  causalMasteryScore: number,
  ladderLevel: CausalLadderLevel,
): CausalCurriculumBridge {
  const ladderWeight =
    ladderLevel === 'L3_COUNTERFACTUAL' ? 1.25 : ladderLevel === 'L2_INTERVENTIONAL' ? 1.1 : 1.0

  const normalizedCausal = Math.min(1.0, Math.max(0, causalMasteryScore / 100))
  const transferMultiplier = Math.round((0.85 + normalizedCausal * 0.3 * ladderWeight) * 100) / 100
  const modulatedMastery =
    Math.round(Math.min(1.0, originalMastery * transferMultiplier) * 100) / 100

  const reasoningNotes: string[] = [
    `Causal Ladder Status: ${ladderLevel} (${causalMasteryScore}% proficiency)`,
    `Intervention multiplier: ${transferMultiplier}x transfer fidelity to complex conceptual problem solving.`,
  ]

  if (ladderLevel === 'L3_COUNTERFACTUAL') {
    reasoningNotes.push(
      'Learner possesses Level 3 counterfactual models; capable of rigorous causal error analysis and self-debugging.',
    )
  }

  return {
    originalMastery,
    causalMasteryScore,
    ladderLevel,
    transferMultiplier,
    modulatedMastery,
    reasoningNotes,
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const counterfactualQueryInputSchema = z.object({
  evidence: z.string(),
  interventions: z.record(z.string(), z.number()),
  targetVariableId: z.string().default('ExamScore'),
})
export type CounterfactualQueryInput = z.infer<typeof counterfactualQueryInputSchema>
