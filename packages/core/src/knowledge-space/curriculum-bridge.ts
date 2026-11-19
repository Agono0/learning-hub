/**
 * @file curriculum-bridge.ts
 * @description Ingestion of Curricula (LHCF) into Knowledge Space Structures & Learning Space Auditing
 *
 * Grounded in:
 * - Learning Hub Curriculum Format (LHCF) specification (docs/adr/0003)
 * - Doignon & Falmagne (1999) & Falmagne & Doignon (2011) - Well-graded learning space verification
 * - Prerequisite DAG validation, bottleneck analysis, and adaptive lesson recommendations
 *
 * @module @learning-hub/core/knowledge-space
 */

import type { KSTItem, KnowledgeStructure, SurmiseRelation } from './types'
import { buildQuasiOrdinalKnowledgeSpace, detectSurmiseCycles } from './surmise'
import { computeFringes } from './structure'
import { verifyWellGradedStructure, enumerateLearningPaths } from './well-graded'

export interface CurriculumInput {
  id: string
  title: string
  description?: string
  modules: Array<{
    id: string
    title: string
    lessons: Array<{
      id: string
      title: string
      summary?: string
      prerequisites?: string[]
      difficulty?: number
      estimatedMinutes?: number
    }>
  }>
}

export interface CurriculumAuditReport {
  curriculumId: string
  curriculumTitle: string
  totalLessons: number
  totalPrerequisiteEdges: number
  hasCycles: boolean
  cycles: string[][]
  isWellGraded: boolean
  wellGradedViolationsCount: number
  totalKnowledgeStates: number
  sampleLearningPathsCount: number
  bottleneckLessons: Array<{ lessonId: string; dependentCount: number }>
  orphanLessons: string[]
}

/**
 * Converts a curriculum with prerequisite links into a Quasi-Ordinal Knowledge Space.
 */
export function convertCurriculumToKnowledgeSpace(curriculum: CurriculumInput): {
  structure: KnowledgeStructure
  surmiseRelations: SurmiseRelation[]
} {
  const items: KSTItem[] = []
  const relations: SurmiseRelation[] = []

  for (const mod of curriculum.modules) {
    for (const lesson of mod.lessons) {
      items.push({
        id: lesson.id,
        title: lesson.title,
        description: lesson.summary || `Lesson in module ${mod.title}`,
        domain: curriculum.title,
        difficulty: lesson.difficulty ?? 0.5,
        estimatedTimeMinutes: lesson.estimatedMinutes ?? 10,
        slipProbability: 0.1,
        guessProbability: 0.15,
        tags: [curriculum.id, mod.id],
        skillsRequired: lesson.prerequisites || [],
        prompt: `Explain and apply the key concepts of ${lesson.title}`,
        solution: `Mastery synthesis of ${lesson.title} grounded in prerequisites.`,
      })

      if (lesson.prerequisites) {
        for (const prereqId of lesson.prerequisites) {
          relations.push({
            prerequisiteId: prereqId,
            targetId: lesson.id,
            confidence: 1.0,
            rationale: `Curriculum prerequisite from lesson '${lesson.id}' to '${prereqId}'`,
          })
        }
      }
    }
  }

  const structure = buildQuasiOrdinalKnowledgeSpace(
    `kst-curriculum-${curriculum.id}`,
    curriculum.title,
    items,
    relations,
  )

  return { structure, surmiseRelations: relations }
}

/**
 * Performs an in-depth Knowledge Space Theory audit of a curriculum's prerequisite architecture.
 */
export function auditCurriculumStructure(curriculum: CurriculumInput): CurriculumAuditReport {
  const { structure, surmiseRelations } = convertCurriculumToKnowledgeSpace(curriculum)
  const itemIds = structure.domainItems.map((i) => i.id)

  const cycles = detectSurmiseCycles(itemIds, surmiseRelations)
  const wellGradedCheck = verifyWellGradedStructure(structure)
  const paths = enumerateLearningPaths(structure, 5)

  // Prerequisite dependents count
  const dependentCounts = new Map<string, number>()
  for (const id of itemIds) dependentCounts.set(id, 0)
  for (const rel of surmiseRelations) {
    const curr = dependentCounts.get(rel.prerequisiteId) || 0
    dependentCounts.set(rel.prerequisiteId, curr + 1)
  }

  const bottleneckLessons = Array.from(dependentCounts.entries())
    .map(([lessonId, dependentCount]) => ({ lessonId, dependentCount }))
    .filter((b) => b.dependentCount >= 2)
    .sort((a, b) => b.dependentCount - a.dependentCount)

  // Orphan lessons: lessons with no incoming prerequisites and no outgoing dependents
  const hasPrereq = new Set(surmiseRelations.map((r) => r.targetId))
  const isPrereq = new Set(surmiseRelations.map((r) => r.prerequisiteId))
  const orphanLessons = itemIds.filter((id) => !hasPrereq.has(id) && !isPrereq.has(id))

  return {
    curriculumId: curriculum.id,
    curriculumTitle: curriculum.title,
    totalLessons: itemIds.length,
    totalPrerequisiteEdges: surmiseRelations.length,
    hasCycles: cycles.length > 0,
    cycles,
    isWellGraded: wellGradedCheck.isWellGraded,
    wellGradedViolationsCount: wellGradedCheck.violations.length,
    totalKnowledgeStates: structure.states.length,
    sampleLearningPathsCount: paths.length,
    bottleneckLessons,
    orphanLessons,
  }
}

/**
 * Computes the learner's immediate ready-to-study lessons (outer fringe K⁺)
 * based on completed lessons in a curriculum.
 */
export function getCurriculumReadiness(
  curriculum: CurriculumInput,
  completedLessonIds: string[],
): {
  currentStateId: string
  completedLessons: string[]
  readyLessons: string[]
  innerFringe: string[]
  outerFringe: string[]
} {
  const { structure } = convertCurriculumToKnowledgeSpace(curriculum)
  const fringes = computeFringes(completedLessonIds, structure)

  return {
    currentStateId: fringes.stateId,
    completedLessons: completedLessonIds,
    readyLessons: fringes.outerFringe,
    innerFringe: fringes.innerFringe,
    outerFringe: fringes.outerFringe,
  }
}
