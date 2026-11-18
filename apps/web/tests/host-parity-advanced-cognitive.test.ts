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
  reciprocalTeachingCommand,
  cerCommand,
  anchoredCommand,
  contrastingCommand,
  collaborativeCommand,
  systemDynamicsCommand,
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

    it('rt_list_passages lists canonical text passages for reciprocal teaching', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'rt_list_passages')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        passages: Array<{ id: string; discipline: string; title: string }>
      }
      expect(data.count).toBeGreaterThanOrEqual(5)
      expect(data.passages.some((p) => p.id === 'passage-endosymbiosis')).toBe(true)
    })

    it('rt_evaluate_dialogue computes ICAP, RSBS, and RDMS metrics', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'rt_evaluate_dialogue')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        passageId: 'passage-endosymbiosis',
        userResponses: [
          {
            role: 'questioner',
            text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial?',
          },
          {
            role: 'clarifier',
            text: 'Cardiolipin proves bacterial descent because eukaryotes lack it in outer membranes.',
            resolvedMisconceptionId: 'misc-endo-1',
          },
        ],
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        rdms: number
        masteryBand: string
        icap: { ics: number }
        strategy: { rsbs: number }
      }
      expect(data.rdms).toBeGreaterThan(0)
      expect(data.icap.ics).toBeGreaterThan(0)
      expect(data.strategy.rsbs).toBeGreaterThan(0)
    })

    it('cer_list_debates lists canonical scientific debate cases', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'cer_list_debates')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        debates: Array<{ id: string; domain: string; title: string }>
      }
      expect(data.count).toBeGreaterThanOrEqual(5)
      expect(data.debates.some((d) => d.id === 'debate-amoc-tipping')).toBe(true)
    })

    it('cer_counter_argue generates adversarial counter-argument via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'cer_counter_argue')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        debateId: 'debate-amoc-tipping',
        selectedClaimId: 'claim-amoc-tipping-near',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        counterClaim: string
        rebuttalChallenge: string
      }
      expect(data.counterClaim).toBeDefined()
      expect(data.rebuttalChallenge).toBeDefined()
    })

    it('cer_evaluate_argument computes CCS, EQI, RDI, TAP, and ERS via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'cer_evaluate_argument')!
      expect(tool).toBeDefined()

      const result = (await tool.handler({
        debateId: 'debate-amoc-tipping',
        selectedClaimId: 'claim-amoc-tipping-near',
        claimStatement:
          'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
        selectedEvidenceIds: [
          'ev-amoc-sst-autocorr',
          'ev-amoc-paleo-glacier',
          'ev-amoc-cmip6-bias',
        ],
        userEvidenceSynthesis:
          'Subpolar SST fingerprints exhibit critical slowing down with increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
        selectedPrincipleIds: ['princ-salt-advection', 'princ-critical-slowing'],
        userReasoningStatement:
          'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
        targetedCounterArgumentId: 'counter-amoc-rapid',
        userRebuttalStatement:
          'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        ers: number
        tapLevel: number
        ccs: number
        eqi: number
        rdi: number
      }
      expect(data.ers).toBeGreaterThanOrEqual(70)
      expect(data.tapLevel).toBe(5)
      expect(data.ccs).toBe(100)
    })

    it('anchored_list_macrocontexts lists canonical anchored macrocontext cases', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'anchored_list_macrocontexts')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        macrocontexts: Array<{ id: string; title: string }>
      }
      expect(data.count).toBe(5)
      expect(data.macrocontexts[0]!.title).toContain('Jasper Woodbury')
    })

    it('anchored_simulate_sensitivity calculates parameter variations via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'anchored_simulate_sensitivity')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        caseId: 'case-jasper-flight',
        parameterId: 'data-headwind',
        variedValue: 35,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        caseId: string
        simulatedOutputs: Record<string, number>
        constraintImpacts: Array<{ constraintId: string }>
      }
      expect(data.caseId).toBe('case-jasper-flight')
      expect(data.constraintImpacts).toBeDefined()
    })

    it('anchored_evaluate_solution computes SGAI, EIER, CPR, and IKRS via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'anchored_evaluate_solution')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        caseId: 'case-jasper-flight',
        extractedDataValues: {
          'data-dist-oneway': 120,
          'data-cruising-speed': 100,
          'data-headwind': 20,
          'data-fuel-burn': 8.0,
          'data-total-fuel': 36,
          'data-reserve-required': 5,
          'data-ground-time': 0.5,
          'data-departure-time': 16.0,
          'data-sunset-time': 18.75,
        },
        subGoalSequence: [
          'sg-outbound-groundspeed',
          'sg-outbound-time',
          'sg-inbound-groundspeed',
          'sg-inbound-time',
          'sg-total-flight-time',
          'sg-total-mission-time',
          'sg-fuel-consumed',
          'sg-fuel-remaining',
        ],
        calculatedSubGoalOutputs: {
          'sg-outbound-groundspeed': 80,
          'sg-outbound-time': 1.5,
          'sg-inbound-groundspeed': 120,
          'sg-inbound-time': 1.0,
          'sg-total-flight-time': 2.5,
          'sg-total-mission-time': 19.0,
          'sg-fuel-consumed': 20.0,
          'sg-fuel-remaining': 16.0,
        },
        finalDecisionChoice: 'optimal_decision',
        decisionJustification:
          'We verify both operational boundary constraints: first, fuel remaining at final touchdown exceeds the mandatory 5.0 gallons minimum reserve; second, our return flight completes prior to the 18.75 sunset landing deadline.',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        ikrs: number
        sgai: number
        eier: number
        cpr: number
        decisionApproved: boolean
      }
      expect(data.ikrs).toBeGreaterThanOrEqual(80)
      expect(data.sgai).toBe(100)
      expect(data.eier).toBeGreaterThanOrEqual(80)
      expect(data.decisionApproved).toBe(true)
    })

    it('contrasting_list_sets lists canonical contrasting case sets via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'contrasting_list_sets')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        sets: Array<{ id: string; title: string }>
      }
      expect(data.count).toBe(5)
      expect(data.sets[0]!.title).toContain('Buoyancy')
    })

    it('contrasting_evaluate_invention computes FDRS, IMI, PFRI, and CDTS via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'contrasting_evaluate_invention')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        setId: 'set-density-buoyancy',
        inventedMetricName: 'Density Buoyancy Ratio',
        formulaDescription:
          'Computes the invariant ratio of object mass divided by volume to predict flotation displacement.',
        selectedDimensionIds: ['dim-mass-vol-ratio', 'dim-displacement-equilibrium'],
        variantRankings: [
          'cyl-balsa-disc',
          'cyl-hollow-steel',
          'cyl-oak-block',
          'cyl-neutral-gel',
          'cyl-aluminum-rod',
          'cyl-lead-bullet',
        ],
        impasseEncountered: true,
        reflectionNotes:
          'Encountered impasse when trying to use single dimension; discovered mass-to-volume ratio produces invariant ordering.',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        cdts: number
        fdrs: number
        imi: number
        pfri: number
        rankingAccuracy: number
        impasseProductive: boolean
      }
      expect(data.cdts).toBeGreaterThanOrEqual(70)
      expect(data.fdrs).toBe(100)
      expect(data.rankingAccuracy).toBe(100)
      expect(data.impasseProductive).toBe(true)
    })

    it('contrasting_generate_deck produces calibrated FSRS-6 deck via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'contrasting_generate_deck')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        setId: 'set-density-buoyancy',
        cdtsBaseline: 88,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        setId: string
        setTitle: string
        cdtsBaseline: number
        cardsCount: number
        cards: Array<{
          cardType: string
          fsrsParameters: { stability: number; difficulty: number }
        }>
      }
      expect(data.setId).toBe('set-density-buoyancy')
      expect(data.cardsCount).toBe(4)
      expect(data.cards[0]!.fsrsParameters.stability).toBeGreaterThanOrEqual(6.0)
    })

    it('collaborative_list_scenarios lists canonical CSCL scenarios via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'collaborative_list_scenarios')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        scenarios: Array<{ id: string; title: string }>
      }
      expect(data.count).toBe(5)
      expect(data.scenarios[0]!.title).toContain('Synaptic Tagging')
    })

    it('collaborative_generate_partner_turn produces automated Socratic response via MCP', async () => {
      const tool = advancedLearningTools.find(
        (t) => t.name === 'collaborative_generate_partner_turn',
      )!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        scenarioId: 'collab-neuro-synaptic-plasticity',
        learnerTurnText: 'Because you argued late-LTP is sufficient, consider saturation.',
        turnIndex: 0,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        scenarioId: string
        peerTurn: { speaker: string; text: string }
      }
      expect(data.scenarioId).toBe('collab-neuro-synaptic-plasticity')
      expect(data.peerTurn.speaker).toBe('peer_partner')
      expect(data.peerTurn.text).toBeDefined()
    })

    it('collaborative_evaluate_discourse calculates TDI, EED, SCR, and CEI via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'collaborative_evaluate_discourse')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        scenarioId: 'collab-neuro-synaptic-plasticity',
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
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        cei: number
        tdi: number
        eed: number
        scr: number
        maturityBand: string
      }
      expect(data.cei).toBeGreaterThanOrEqual(80)
      expect(data.tdi).toBeGreaterThanOrEqual(80)
      expect(data.eed).toBeGreaterThanOrEqual(70)
      expect(data.maturityBand).toBe('dialectical_synthesizer')
    })

    it('collaborative_generate_deck produces calibrated FSRS-6 deck via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'collaborative_generate_deck')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        scenarioId: 'collab-neuro-synaptic-plasticity',
        ceiBaseline: 90,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        scenarioId: string
        scenarioTitle: string
        ceiBaseline: number
        cardsCount: number
        cards: Array<{
          cardType: string
          fsrsParameters: { stability: number; difficulty: number }
        }>
      }
      expect(data.scenarioId).toBe('collab-neuro-synaptic-plasticity')
      expect(data.cardsCount).toBe(4)
      expect(data.cards[0]!.fsrsParameters.stability).toBeGreaterThanOrEqual(7.0)
    })

    it('system_dynamics_list_scenarios lists canonical scenarios via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'system_dynamics_list_scenarios')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({})) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        count: number
        scenarios: Array<{ id: string; title: string; archetype: string }>
      }
      expect(data.count).toBe(5)
      expect(data.scenarios[0]!.id).toBe('climate-permafrost-methane')
    })

    it('system_dynamics_simulate_trajectory executes Euler integration via MCP', async () => {
      const tool = advancedLearningTools.find(
        (t) => t.name === 'system_dynamics_simulate_trajectory',
      )!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        scenarioId: 'climate-permafrost-methane',
        stepsCount: 30,
        dt: 1.0,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        stepsCount: number
        hasOvershoot: boolean
        summary: string
      }
      expect(data.stepsCount).toBe(30)
      expect(data.summary).toBeDefined()
    })

    it('system_dynamics_evaluate_model calculates SFDR, FLIA, DAM, ARS, and SDI via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'system_dynamics_evaluate_model')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        scenarioId: 'climate-permafrost-methane',
        classifiedVariables: [
          { id: 'atmospheric_carbon', nature: 'stock' },
          { id: 'ocean_carbon_sink', nature: 'stock' },
          { id: 'permafrost_methane_stock', nature: 'stock' },
          { id: 'global_temperature_anomaly', nature: 'stock' },
          { id: 'fossil_emissions', nature: 'flow' },
          { id: 'ocean_sink_absorption', nature: 'flow' },
          { id: 'permafrost_thaw_release', nature: 'flow' },
          { id: 'radiative_heat_accumulation', nature: 'flow' },
        ],
        identifiedLoops: [
          {
            id: 'R1_albedo_cryosphere',
            polarity: 'reinforcing',
            elementIds: ['global_temperature_anomaly', 'radiative_heat_accumulation'],
            delayIdentified: true,
          },
          {
            id: 'R2_permafrost_runaway',
            polarity: 'reinforcing',
            elementIds: [
              'global_temperature_anomaly',
              'permafrost_thaw_release',
              'atmospheric_carbon',
              'radiative_heat_accumulation',
            ],
            delayIdentified: true,
          },
          {
            id: 'B1_ocean_buffering',
            polarity: 'balancing',
            elementIds: ['atmospheric_carbon', 'ocean_sink_absorption', 'ocean_carbon_sink'],
            delayIdentified: true,
          },
        ],
        identifiedArchetype: 'limits_to_growth',
        proposedHighLeverageIntervention:
          'Statutory carbon budget caps and methane flaring mandates (Meadows Rank 4 Rules of the System).',
        predictedBehavior: 'overshoot_and_collapse',
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        sdi: number
        sfdr: number
        flia: number
        dam: number
        ars: number
        maturityTier: string
      }
      expect(data.sdi).toBeGreaterThanOrEqual(85)
      expect(data.sfdr).toBe(100)
      expect(data.flia).toBe(100)
      expect(data.dam).toBe(100)
      expect(data.maturityTier).toBe('leverage_strategist')
    })

    it('system_dynamics_generate_deck produces calibrated FSRS-6 deck via MCP', async () => {
      const tool = advancedLearningTools.find((t) => t.name === 'system_dynamics_generate_deck')!
      expect(tool).toBeDefined()
      const result = (await tool.handler({
        scenarioId: 'diabetes-beta-cell-homeostasis',
        sdiBaseline: 85,
      })) as unknown as McpResultEnvelope
      const data = JSON.parse(result.content[0]!.text) as {
        scenarioId: string
        sdi: number
        cardsCount: number
        cards: Array<{ cardType: string }>
      }
      expect(data.scenarioId).toBe('diabetes-beta-cell-homeostasis')
      expect(data.cardsCount).toBe(4)
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

    it('reciprocalTeachingCommand executes passages, peer, deck, and eval subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        reciprocalTeachingCommand(['passages'])
        expect(consoleSpy).toHaveBeenCalled()
        reciprocalTeachingCommand(['peer', '--passage', 'passage-endosymbiosis'])
        expect(consoleSpy).toHaveBeenCalled()
        reciprocalTeachingCommand(['deck', '--passage', 'passage-endosymbiosis'])
        expect(consoleSpy).toHaveBeenCalled()
        reciprocalTeachingCommand([])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('cerCommand executes debates, counter, deck, and eval subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        cerCommand(['debates'])
        expect(consoleSpy).toHaveBeenCalled()
        cerCommand(['counter', '--debate', 'debate-amoc-tipping'])
        expect(consoleSpy).toHaveBeenCalled()
        cerCommand(['deck', '--debate', 'debate-amoc-tipping'])
        expect(consoleSpy).toHaveBeenCalled()
        cerCommand([])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('anchoredCommand executes cases, sensitivity, deck, and eval subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        anchoredCommand(['cases'])
        expect(consoleSpy).toHaveBeenCalled()
        anchoredCommand(['sensitivity', '--case', 'case-jasper-flight'])
        expect(consoleSpy).toHaveBeenCalled()
        anchoredCommand(['deck', '--case', 'case-jasper-flight'])
        expect(consoleSpy).toHaveBeenCalled()
        anchoredCommand([])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('contrastingCommand executes sets, deck, and eval subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        contrastingCommand(['sets'])
        expect(consoleSpy).toHaveBeenCalled()
        contrastingCommand(['deck', '--id', 'set-density-buoyancy'])
        expect(consoleSpy).toHaveBeenCalled()
        contrastingCommand([])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('collaborativeCommand executes scenarios, partner, deck, and eval subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        collaborativeCommand(['scenarios'])
        expect(consoleSpy).toHaveBeenCalled()
        collaborativeCommand(['partner', '--id', 'collab-neuro-synaptic-plasticity'])
        expect(consoleSpy).toHaveBeenCalled()
        collaborativeCommand(['deck', '--id', 'collab-neuro-synaptic-plasticity'])
        expect(consoleSpy).toHaveBeenCalled()
        collaborativeCommand([])
        expect(consoleSpy).toHaveBeenCalled()
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('systemDynamicsCommand executes scenarios, simulate, deck, and eval subcommands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        systemDynamicsCommand(['scenarios'])
        expect(consoleSpy).toHaveBeenCalled()
        systemDynamicsCommand(['simulate', '--id', 'climate-permafrost-methane'])
        expect(consoleSpy).toHaveBeenCalled()
        systemDynamicsCommand(['deck', '--id', 'climate-permafrost-methane'])
        expect(consoleSpy).toHaveBeenCalled()
        systemDynamicsCommand([])
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
      expect(registeredPaths).toContain('GET /cognitive/rt/passages')
      expect(registeredPaths).toContain('POST /cognitive/rt/peer')
      expect(registeredPaths).toContain('POST /cognitive/rt/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/rt/deck')
      expect(registeredPaths).toContain('GET /cognitive/cer/debates')
      expect(registeredPaths).toContain('POST /cognitive/cer/counter')
      expect(registeredPaths).toContain('POST /cognitive/cer/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/cer/deck')
      expect(registeredPaths).toContain('GET /cognitive/anchored/cases')
      expect(registeredPaths).toContain('POST /cognitive/anchored/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/anchored/sensitivity')
      expect(registeredPaths).toContain('POST /cognitive/anchored/deck')
      expect(registeredPaths).toContain('GET /cognitive/contrasting/sets')
      expect(registeredPaths).toContain('POST /cognitive/contrasting/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/contrasting/deck')
      expect(registeredPaths).toContain('GET /cognitive/collaborative/scenarios')
      expect(registeredPaths).toContain('POST /cognitive/collaborative/partner')
      expect(registeredPaths).toContain('POST /cognitive/collaborative/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/collaborative/deck')
      expect(registeredPaths).toContain('GET /cognitive/system-dynamics/scenarios')
      expect(registeredPaths).toContain('POST /cognitive/system-dynamics/simulate')
      expect(registeredPaths).toContain('POST /cognitive/system-dynamics/evaluate')
      expect(registeredPaths).toContain('POST /cognitive/system-dynamics/deck')
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

    it('GET /cognitive/rt/passages returns canonical text passages via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/rt/passages')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.passages.length).toBeGreaterThanOrEqual(5)
    })

    it('POST /cognitive/rt/peer generates Socratic peer response via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/rt/peer', {
        passageId: 'passage-endosymbiosis',
        preferredRole: 'clarifier',
        userText: 'How does cardiolipin prove endosymbiosis?',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.peerRole).toBe('clarifier')
    })

    it('POST /cognitive/rt/evaluate computes dialogue maturity via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/rt/evaluate', {
        passageId: 'passage-endosymbiosis',
        turns: [
          {
            role: 'questioner',
            text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial?',
          },
          {
            role: 'clarifier',
            text: 'Cardiolipin proves bacterial descent because eukaryotes lack it in outer membranes.',
            resolvedMisconceptionId: 'misc-endo-1',
          },
        ],
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.rdms).toBeGreaterThan(0)
      expect(result.data.icap.ics).toBeGreaterThan(0)
    })

    it('POST /cognitive/rt/deck generates calibrated FSRS-6 review cards via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/rt/deck', {
        passageId: 'passage-endosymbiosis',
        sampleText: 'Cardiolipin proves endosymbiosis because eukaryotes lack it.',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBeGreaterThanOrEqual(4)
    })

    it('GET /cognitive/cer/debates returns scientific debate cases via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/cer/debates')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.debates.length).toBeGreaterThanOrEqual(5)
    })

    it('POST /cognitive/cer/counter generates adversarial counter via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/cer/counter', {
        debateId: 'debate-amoc-tipping',
        claimId: 'claim-amoc-tipping-near',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.counterArgument).toBeDefined()
    })

    it('POST /cognitive/cer/evaluate computes CER argument telemetry via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/cer/evaluate', {
        debateId: 'debate-amoc-tipping',
        selectedClaimId: 'claim-amoc-tipping-near',
        claimStatement:
          'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
        selectedEvidenceIds: [
          'ev-amoc-sst-autocorr',
          'ev-amoc-paleo-glacier',
          'ev-amoc-cmip6-bias',
        ],
        userEvidenceSynthesis:
          'Subpolar SST fingerprints exhibit critical slowing down with increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
        selectedPrincipleIds: ['princ-salt-advection', 'princ-critical-slowing'],
        userReasoningStatement:
          'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
        targetedCounterArgumentId: 'counter-amoc-rapid',
        userRebuttalStatement:
          'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.evaluation.ers).toBeGreaterThanOrEqual(70)
      expect(result.data.evaluation.tapLevel).toBe(5)
    })

    it('POST /cognitive/cer/deck generates calibrated FSRS-6 review deck via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/cer/deck', {
        debateId: 'debate-amoc-tipping',
        ersBaseline: 85,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBeGreaterThanOrEqual(4)
    })

    it('GET /cognitive/anchored/cases returns macrocontext cases via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/anchored/cases')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cases).toHaveLength(5)
      expect(result.data.cases[0].title).toContain('Jasper Woodbury')
    })

    it('POST /cognitive/anchored/sensitivity performs what-if parameter simulation via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/anchored/sensitivity', {
        caseId: 'case-jasper-flight',
        parameterId: 'data-headwind',
        variedValue: 35,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.simulation.caseId).toBe('case-jasper-flight')
      expect(result.data.simulation.constraintImpacts).toBeDefined()
    })

    it('POST /cognitive/anchored/evaluate computes situated problem-solving telemetry via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/anchored/evaluate', {
        caseId: 'case-jasper-flight',
        extractedDataValues: {
          'data-dist-oneway': 120,
          'data-cruising-speed': 100,
          'data-headwind': 20,
          'data-fuel-burn': 8.0,
          'data-total-fuel': 36,
          'data-reserve-required': 5,
          'data-ground-time': 0.5,
          'data-departure-time': 16.0,
          'data-sunset-time': 18.75,
        },
        subGoalSequence: [
          'sg-outbound-groundspeed',
          'sg-outbound-time',
          'sg-inbound-groundspeed',
          'sg-inbound-time',
          'sg-total-flight-time',
          'sg-total-mission-time',
          'sg-fuel-consumed',
          'sg-fuel-remaining',
        ],
        calculatedSubGoalOutputs: {
          'sg-outbound-groundspeed': 80,
          'sg-outbound-time': 1.5,
          'sg-inbound-groundspeed': 120,
          'sg-inbound-time': 1.0,
          'sg-total-flight-time': 2.5,
          'sg-total-mission-time': 19.0,
          'sg-fuel-consumed': 20.0,
          'sg-fuel-remaining': 16.0,
        },
        finalDecisionChoice: 'optimal_decision',
        decisionJustification:
          'We verify both operational boundary constraints: first, fuel remaining at final touchdown exceeds the mandatory 5.0 gallons minimum reserve; second, our return flight completes prior to the 18.75 sunset landing deadline.',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.evaluation.ikrs).toBeGreaterThanOrEqual(80)
      expect(result.data.evaluation.sgai).toBe(100)
      expect(result.data.evaluation.decisionApproved).toBe(true)
    })

    it('POST /cognitive/anchored/deck generates calibrated FSRS-6 review deck via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/anchored/deck', {
        caseId: 'case-jasper-flight',
        ikrsBaseline: 90,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBe(4)
      expect(result.data.cards[0].fsrsParameters).toBeDefined()
    })

    it('GET /cognitive/contrasting/sets returns canonical contrasting sets via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/contrasting/sets')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.sets.length).toBe(5)
      expect(result.data.sets[0].title).toContain('Buoyancy')
    })

    it('POST /cognitive/contrasting/evaluate evaluates invention attempts via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/contrasting/evaluate', {
        setId: 'set-density-buoyancy',
        inventedMetricName: 'Density Buoyancy Ratio',
        formulaDescription:
          'Computes the invariant ratio of object mass divided by volume to predict flotation displacement.',
        selectedDimensionIds: ['dim-mass-vol-ratio', 'dim-displacement-equilibrium'],
        variantRankings: [
          'cyl-balsa-disc',
          'cyl-hollow-steel',
          'cyl-oak-block',
          'cyl-neutral-gel',
          'cyl-aluminum-rod',
          'cyl-lead-bullet',
        ],
        impasseEncountered: true,
        reflectionNotes:
          'Encountered impasse when trying to use single dimension; discovered mass-to-volume ratio produces invariant ordering.',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.evaluation.cdts).toBeGreaterThanOrEqual(70)
      expect(result.data.evaluation.fdrs).toBe(100)
      expect(result.data.evaluation.rankingAccuracy).toBe(100)
    })

    it('POST /cognitive/contrasting/deck generates calibrated FSRS-6 review deck via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/contrasting/deck', {
        setId: 'set-density-buoyancy',
        cdtsBaseline: 88,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBe(4)
      expect(result.data.cards[0].fsrsParameters).toBeDefined()
    })

    it('GET /cognitive/collaborative/scenarios returns canonical CSCL scenarios via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/collaborative/scenarios')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.scenarios.length).toBe(5)
      expect(result.data.scenarios[0].title).toContain('Synaptic Tagging')
    })

    it('POST /cognitive/collaborative/partner generates automated peer response via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/collaborative/partner', {
        scenarioId: 'collab-neuro-synaptic-plasticity',
        learnerTurnText: 'Because you argued late-LTP is sufficient, consider saturation.',
        turnIndex: 0,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.peerTurn.speaker).toBe('peer_partner')
      expect(result.data.peerTurn.text).toBeDefined()
    })

    it('POST /cognitive/collaborative/evaluate computes transactive telemetry via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/collaborative/evaluate', {
        scenarioId: 'collab-neuro-synaptic-plasticity',
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
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.evaluation.cei).toBeGreaterThanOrEqual(80)
      expect(result.data.evaluation.tdi).toBeGreaterThanOrEqual(80)
      expect(result.data.evaluation.eed).toBeGreaterThanOrEqual(70)
      expect(result.data.evaluation.maturityBand).toBe('dialectical_synthesizer')
    })

    it('POST /cognitive/collaborative/deck generates calibrated FSRS-6 review deck via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/collaborative/deck', {
        scenarioId: 'collab-neuro-synaptic-plasticity',
        ceiBaseline: 90,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cards.length).toBe(4)
      expect(result.data.cards[0].fsrsParameters).toBeDefined()
    })

    it('GET /cognitive/system-dynamics/scenarios returns canonical scenarios via REST', async () => {
      const mock = createMockHttp('GET', '/cognitive/system-dynamics/scenarios')
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.scenarios.length).toBe(5)
      expect(result.data.scenarios[0].id).toBe('climate-permafrost-methane')
    })

    it('POST /cognitive/system-dynamics/simulate runs Euler integration via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/system-dynamics/simulate', {
        scenarioId: 'climate-permafrost-methane',
        stepsCount: 30,
        dt: 1.0,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.simulationRun.steps.length).toBe(30)
    })

    it('POST /cognitive/system-dynamics/evaluate evaluates model and computes telemetry via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/system-dynamics/evaluate', {
        scenarioId: 'climate-permafrost-methane',
        classifiedVariables: [
          { id: 'atmospheric_carbon', nature: 'stock' },
          { id: 'ocean_carbon_sink', nature: 'stock' },
          { id: 'permafrost_methane_stock', nature: 'stock' },
          { id: 'global_temperature_anomaly', nature: 'stock' },
          { id: 'fossil_emissions', nature: 'flow' },
          { id: 'ocean_sink_absorption', nature: 'flow' },
          { id: 'permafrost_thaw_release', nature: 'flow' },
          { id: 'radiative_heat_accumulation', nature: 'flow' },
        ],
        identifiedLoops: [
          {
            id: 'R1_albedo_cryosphere',
            polarity: 'reinforcing',
            elementIds: ['global_temperature_anomaly', 'radiative_heat_accumulation'],
            delayIdentified: true,
          },
          {
            id: 'R2_permafrost_runaway',
            polarity: 'reinforcing',
            elementIds: [
              'global_temperature_anomaly',
              'permafrost_thaw_release',
              'atmospheric_carbon',
              'radiative_heat_accumulation',
            ],
            delayIdentified: true,
          },
          {
            id: 'B1_ocean_buffering',
            polarity: 'balancing',
            elementIds: ['atmospheric_carbon', 'ocean_sink_absorption', 'ocean_carbon_sink'],
            delayIdentified: true,
          },
        ],
        identifiedArchetype: 'limits_to_growth',
        proposedHighLeverageIntervention:
          'Enforce binding global carbon budget caps (Meadows Rank 4 Rules of the System).',
        predictedBehavior: 'overshoot_and_collapse',
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.evaluation.sdi).toBeGreaterThanOrEqual(85)
      expect(result.data.evaluation.maturityTier).toBe('leverage_strategist')
    })

    it('POST /cognitive/system-dynamics/deck generates calibrated FSRS-6 deck via REST', async () => {
      const mock = createMockHttp('POST', '/cognitive/system-dynamics/deck', {
        scenarioId: 'climate-permafrost-methane',
        sdiBaseline: 85,
      })
      const result = await mock.execute()
      expect(result.statusCode).toBe(200)
      expect(result.data.ok).toBe(true)
      expect(result.data.cardsCount).toBe(4)
      expect(result.data.cards.length).toBe(4)
    })
  })
})
