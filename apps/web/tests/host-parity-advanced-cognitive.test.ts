/**
 * Host Parity Expansion Integration Tests for Advanced Cognitive Engines
 *
 * Verifies 100% host parity across:
 * 1. MCP Tools (apps/mcp/src/tools/advanced-learning.ts)
 * 2. Terminal CLI Commands (apps/cli/src/commands/advanced-learning.ts)
 * 3. Headless REST Server Routes (apps/server/src/routes.ts)
 *
 * Grounded in learning science:
 * - Matt Pocock Agent Skills & Autonomous Engineering
 * - Rawson & Dunlosky (2011, 2012) Successive Relearning & Ebbinghaus Savings
 * - Zimmerman (2000) Cyclical Self-Regulated Learning (SRL) Matrix
 * - Shaffer (2016) Epistemic Network Analysis (ENA) & Quantitative Ethnography
 * - Judea Pearl (2000, 2009) Structural Causal Modeling & Counterfactuals
 * - Meyer & Land (2003, 2005) Threshold Concepts & Liminal Space Navigation
 */

import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { advancedLearningTools } from '../../mcp/src/tools/advanced-learning'
import {
  skillsCommand,
  relearningCommand,
  srlCommand,
  epistemicCommand,
  causalCommand,
  thresholdCommand,
  zpdCommand,
  pfCommand,
  piCommand,
  inquiryCommand,
} from '../../cli/src/commands/advanced-learning'
import { routes, dispatch } from '../../server/src/routes'

interface McpResultEnvelope {
  content: Array<{ type: string; text: string }>
}

interface SkillItem {
  name: string
  title: string
  category: string
  description: string
}

// Mock HTTP request/response for REST testing using Node Readable stream
function createMockHttp(method: string, path: string, body?: unknown) {
  const stream = Readable.from(body !== undefined ? [Buffer.from(JSON.stringify(body))] : [])
  const req = stream as unknown as IncomingMessage
  req.method = method
  req.url = path
  req.headers = { 'content-type': 'application/json' }

  let statusCode = 200
  let responseData = ''

  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    writeHead: (code: number) => {
      statusCode = code
      return res
    },
    end: (chunk?: string | Buffer) => {
      if (chunk) responseData += chunk.toString()
    },
  } as unknown as ServerResponse

  const execute = async () => {
    await dispatch(req, res)
    return {
      statusCode: (res as unknown as { statusCode: number }).statusCode ?? statusCode,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: responseData ? (JSON.parse(responseData) as Record<string, any>) : {},
    }
  }

  return { req, res, execute }
}

describe('Host Parity Suite — Advanced Cognitive Engines', () => {
  // ── 1. MCP Tools Tests ────────────────────────────────────────────────────
  describe('MCP Tools Parity', () => {
    it('skills_list_catalog returns canonical skills with category filter', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'skills_list_catalog')!
      expect(tool).toBeDefined()

      const allResult = (await tool.handler({})) as unknown as McpResultEnvelope
      const allData = JSON.parse(allResult.content[0]!.text) as {
        count: number
        skills: SkillItem[]
      }
      expect(allData.count).toBeGreaterThanOrEqual(8)
      expect(allData.skills.some((s) => s.name === 'grill-me')).toBe(true)

      const filteredResult = (await tool.handler({
        category: 'pedagogy',
      })) as unknown as McpResultEnvelope
      const filteredData = JSON.parse(filteredResult.content[0]!.text) as { skills: SkillItem[] }
      expect(filteredData.skills.every((s) => s.category === 'pedagogy')).toBe(true)
    })

    it('skills_execute_autonomous simulates skill execution and AGENTS.md rule audits', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'skills_execute_autonomous')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        skillName: 'code-review',
        inputs: { topic: 'Code Review Invariants' },
        codeSnippet: 'export async function getBad() { return fetch("/api/raw"); }',
        codeAuditFilepath: 'apps/web/app/test/page.tsx',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        success: boolean
        clarityIndex: number
        ruleViolations: Array<{ ruleId: number }>
      }
      expect(data.success).toBe(true)
      expect(data.clarityIndex).toBeGreaterThanOrEqual(50)
      expect(data.ruleViolations.length).toBeGreaterThanOrEqual(1)
      expect(data.ruleViolations[0]!.ruleId).toBe(1) // Rule 1: No raw fetch in UI code
    })

    it('successive_relearning_calculate computes Ebbinghaus savings and calibrated FSRS stability', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'successive_relearning_calculate')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        initialLearningSeconds: 600,
        relearningSeconds: 240,
        daysElapsed: 7,
        initialTrialsCount: 3,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        savingsPercentage: number
        predictedRetentionPercentage: number
        calibratedFSRS: { stabilityDays: number }
        recommendation: string
      }
      expect(data.savingsPercentage).toBe(60)
      expect(data.predictedRetentionPercentage).toBeGreaterThan(0)
      expect(data.calibratedFSRS.stabilityDays).toBeGreaterThan(0)
      expect(data.recommendation).toContain('Robust Ebbinghaus memory savings')
    })

    it('srl_evaluate_cycle evaluates Zimmerman cyclical maturity and diagnoses challenge scenario', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'srl_evaluate_cycle')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        forethoughtScore: 8,
        performanceScore: 7,
        reflectionScore: 9,
        challengeId: 'distributed_systems_consensus',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        maturityIndex: number
        selectedChallenge: { id: string; forethoughtHeuristic: string } | null
      }
      expect(data.maturityIndex).toBeGreaterThanOrEqual(0.7)
      expect(data.selectedChallenge).not.toBeNull()
      expect(data.selectedChallenge?.id).toBe('distributed_systems_consensus')
      expect(data.selectedChallenge?.forethoughtHeuristic).toBeDefined()
    })

    it('epistemic_network_analyze computes discourse density, projection, and curriculum bridge', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'epistemic_network_analyze')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        discourseTexts: [
          'The weight updates oscillate because learning rate is too large.',
          'Adding momentum damps the oscillation along high-curvature directions.',
          'Empirically, RMSProp scales coordinates inversely proportional to past gradient magnitudes.',
        ],
        windowSize: 4,
        baseMastery: 0.8,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        networkDensity: number
        dimension1Centroid: number
        dimension2Centroid: number
        curriculumTransferMultiplier: number
      }
      expect(data.networkDensity).toBeGreaterThanOrEqual(0)
      expect(typeof data.dimension1Centroid).toBe('number')
      expect(typeof data.dimension2Centroid).toBe('number')
      expect(data.curriculumTransferMultiplier).toBeGreaterThan(0)
    })

    it('causal_counterfactual_simulate runs Pearl 3-step algorithm and evaluates backdoor admissibility', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'causal_counterfactual_simulate')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        evidence: { StudyHours: 6, PriorKnowledge: 45, ExamScore: 48 },
        interventions: { StudyHours: 18 },
        targetVariableId: 'ExamScore',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        factualValue: number
        counterfactualValue: number
        causalLift: number
        isBackdoorAdmissible: boolean
        dSeparationPathsEvaluated: number
      }
      expect(data.factualValue).toBe(48)
      expect(data.counterfactualValue).toBeGreaterThan(48)
      expect(data.causalLift).toBeGreaterThan(0)
      expect(data.isBackdoorAdmissible).toBe(true)
      expect(data.dSeparationPathsEvaluated).toBeGreaterThan(0)
    })

    it('threshold_liminal_evaluate computes liminal phase and unlocks downstream concepts', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'threshold_liminal_evaluate')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        conceptId: 'tc_pointers_memory',
        probeResponses: {
          probe_pointers_swap: 'ptr_opt_genuine',
        },
        baseMastery: 0.75,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        conceptTitle: string
        gatewayMultiplier: number
        unlockedDownstreamConcepts: string[]
      }
      expect(data.conceptTitle).toContain('Pointer')
      expect(data.gatewayMultiplier).toBeGreaterThanOrEqual(1.0)
      expect(data.unlockedDownstreamConcepts.length).toBeGreaterThan(0)
    })

    it('zpd_list_scenarios lists canonical multidisciplinary scenarios', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'zpd_list_scenarios')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        scenarios: Array<{ id: string; domain: string; title: string }>
      }
      expect(data.count).toBeGreaterThanOrEqual(4)
      expect(data.scenarios.some((s) => s.id === 'algo_dynamic_programming')).toBe(true)
    })

    it('zpd_evaluate_trajectory computes ZPD bandwidth, Budoff LPS and Feuerstein CMI', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'zpd_evaluate_trajectory')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        scenarioId: 'algo_dynamic_programming',
        preTestScore: 25,
        postTestScore: 80,
        promptsConsumed: 2,
        transferScores: [85, 75, 70],
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        actualDevelopmentalLevel: number
        potentialDevelopmentalLevel: number
        zpdBandwidth: number
        learningPotentialScore: number
        cognitiveModifiabilityIndex: number
        typology: string
      }
      expect(data.actualDevelopmentalLevel).toBe(25)
      expect(data.potentialDevelopmentalLevel).toBe(80)
      expect(data.zpdBandwidth).toBe(55)
      expect(data.learningPotentialScore).toBeGreaterThan(0.5)
      expect(data.typology).toBe('high_potential_gainer')
    })

    it('pf_list_scenarios lists canonical productive failure scenarios', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'pf_list_scenarios')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        scenarios: Array<{ id: string; domain: string; title: string }>
      }
      expect(data.count).toBeGreaterThanOrEqual(5)
      expect(data.scenarios.some((s) => s.id === 'pf-variance-dispersion')).toBe(true)
    })

    it('pf_calculate_metrics computes PFI, GDI, and mastery band', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'pf_calculate_metrics')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        scenarioId: 'pf-variance-dispersion',
        representationCount: 3,
        affectiveImpasseRating: 5,
        impasseDepthScore: 90,
        featureAlignment: 90,
        parameterMapping: 90,
        invariantGrasp: 90,
        transferSuccessCount: 3,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        productiveFailureIndex: number
        generationDiversityIndex: number
        impasseSensitivityScore: number
        consolidationIntegrationGain: number
        adaptiveTransferScore: number
        masteryBand: string
      }
      expect(data.productiveFailureIndex).toBeGreaterThanOrEqual(80)
      expect(data.masteryBand).toBe('Master Adaptive Transferer')
    })

    it('pi_list_conceptests lists canonical ConcepTest suites', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'pi_list_conceptests')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        suites: Array<{ id: string; domain: string; title: string }>
      }
      expect(data.count).toBeGreaterThanOrEqual(5)
      expect(data.suites.some((s) => s.id === 'ct-thermal-expansion-plate')).toBe(true)
    })

    it('pi_evaluate_trajectory computes Hake gain, Mazur PI, and Smith transfer', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'pi_evaluate_trajectory')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        suiteId: 'ct-thermal-expansion-plate',
        q1InitialConfidence: 3,
        q1RevoteConfidence: 5,
        peerDiscussionOccurred: true,
        vote1AccuracyPct: 38,
        vote2AccuracyPct: 82,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        hakeNormalizedGain: number
        mazurPolarizationIndex: number
        peerDiscussionConvergence: number
        smithLearningVerification: boolean
        engagementBand: string
      }
      expect(data.hakeNormalizedGain).toBeGreaterThan(0.5)
      expect(data.smithLearningVerification).toBe(true)
    })

    it('inquiry_list_labs lists canonical scientific discovery laboratories', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'inquiry_list_labs')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        labs: Array<{ id: string; domain: string; title: string }>
      }
      expect(data.count).toBeGreaterThanOrEqual(5)
      expect(data.labs.some((l) => l.id === 'lab-pendulum-period')).toBe(true)
    })

    it('inquiry_evaluate_sdds computes VOTAT rigor, confirmation bias, and discovery index', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'inquiry_evaluate_sdds')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        labId: 'lab-pendulum-period',
        votatCompliantFraction: 1.0,
        anomalousReaction: 'theory_revision',
        falsificationTrialCount: 1,
        finalHypothesisCapturesInvariant: true,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        votatRigorIndex: number
        confirmationBiasIndex: number
        anomalousDataResolutionIndex: number
        scientificDiscoveryIndex: number
        inquiryMasteryBand: string
      }
      expect(data.votatRigorIndex).toBe(1.0)
      expect(data.anomalousDataResolutionIndex).toBe(100)
      expect(data.scientificDiscoveryIndex).toBeGreaterThanOrEqual(80)
      expect(data.inquiryMasteryBand).toBe('Master Empirical Scientist')
    })
  })

  // ── 2. Terminal CLI Commands Tests ─────────────────────────────────────────
  describe('CLI Commands Parity', () => {
    it('skillsCommand executes catalog, audit, and run without runtime exception', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        skillsCommand(['catalog'])
        expect(consoleSpy).toHaveBeenCalled()

        skillsCommand([
          'audit',
          '--code',
          'export function ok() { return 1; }',
          '--file',
          'packages/core/src/ok.ts',
        ])
        expect(consoleSpy).toHaveBeenCalled()

        skillsCommand(['run', '--skill', 'code-review'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('relearningCommand calculates Ebbinghaus savings and outputs advice', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        relearningCommand(['--initial', '600', '--relearn', '240', '--days', '7'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('srlCommand evaluates cyclical matrix and challenge diagnosis', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        srlCommand([
          '--forethought',
          '8',
          '--performance',
          '7',
          '--reflection',
          '9',
          '--challenge',
          'distributed_systems_consensus',
        ])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('epistemicCommand runs discourse network analysis and projection', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        epistemicCommand(['--mastery', '0.8'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('causalCommand evaluates structural counterfactual and backdoor criterion', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        causalCommand(['--study', '16', '--target', 'ExamScore'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('thresholdCommand evaluates liminal transition and TSI significance', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        thresholdCommand(['--concept', 'tc_pointers_memory', '--mastery', '0.75'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('zpdCommand executes scenarios, prompt, and eval subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        zpdCommand(['scenarios'])
        expect(consoleSpy).toHaveBeenCalled()
        zpdCommand(['prompt', '--tier', '2'])
        expect(consoleSpy).toHaveBeenCalled()
        zpdCommand(['eval', '--pre', '30', '--post', '85'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('pfCommand executes scenarios, eval, metrics, and deck subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        pfCommand(['scenarios'])
        expect(consoleSpy).toHaveBeenCalled()
        pfCommand(['eval', '--title', 'Custom Model', '--mechanism', 'Squared dispersion'])
        expect(consoleSpy).toHaveBeenCalled()
        pfCommand(['metrics', '--reps', '3', '--affective', '5'])
        expect(consoleSpy).toHaveBeenCalled()
        pfCommand(['deck', '--pfi', '85'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('piCommand executes suites, dialogue, eval, and deck subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        piCommand(['suites'])
        expect(consoleSpy).toHaveBeenCalled()
        piCommand(['dialogue', '--suite', 'ct-thermal-expansion-plate'])
        expect(consoleSpy).toHaveBeenCalled()
        piCommand(['eval', '--suite', 'ct-thermal-expansion-plate', '--v1', '35', '--v2', '85'])
        expect(consoleSpy).toHaveBeenCalled()
        piCommand(['deck', '--suite', 'ct-thermal-expansion-plate', '--gain', '0.75'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('inquiryCommand executes labs, trial, eval, and deck subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        inquiryCommand(['labs'])
        expect(consoleSpy).toHaveBeenCalled()
        inquiryCommand(['trial', '--lab', 'lab-pendulum-period', '--length', '1.5'])
        expect(consoleSpy).toHaveBeenCalled()
        inquiryCommand(['eval', '--lab', 'lab-pendulum-period', '--vri', '1.0'])
        expect(consoleSpy).toHaveBeenCalled()
        inquiryCommand(['deck', '--lab', 'lab-pendulum-period', '--sdi', '85'])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })
  })

  // ── 3. Headless Server REST Routes Tests ──────────────────────────────────
  describe('Server REST Routes Parity', () => {
    it('registers all cognitive expansion routes in server route table', () => {
      const registeredPaths = routes.map((r) => `${r.method} ${r.path}`)
      expect(registeredPaths).toContain('GET /cognitive/skills/catalog')
      expect(registeredPaths).toContain('POST /cognitive/skills/audit')
      expect(registeredPaths).toContain('POST /cognitive/skills/run')
      expect(registeredPaths).toContain('POST /cognitive/relearning/savings')
      expect(registeredPaths).toContain('POST /cognitive/srl/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/epistemic/analyze')
      expect(registeredPaths).toContain('POST /cognitive/causal/counterfactual')
      expect(registeredPaths).toContain('POST /cognitive/threshold/liminal')
      expect(registeredPaths).toContain('GET /cognitive/zpd/scenarios')
      expect(registeredPaths).toContain('POST /cognitive/zpd/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/zpd/prompt')
      expect(registeredPaths).toContain('POST /cognitive/zpd/deck')
      expect(registeredPaths).toContain('GET /cognitive/pf/scenarios')
      expect(registeredPaths).toContain('POST /cognitive/pf/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/pf/metrics')
      expect(registeredPaths).toContain('POST /cognitive/pf/deck')
      expect(registeredPaths).toContain('GET /cognitive/pi/conceptests')
      expect(registeredPaths).toContain('POST /cognitive/pi/dialogue')
      expect(registeredPaths).toContain('POST /cognitive/pi/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/pi/deck')
      expect(registeredPaths).toContain('GET /cognitive/inquiry/labs')
      expect(registeredPaths).toContain('POST /cognitive/inquiry/trial')
      expect(registeredPaths).toContain('POST /cognitive/inquiry/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/inquiry/deck')
    })

    it('GET /cognitive/skills/catalog returns skills catalog JSON envelope', async () => {
      const mock = createMockHttp('GET', '/cognitive/skills/catalog?category=engineering')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.count).toBeGreaterThan(0)
      const skills = (result.data?.skills ?? []) as SkillItem[]
      expect(skills.every((s) => s.category === 'engineering')).toBe(true)
    })

    it('POST /cognitive/skills/audit audits code violations via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/skills/audit', {
        code: 'export async function getBad() { return fetch("/api/test"); }',
        file: 'apps/web/app/example/page.tsx',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.violationsCount).toBeGreaterThan(0)
    })

    it('POST /cognitive/skills/run simulates skill drill via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/skills/run', {
        skillName: 'code-review',
        topic: 'Architectural Invariant Enforcement',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.skill).toBe('code-review')
      expect(result.data.clarityIndex).toBeGreaterThan(0)
    })

    it('POST /cognitive/relearning/savings calculates savings via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/relearning/savings', {
        initialLearningSeconds: 700,
        relearningSeconds: 280,
        daysElapsed: 14,
        initialTrialsCount: 4,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.savingsPercentage).toBe(60)
      expect(result.data.calibratedFSRS.stabilityDays).toBeGreaterThan(0)
    })

    it('POST /cognitive/srl/evaluate evaluates Zimmerman cycle via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/srl/evaluate', {
        forethoughtScore: 9,
        performanceScore: 8,
        reflectionScore: 9,
        challengeId: 'distributed_systems_consensus',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.maturityIndex).toBeGreaterThan(0.8)
      expect(result.data.challenge.id).toBe('distributed_systems_consensus')
    })

    it('POST /cognitive/epistemic/analyze performs discourse ENA via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/epistemic/analyze', {
        discourseTexts: [
          'High learning rates induce loss divergence across saddle points.',
          'Adaptive moment estimation stabilizes stochastic trajectory.',
        ],
        baseMastery: 0.85,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(typeof result.data.dimension1Coord).toBe('number')
      expect(result.data.curriculumTransferMultiplier).toBeGreaterThan(0)
    })

    it('POST /cognitive/causal/counterfactual computes Pearl counterfactual via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/causal/counterfactual', {
        evidence: { StudyHours: 6, PriorKnowledge: 45, ExamScore: 50 },
        interventions: { StudyHours: 20 },
        targetVariableId: 'ExamScore',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.factualValue).toBe(50)
      expect(result.data.counterfactualValue).toBeGreaterThan(50)
      expect(result.data.isBackdoorAdmissible).toBe(true)
    })

    it('POST /cognitive/threshold/liminal evaluates threshold concept liminality via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/threshold/liminal', {
        conceptId: 'tc_pointers_memory',
        probeResponses: {
          probe_pointers_swap: 'ptr_opt_genuine',
        },
        baseMastery: 0.7,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.concept.title).toContain('Pointer')
      expect(result.data.diagnostic.canCrossPortal).toBe(true)
      expect(result.data.bridge.gatewayMultiplier).toBeGreaterThan(1.0)
    })

    it('GET /cognitive/zpd/scenarios returns canonical scenarios via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/zpd/scenarios')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.scenarios.length).toBeGreaterThanOrEqual(4)
    })

    it('POST /cognitive/zpd/evaluate computes ZPD metrics via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/zpd/evaluate', {
        scenarioId: 'algo_dynamic_programming',
        preTestScore: 30,
        postTestScore: 85,
        promptsConsumed: 2,
        transferScores: [85, 80, 75],
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.metrics.actualDevelopmentalLevel).toBe(30)
      expect(result.data.metrics.potentialDevelopmentalLevel).toBe(85)
      expect(result.data.metrics.zpdBandwidth).toBe(55)
      expect(result.data.metrics.learningPotentialScore).toBeGreaterThan(0.5)
    })

    it('GET /cognitive/pf/scenarios returns canonical productive failure scenarios via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/pf/scenarios')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.scenarios.length).toBeGreaterThanOrEqual(5)
    })

    it('POST /cognitive/pf/evaluate evaluates student representation via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/pf/evaluate', {
        scenarioId: 'pf-variance-dispersion',
        title: 'Squared Deviation Model',
        description: 'Quadratic spread around mean',
        mechanism: 'Mean of squared distances',
        structuralFeatures: ['outlier sensitivity'],
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.representation.title).toBe('Squared Deviation Model')
      expect(result.data.representation.intuitivePlausibilityScore).toBeGreaterThan(60)
    })

    it('POST /cognitive/pf/metrics computes PFI and mastery band via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/pf/metrics', {
        scenarioId: 'pf-variance-dispersion',
        representationCount: 3,
        affectiveImpasseRating: 5,
        impasseDepthScore: 90,
        featureAlignment: 90,
        parameterMapping: 90,
        invariantGrasp: 90,
        transferSuccessCount: 3,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.metrics.productiveFailureIndex).toBeGreaterThanOrEqual(80)
      expect(result.data.metrics.masteryBand).toBe('Master Adaptive Transferer')
    })

    it('GET /cognitive/pi/conceptests returns canonical ConcepTest suites via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/pi/conceptests')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.suites.length).toBeGreaterThanOrEqual(5)
    })

    it('POST /cognitive/pi/evaluate computes Hake gain and Mazur PI via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/pi/evaluate', {
        suiteId: 'ct-thermal-expansion-plate',
        q1InitialConfidence: 3,
        q1RevoteConfidence: 5,
        peerDiscussionOccurred: true,
        vote1AccuracyPct: 38,
        vote2AccuracyPct: 82,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.metrics.hakeNormalizedGain).toBeGreaterThan(0.5)
      expect(result.data.metrics.smithLearningVerification).toBe(true)
    })

    it('POST /cognitive/pi/deck generates calibrated FSRS-6 review cards via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/pi/deck', {
        suiteId: 'ct-thermal-expansion-plate',
        hakeGain: 0.75,
        isomorphicCorrect: true,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBeGreaterThanOrEqual(3)
    })

    it('GET /cognitive/inquiry/labs returns canonical inquiry laboratories via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/inquiry/labs')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.labs.length).toBeGreaterThanOrEqual(5)
    })

    it('POST /cognitive/inquiry/trial executes laboratory simulation via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/inquiry/trial', {
        labId: 'lab-pendulum-period',
        variableSettings: { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.trial.observedOutputs.period).toBeGreaterThan(0)
    })

    it('POST /cognitive/inquiry/evaluate computes VOTAT and discovery index via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/inquiry/evaluate', {
        labId: 'lab-pendulum-period',
        votatCompliantFraction: 1.0,
        anomalousReaction: 'theory_revision',
        falsificationTrialCount: 1,
        finalHypothesisCapturesInvariant: true,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.metrics.scientificDiscoveryIndex).toBeGreaterThanOrEqual(80)
      expect(result.data.metrics.votatRigorIndex).toBe(1.0)
    })

    it('POST /cognitive/inquiry/deck generates calibrated FSRS-6 review cards via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/inquiry/deck', {
        labId: 'lab-pendulum-period',
        sdiScore: 85,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBeGreaterThanOrEqual(3)
    })
  })
})
