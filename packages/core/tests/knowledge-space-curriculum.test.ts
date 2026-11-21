/**
 * @file knowledge-space-curriculum.test.ts
 * @description Unit tests for Curriculum & LHCF Ingestion into Knowledge Space Theory & Learning Spaces
 *
 * Grounded in:
 * - LHCF Curriculum Architecture (docs/adr/0003)
 * - Doignon & Falmagne (1999) & Falmagne & Doignon (2011) Learning Spaces
 * - Curriculum prerequisite auditing, bottleneck detection, and well-graded verification
 */

import { describe, expect, it } from 'vitest'
import {
  convertCurriculumToKnowledgeSpace,
  auditCurriculumStructure,
  getCurriculumReadiness,
  type CurriculumInput,
} from '../src/knowledge-space/curriculum-bridge'
import {
  verifyWellGradedStructure,
  enumerateLearningPaths,
  countTotalLearningPaths,
} from '../src/knowledge-space/well-graded'
import { getCanonicalKnowledgeSpaces } from '../src/knowledge-space/canonical-spaces'

describe('Curriculum Ingestion & Well-Graded Learning Spaces (Falmagne & Doignon 2011)', () => {
  const sampleCurriculum: CurriculumInput = {
    id: 'cs-foundations',
    title: 'Computer Science Foundations',
    modules: [
      {
        id: 'mod-1',
        title: 'Module 1: Variables & Logic',
        lessons: [
          {
            id: 'les-01-vars',
            title: 'Variables and Memory Models',
            prerequisites: [],
            difficulty: 0.2,
          },
          {
            id: 'les-02-control',
            title: 'Control Flow & Conditionals',
            prerequisites: ['les-01-vars'],
            difficulty: 0.35,
          },
        ],
      },
      {
        id: 'mod-2',
        title: 'Module 2: Iteration & Functions',
        lessons: [
          {
            id: 'les-03-loops',
            title: 'Loops & Iteration',
            prerequisites: ['les-02-control'],
            difficulty: 0.5,
          },
          {
            id: 'les-04-recursion',
            title: 'Recursive Functions & Call Stacks',
            prerequisites: ['les-02-control'],
            difficulty: 0.65,
          },
          {
            id: 'les-05-dsa',
            title: 'Linear Data Structures',
            prerequisites: ['les-03-loops', 'les-04-recursion'],
            difficulty: 0.8,
          },
        ],
      },
    ],
  }

  it('converts a curriculum with prerequisite links into a valid quasi-ordinal knowledge space', () => {
    const { structure, surmiseRelations } = convertCurriculumToKnowledgeSpace(sampleCurriculum)

    expect(structure.domainItems).toHaveLength(5)
    expect(surmiseRelations.length).toBeGreaterThanOrEqual(4)
    expect(structure.isKnowledgeSpace).toBe(true)
    expect(structure.isQuasiOrdinal).toBe(true)
    expect(structure.states.length).toBeGreaterThan(0)
  })

  it('performs an in-depth curriculum structure audit detecting bottlenecks and well-gradedness', () => {
    const report = auditCurriculumStructure(sampleCurriculum)

    expect(report.curriculumId).toBe('cs-foundations')
    expect(report.totalLessons).toBe(5)
    expect(report.hasCycles).toBe(false)
    expect(report.cycles).toHaveLength(0)
    expect(report.isWellGraded).toBe(true)

    // les-02-control is a bottleneck because both les-03 and les-04 depend on it
    const bottleneck = report.bottleneckLessons.find((b) => b.lessonId === 'les-02-control')
    expect(bottleneck).toBeDefined()
    expect(bottleneck?.dependentCount).toBe(2)
  })

  it('identifies cyclic prerequisite dead-ends in broken curricula', () => {
    const brokenCurriculum: CurriculumInput = {
      id: 'broken-curriculum',
      title: 'Broken Circular Curriculum',
      modules: [
        {
          id: 'mod-circular',
          title: 'Circular Module',
          lessons: [
            { id: 'l1', title: 'Lesson 1', prerequisites: ['l2'] },
            { id: 'l2', title: 'Lesson 2', prerequisites: ['l1'] }, // Cycle!
          ],
        },
      ],
    }

    const report = auditCurriculumStructure(brokenCurriculum)
    expect(report.hasCycles).toBe(true)
    expect(report.cycles.length).toBeGreaterThanOrEqual(1)
  })

  it('computes learner readiness (outer fringe K⁺) for partial lesson completion', () => {
    // Learner has completed les-01-vars
    const readiness = getCurriculumReadiness(sampleCurriculum, ['les-01-vars'])

    expect(readiness.completedLessons).toEqual(['les-01-vars'])
    // Outer fringe should be les-02-control
    expect(readiness.readyLessons).toEqual(['les-02-control'])
  })

  it('verifies that canonical Elementary Algebra is a well-graded Learning Space', () => {
    const [algebraSpace] = getCanonicalKnowledgeSpaces()
    expect(algebraSpace).toBeDefined()

    const wellGradedCheck = verifyWellGradedStructure(algebraSpace!)
    expect(wellGradedCheck.isWellGraded).toBe(true)
    expect(wellGradedCheck.violations).toHaveLength(0)

    const paths = enumerateLearningPaths(algebraSpace!, 10)
    expect(paths.length).toBeGreaterThan(0)

    const totalPaths = countTotalLearningPaths(algebraSpace!)
    expect(totalPaths).toBeGreaterThanOrEqual(paths.length)
  })

  it('verifies that canonical Data Structures & Algorithms is well-graded', () => {
    const [, dsaSpace] = getCanonicalKnowledgeSpaces()
    expect(dsaSpace).toBeDefined()

    const wellGradedCheck = verifyWellGradedStructure(dsaSpace!)
    expect(wellGradedCheck.isWellGraded).toBe(true)
    expect(wellGradedCheck.violations).toHaveLength(0)

    const paths = enumerateLearningPaths(dsaSpace!, 10)
    expect(paths.length).toBeGreaterThan(0)
  })
})
