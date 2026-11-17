/**
 * @fileoverview Knowledge Graph Traversal, Optimal Learning Paths & Bottleneck Analysis.
 *
 * Implements:
 * 1. Optimal Sequential Learning Path Generation: Topologically ordered traversal
 *    of unmastered transitive prerequisites with personalized review modality assignments.
 * 2. Critical Curriculum Bottleneck Detection: Evaluates prerequisite fan-out to pinpoint
 *    single-point-of-failure concepts blocking downstream advancement.
 * 3. Cross-Domain Conceptual Synthesis: Discovers deep analogies between distinct disciplines
 *    for Socratic dialogue and creative transfer practice.
 */

import type { ConceptNode, PrerequisiteEdge } from './index'

export type ReviewModality =
  | 'feynman_teachback'
  | 'generation_practice'
  | 'spaced_retrieval'
  | 'dual_coding'
  | 'dialectical_debate'

export interface LearningPathStep {
  conceptId: string
  title: string
  domain?: string
  currentMastery: number
  recommendedModality: ReviewModality
  estimatedMinutes: number
  stepIndex: number
  isDirectPrerequisite: boolean
  rationale: string
}

export interface OptimalLearningPath {
  targetConceptId: string
  targetTitle: string
  path: LearningPathStep[]
  totalEstimatedMinutes: number
  chainDepth: number
  foundationalBlockersCount: number
}

export interface TraversalOptions {
  masteryBar?: number // Mastery bar to consider concept learned (default 0.70)
  includeMastered?: boolean // Whether to include already-mastered concepts in the trail
  targetPaceMinutesPerDay?: number // Daily time budget
}

/**
 * Computes the optimal sequential learning path to master a target concept.
 * Explores all prerequisite dependencies, filters by mastery gaps, and topologically
 * orders steps from foundation to advanced application.
 */
export function computeOptimalLearningPath(
  targetConceptId: string,
  nodes: ConceptNode[],
  edges: PrerequisiteEdge[],
  options: TraversalOptions = {},
): OptimalLearningPath {
  const masteryBar = options.masteryBar ?? 0.7
  const nodeMap = new Map<string, ConceptNode>(nodes.map((n) => [n.id, n]))
  const targetNode = nodeMap.get(targetConceptId)

  if (!targetNode) {
    return {
      targetConceptId,
      targetTitle: targetConceptId,
      path: [],
      totalEstimatedMinutes: 0,
      chainDepth: 0,
      foundationalBlockersCount: 0,
    }
  }

  // 1. Collect all transitive prerequisites via Reverse DFS/BFS
  const prereqMap = new Map<string, string[]>() // to -> from[]
  for (const e of edges) {
    const list = prereqMap.get(e.to) ?? []
    list.push(e.from)
    prereqMap.set(e.to, list)
  }

  const directPrereqs = new Set<string>(prereqMap.get(targetConceptId) ?? [])
  const neededConceptIds = new Set<string>()
  const visited = new Set<string>()
  const queue = [targetConceptId]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (visited.has(curr)) continue
    visited.add(curr)

    const parents = prereqMap.get(curr) ?? []
    for (const p of parents) {
      neededConceptIds.add(p)
      if (!visited.has(p)) {
        queue.push(p)
      }
    }
  }

  // 2. Filter concepts by mastery unless includeMastered is true
  const candidates = Array.from(neededConceptIds)
    .map((id) => nodeMap.get(id))
    .filter((n): n is ConceptNode => n !== undefined)
    .filter((n) => (options.includeMastered ? true : n.mastery < masteryBar))

  // Include the target concept itself at the culmination
  const allPathConcepts = [...candidates, targetNode]

  // 3. Topologically sort the path concepts based on edges
  const pathConceptIds = new Set(allPathConcepts.map((n) => n.id))
  const inDegree = new Map<string, number>()
  const forwardAdj = new Map<string, string[]>()

  for (const c of allPathConcepts) {
    inDegree.set(c.id, 0)
    forwardAdj.set(c.id, [])
  }

  for (const e of edges) {
    if (pathConceptIds.has(e.from) && pathConceptIds.has(e.to)) {
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
      const list = forwardAdj.get(e.from) ?? []
      list.push(e.to)
      forwardAdj.set(e.from, list)
    }
  }

  const sortQueue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) sortQueue.push(id)
  }

  const sortedIds: string[] = []
  while (sortQueue.length > 0) {
    const curr = sortQueue.shift()!
    sortedIds.push(curr)
    const nexts = forwardAdj.get(curr) ?? []
    for (const n of nexts) {
      const nextDeg = (inDegree.get(n) ?? 1) - 1
      inDegree.set(n, nextDeg)
      if (nextDeg === 0) sortQueue.push(n)
    }
  }

  // Fallback if graph had unexpected cycle: append any missing candidates
  for (const c of allPathConcepts) {
    if (!sortedIds.includes(c.id)) sortedIds.push(c.id)
  }

  // 4. Construct path steps with tailored review modality
  let totalEstimatedMinutes = 0
  const path: LearningPathStep[] = []

  sortedIds.forEach((id, idx) => {
    const concept = nodeMap.get(id)!
    const isDirect = directPrereqs.has(id)
    const isTarget = id === targetConceptId

    // Cognitive Modality Assignment Heuristic:
    let recommendedModality: ReviewModality = 'spaced_retrieval'
    let estimatedMinutes = 5
    let rationale = 'Foundational concept retrieval refresher.'

    if (concept.mastery < 0.4 || concept.lapses >= 3) {
      recommendedModality = 'feynman_teachback'
      estimatedMinutes = 12
      rationale =
        'Significant mastery deficit or lapse history; teach-back ensures deep mental model formation.'
    } else if (concept.mastery < 0.6) {
      recommendedModality = 'generation_practice'
      estimatedMinutes = 8
      rationale =
        'Partial mastery; active generative retrieval prompts solidify memory traces without passive rereading.'
    } else if (isTarget) {
      recommendedModality = 'dialectical_debate'
      estimatedMinutes = 15
      rationale = 'Culmination target; test comprehensive integration against counterarguments.'
    } else {
      recommendedModality = 'spaced_retrieval'
      estimatedMinutes = 4
      rationale = 'Quick flashcard practice to reactivate prerequisite node.'
    }

    totalEstimatedMinutes += estimatedMinutes

    path.push({
      conceptId: id,
      title: concept.title,
      domain: concept.domain,
      currentMastery: concept.mastery,
      recommendedModality,
      estimatedMinutes,
      stepIndex: idx + 1,
      isDirectPrerequisite: isDirect,
      rationale,
    })
  })

  return {
    targetConceptId,
    targetTitle: targetNode.title,
    path,
    totalEstimatedMinutes,
    chainDepth: Math.max(1, path.length),
    foundationalBlockersCount: candidates.length,
  }
}

export interface CurriculumBottleneck {
  conceptId: string
  title: string
  currentMastery: number
  blockedDependentsCount: number
  blockedConceptTitles: string[]
  severity: 'critical' | 'moderate' | 'minor'
  impactScore: number // Higher = more urgent blocker
  recommendation: string
}

/**
 * Scans the knowledge graph to identify critical prerequisite bottlenecks
 * that impede the learner's progress across multiple modules.
 */
export function identifyCurriculumBottlenecks(
  nodes: ConceptNode[],
  edges: PrerequisiteEdge[],
  masteryThreshold = 0.7,
): CurriculumBottleneck[] {
  const nodeMap = new Map<string, ConceptNode>(nodes.map((n) => [n.id, n]))
  const forwardAdj = new Map<string, string[]>()

  for (const e of edges) {
    const list = forwardAdj.get(e.from) ?? []
    list.push(e.to)
    forwardAdj.set(e.from, list)
  }

  const bottlenecks: CurriculumBottleneck[] = []

  for (const node of nodes) {
    // Only flag concepts where mastery is below threshold
    if (node.mastery >= masteryThreshold) continue

    // Count all reachable downstream dependents via BFS
    const reachable = new Set<string>()
    const queue = [node.id]

    while (queue.length > 0) {
      const curr = queue.shift()!
      const nexts = forwardAdj.get(curr) ?? []
      for (const next of nexts) {
        if (!reachable.has(next)) {
          reachable.add(next)
          queue.push(next)
        }
      }
    }

    if (reachable.size === 0) continue

    const blockedTitles = Array.from(reachable)
      .map((id) => nodeMap.get(id)?.title ?? id)
      .slice(0, 5)

    // Impact score = (1.0 - mastery) * blockedCount * (1 + lapses * 0.2)
    const gap = 1.0 - node.mastery
    const impactScore = Math.round(gap * reachable.size * (1 + node.lapses * 0.25) * 10) / 10

    let severity: 'critical' | 'moderate' | 'minor' = 'minor'
    if (reachable.size >= 4 || impactScore >= 5) severity = 'critical'
    else if (reachable.size >= 2 || impactScore >= 2.5) severity = 'moderate'

    bottlenecks.push({
      conceptId: node.id,
      title: node.title,
      currentMastery: node.mastery,
      blockedDependentsCount: reachable.size,
      blockedConceptTitles: blockedTitles,
      severity,
      impactScore,
      recommendation: `Mastering "${node.title}" will unlock ${reachable.size} dependent concept(s) across your curriculum.`,
    })
  }

  return bottlenecks.sort((a, b) => b.impactScore - a.impactScore)
}

export interface CrossDomainSynthesis {
  conceptA: { id: string; title: string; domain?: string }
  conceptB: { id: string; title: string; domain?: string }
  synthesisPrompt: string
  sharedPrerequisiteTitles: string[]
}

/**
 * Identifies pairs of concepts from differing domains that share foundational
 * prerequisites or complementary structures, generating synthesis prompts.
 */
export function suggestCrossDomainSyntheses(
  nodes: (ConceptNode & { domain?: string })[],
  edges: PrerequisiteEdge[],
): CrossDomainSynthesis[] {
  const nodeMap = new Map<string, ConceptNode & { domain?: string }>(nodes.map((n) => [n.id, n]))
  const prereqMap = new Map<string, Set<string>>()

  for (const e of edges) {
    const set = prereqMap.get(e.to) ?? new Set<string>()
    set.add(e.from)
    prereqMap.set(e.to, set)
  }

  const syntheses: CrossDomainSynthesis[] = []

  for (let i = 0; i < nodes.length; i++) {
    const nodeA = nodes[i]!
    const prereqsA = prereqMap.get(nodeA.id) ?? new Set()

    for (let j = i + 1; j < nodes.length; j++) {
      const nodeB = nodes[j]!

      // Must be from different domains (if domains are populated)
      if (nodeA.domain && nodeB.domain && nodeA.domain === nodeB.domain) continue

      const prereqsB = prereqMap.get(nodeB.id) ?? new Set()

      // Find intersection of shared prerequisites
      const shared: string[] = []
      for (const p of prereqsA) {
        if (prereqsB.has(p)) shared.push(nodeMap.get(p)?.title ?? p)
      }

      if (shared.length > 0) {
        syntheses.push({
          conceptA: { id: nodeA.id, title: nodeA.title, domain: nodeA.domain },
          conceptB: { id: nodeB.id, title: nodeB.title, domain: nodeB.domain },
          sharedPrerequisiteTitles: shared,
          synthesisPrompt: `How does "${nodeA.title}" relate to "${nodeB.title}" through their shared principle of "${shared[0]}"? Contrast their domain-specific applications.`,
        })
      }
    }
  }

  return syntheses.slice(0, 8)
}
