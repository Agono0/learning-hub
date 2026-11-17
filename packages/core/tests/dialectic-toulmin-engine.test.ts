import { describe, expect, it } from 'vitest'
import {
  COMPREHENSIVE_FALLACY_CATALOG,
  DEEP_DIALECTIC_CASES,
  convertToulminToFlashcards,
  detectArgumentFallacies,
  evaluateLakatosMove,
  evaluateToulminGraph,
  type ToulminArgumentGraph,
} from '../src/dialectic'

describe('Socratic Dialectic & Toulmin Argumentation Engine', () => {
  describe('Comprehensive 12-Fallacy Taxonomy', () => {
    it('defines rich cognitive metadata for all 12 formal and informal fallacies', () => {
      const fallacies = Object.keys(COMPREHENSIVE_FALLACY_CATALOG)
      expect(fallacies.length).toBe(12)

      for (const [key, def] of Object.entries(COMPREHENSIVE_FALLACY_CATALOG)) {
        expect(def.key).toBe(key)
        expect(def.label.length).toBeGreaterThan(0)
        expect(def.description.length).toBeGreaterThan(15)
        expect(def.cognitiveTrap.length).toBeGreaterThan(10)
        expect(def.detectionKeywords.length).toBeGreaterThan(0)
        expect(def.pedagogicalRemedy.length).toBeGreaterThan(10)
        expect(def.exampleArgument.length).toBeGreaterThan(10)
        expect(def.counterFraming.length).toBeGreaterThan(10)
      }
    })

    it('detects planted fallacies via syntactic keyword heuristic triggers', () => {
      const text1 = 'Either we rewrite everything in Rust or else the server will crash tomorrow.'
      const matches1 = detectArgumentFallacies(text1)
      expect(matches1.some((m) => m.fallacy === 'false_dichotomy')).toBe(true)

      const text2 =
        'He is only arguing for spaced repetition because he wants to resume-pad his CV.'
      const matches2 = detectArgumentFallacies(text2)
      expect(matches2.some((m) => m.fallacy === 'ad_hominem')).toBe(true)

      const text3 = 'Ever since we started drinking matcha, test scores subsequently increased.'
      const matches3 = detectArgumentFallacies(text3)
      expect(matches3.some((m) => m.fallacy === 'post_hoc_ergo_propter_hoc')).toBe(true)

      const text4 = 'No real scientist would ever question this hypothesis.'
      const matches4 = detectArgumentFallacies(text4)
      expect(matches4.some((m) => m.fallacy === 'no_true_scotsman')).toBe(true)
    })
  })

  describe('Toulmin Argument Graph Evaluator', () => {
    it('identifies floating claims lacking supporting grounds or warrants', () => {
      const ungroundedGraph: ToulminArgumentGraph = {
        id: 'graph-floating',
        topic: 'Floating Hypothesis',
        primaryClaimId: 'claim-1',
        nodes: [
          {
            id: 'claim-1',
            type: 'claim',
            text: 'Sleep consolidation increases retention by 400%.',
            authorRole: 'thesis',
            confidence: 0.9,
            verified: false,
          },
        ],
        edges: [],
      }

      const evalResult = evaluateToulminGraph(ungroundedGraph)
      expect(evalResult.epistemicRigorScore).toBeLessThan(40)
      expect(evalResult.groundingRatio).toBe(0)
      expect(evalResult.structuralVulnerabilities.some((v) => v.severity === 'critical')).toBe(true)
      expect(evalResult.structuralVulnerabilities[0]?.issue).toContain('Floating Claim')
    })

    it('identifies unbacked warrants and missing rebuttal boundary defeaters', () => {
      const partialGraph: ToulminArgumentGraph = {
        id: 'graph-partial',
        topic: 'Memory Retention',
        primaryClaimId: 'c1',
        nodes: [
          {
            id: 'c1',
            type: 'claim',
            text: 'Active recall improves test scores.',
            authorRole: 'thesis',
            confidence: 0.9,
            verified: true,
          },
          {
            id: 'g1',
            type: 'ground',
            text: 'Students scored 25% higher on delayed exams.',
            authorRole: 'thesis',
            confidence: 0.9,
            verified: true,
          },
          {
            id: 'w1',
            type: 'warrant',
            text: 'Testing forces neural reactivation and reconsolidation.',
            authorRole: 'thesis',
            confidence: 0.8,
            verified: false,
          },
        ],
        edges: [
          { id: 'e1', source: 'g1', target: 'c1', relation: 'supports', strength: 0.9 },
          { id: 'e2', source: 'w1', target: 'c1', relation: 'warrants', strength: 0.8 },
        ],
      }

      const evalResult = evaluateToulminGraph(partialGraph)
      expect(
        evalResult.structuralVulnerabilities.some((v) => v.issue.includes('Unbacked Warrant')),
      ).toBe(true)
      expect(
        evalResult.structuralVulnerabilities.some((v) =>
          v.issue.includes('Absence of Boundary Defeaters'),
        ),
      ).toBe(true)
      expect(evalResult.isBloomLevel6Synthesized).toBe(false)
    })

    it('evaluates fully synthesized Bloom Level 6 arguments with high rigor scores', () => {
      const fullGraph = DEEP_DIALECTIC_CASES[0]!.defaultGraph
      const evalResult = evaluateToulminGraph(fullGraph)

      expect(evalResult.epistemicRigorScore).toBeGreaterThanOrEqual(75)
      expect(evalResult.groundingRatio).toBeGreaterThan(0.5)
      expect(evalResult.isBloomLevel6Synthesized).toBe(true)
      expect(evalResult.strengths.length).toBeGreaterThan(1)
      expect(
        evalResult.structuralVulnerabilities.filter((v) => v.severity === 'critical').length,
      ).toBe(0)
    })
  })

  describe('Imre Lakatos Proofs & Refutations Heuristic Lifecycle', () => {
    const conjecture = 'All distributed databases lose availability during network partitions.'
    const counterexample =
      'CRDT-based state-based replicated datastores accept concurrent commutative writes.'

    it('rewards lemma-incorporation that makes underlying assumptions explicit', () => {
      const refinement =
        'Provided that concurrent operations require non-commutative total ordering, network partitions force an availability trade-off.'
      const res = evaluateLakatosMove(conjecture, counterexample, 'lemma_incorporation', refinement)

      expect(res.valid).toBe(true)
      expect(res.score).toBeGreaterThanOrEqual(75)
      expect(res.feedback).toContain('Masterful Lemma-Incorporation')
      expect(res.awardedXp).toBeGreaterThanOrEqual(40)
    })

    it('rewards exception-incorporation that explicitly bounds domain constraints', () => {
      const refinement =
        'Distributed databases lose availability during partitions, except in cases where operations commute mathematically.'
      const res = evaluateLakatosMove(
        conjecture,
        counterexample,
        'exception_incorporation',
        refinement,
      )

      expect(res.valid).toBe(true)
      expect(res.score).toBeGreaterThanOrEqual(70)
      expect(res.feedback).toContain('Excellent Exception-Incorporation')
    })

    it('validates monster-barring when definitions are rigorously tightened', () => {
      const refinement =
        'By strict definition, a database requires ACID linearizability; CRDT stores are not true databases in this formal sense.'
      const res = evaluateLakatosMove(conjecture, counterexample, 'monster_barring', refinement)

      expect(res.valid).toBe(true)
      expect(res.score).toBeGreaterThanOrEqual(60)
      expect(res.feedback).toContain('Valid Monster-Barring')
    })

    it('rejects overly terse or insubstantial responses with guidance', () => {
      const res = evaluateLakatosMove(
        conjecture,
        counterexample,
        'lemma_incorporation',
        'I agree with it.',
      )
      expect(res.valid).toBe(false)
      expect(res.score).toBeLessThan(50)
      expect(res.feedback).toContain('too brief')
    })
  })

  describe('Dialectical Spaced Repetition Bridge', () => {
    it('converts a Toulmin argument graph into high-yield structured flashcards', () => {
      const graph = DEEP_DIALECTIC_CASES[1]!.defaultGraph
      const cards = convertToulminToFlashcards(graph)

      expect(cards.length).toBeGreaterThanOrEqual(3)

      const groundCard = cards.find((c) => c.front.includes('[Toulmin Grounding]'))
      expect(groundCard).toBeDefined()
      expect(groundCard?.back.length).toBeGreaterThan(15)
      expect(groundCard?.tags).toContain('toulmin')

      const warrantCard = cards.find((c) => c.front.includes('[Toulmin Warrant]'))
      expect(warrantCard).toBeDefined()

      const boundaryCard = cards.find((c) => c.front.includes('[Toulmin Boundary]'))
      expect(boundaryCard).toBeDefined()
      expect(boundaryCard?.tags).toContain('boundary-conditions')
    })
  })

  describe('Preset Dialectic Case Catalog', () => {
    it('contains deep cases across multidisciplinary scientific and philosophical domains', () => {
      expect(DEEP_DIALECTIC_CASES.length).toBeGreaterThanOrEqual(3)

      for (const c of DEEP_DIALECTIC_CASES) {
        expect(c.slug.length).toBeGreaterThan(3)
        expect(c.title.length).toBeGreaterThan(5)
        expect(c.thesisAgent.name.length).toBeGreaterThan(0)
        expect(c.antithesisAgent.name.length).toBeGreaterThan(0)
        expect(c.plantedFallacies.length).toBeGreaterThan(0)
        expect(c.lakatosChallenge.primitiveConjecture.length).toBeGreaterThan(10)
        expect(c.lakatosChallenge.counterexample.length).toBeGreaterThan(10)
        expect(c.coreConcepts.length).toBeGreaterThan(3)
        expect(c.defaultGraph.nodes.length).toBeGreaterThan(3)
        expect(c.defaultGraph.edges.length).toBeGreaterThan(2)
      }
    })
  })
})
