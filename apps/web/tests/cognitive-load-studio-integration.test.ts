/**
 * @file apps/web/tests/cognitive-load-studio-integration.test.ts
 * @description Integration tests for Cognitive Load Theory (CLT) & Flow State Balancer Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { evaluateComprehensiveCognitiveLoad } from '@learning-hub/core/cognitive-load'
import { CognitiveLoadFlowHUD } from '../src/ui/CognitiveLoadFlowHUD'
import { CognitiveLoadStudio } from '../src/components/CognitiveLoadStudio'
import CognitiveLoadPage from '../app/cognitive-load/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/cognitive-load/route'

describe('Cognitive Load Theory & Flow State Balancer Studio Web Integration', () => {
  it('renders CognitiveLoadFlowHUD correctly in server context', () => {
    const evaluation = evaluateComprehensiveCognitiveLoad({
      responseLatencyMs: 3500,
      baselineLatencyMs: 4000,
      keystrokeTimestamps: [0, 150, 300, 450, 600],
      backspaceCount: 0,
      recentErrorsInLast5Cards: 0,
      subjectiveMentalEffortRating: 4,
      taskElementCount: 4,
      learnerDomainMastery: 0.8,
      targetTaskDifficulty: 0.8,
    })

    const html = renderToString(
      React.createElement(CognitiveLoadFlowHUD, {
        evaluation,
        activeScenarioTitle: 'Distributed Consensus & Asynchronous Quorum Overlap',
      }),
    )

    expect(html).toContain('Cognitive Load &amp; Flow State Telemetry')
    expect(html).toContain('Distributed Consensus &amp; Asynchronous Quorum Overlap')
    expect(html).toContain('Cognitive Load Index')
    expect(html).toContain('WM Chunk Load')
    expect(html).toContain('Paas 2D Efficiency')
    expect(html).toContain('Challenge / Skill')
    expect(html).toContain('Sweller Tripartite Load Decomposition')
    expect(html).toContain('Intrinsic Load')
    expect(html).toContain('Extraneous Friction')
    expect(html).toContain('Germane Effort')
    expect(html).toContain('FSRS-6 Dynamic Spaced Repetition Calibration')
  })

  it('renders CognitiveLoadStudio with all 4 workbench tabs, scenarios, and sliders', () => {
    const html = renderToString(React.createElement(CognitiveLoadStudio))

    // Tab labels
    expect(html).toContain('Real-Time Flow Balancer')
    expect(html).toContain('Paas 2D Efficiency &amp; Arousal')
    expect(html).toContain('Sweller Scaffolding Crucible')
    expect(html).toContain('FSRS Cognitive Modulation')

    // Preset profile buttons
    expect(html).toContain('Optimal Flow')
    expect(html).toContain('Severe Overload')
    expect(html).toContain('Underload')

    // Scenario benchmark domain
    expect(html).toContain('Distributed Systems')
    expect(html).toContain('Live Retrieval Telemetry &amp; Cognitive Friction Sliders')

    // Flow corridor card
    expect(html).toContain('Csikszentmihalyi Flow Corridor')
    expect(html).toContain('Prescribed Micro-Intervention')
  })

  it('renders CognitiveLoadPage Next.js route entrypoint with foundations panel', () => {
    const html = renderToString(React.createElement(CognitiveLoadPage))

    expect(html).toContain('Cognitive Load &amp; Flow State Balancer')
    expect(html).toContain('Sweller Tripartite Load')
    expect(html).toContain('Csikszentmihalyi Flow')
    expect(html).toContain('Paas 2D Efficiency')
    expect(html).toContain('Cognitive Load Theory &amp; Psychometric Foundations')
    expect(html).toContain('1. Sweller (1988, 2011) Tripartite Load')
    expect(html).toContain('2. Paas &amp; Van Merriënboer (1993) 2D Efficiency')
    expect(html).toContain('3. Pollock Isolated-Elements Scaffolding')
  })

  it('verifies that /cognitive-load is registered in navigation model', () => {
    const navItem = ALL_NAV_ITEMS.find((item) => item.href === '/cognitive-load')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Cognitive Load')
    expect(navItem?.icon).toBeDefined()
  })

  it('verifies GET /api/cognitive-load endpoint returns benchmarks and baseline profiles', async () => {
    const res = await GET(new Request('http://localhost/api/cognitive-load'))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.capacityLimit).toBe(4.0)
    expect(data.benchmarks.distributed_paxos_consensus).toBeDefined()
    expect(data.benchmarks.recursive_ast_interpreter).toBeDefined()
    expect(data.benchmarks.sql_window_partition).toBeDefined()
    expect(data.baselineProfiles.optimal_flow).toBeDefined()
    expect(data.baselineProfiles.cognitive_thrashing).toBeDefined()
  })

  it('verifies POST /api/cognitive-load endpoint processes telemetry into comprehensive evaluation', async () => {
    const req = new Request('http://localhost/api/cognitive-load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate_telemetry',
        scenarioId: 'distributed_paxos_consensus',
        telemetry: {
          responseLatencyMs: 3400,
          baselineLatencyMs: 4000,
          keystrokeTimestamps: [0, 140, 280, 420, 560],
          backspaceCount: 0,
          recentErrorsInLast5Cards: 0,
          subjectiveMentalEffortRating: 3,
          taskElementCount: 3,
          learnerDomainMastery: 0.85,
          targetTaskDifficulty: 0.8,
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.scenarioId).toBe('distributed_paxos_consensus')
    expect(data.evaluation.cli).toBeLessThan(0.35)
    expect(data.evaluation.flowEvaluation.flowZone).toBe('flow')
    expect(data.evaluation.paasEfficiency.quadrant).toBe('high_efficiency')
    expect(data.evaluation.fsrsModulation.stabilityMultiplier).toBe(1.25)
    expect(data.activeScaffoldStage).toBeDefined()
  })

  it('verifies POST /api/cognitive-load detects overload and steps down to Phase 1 scaffold', async () => {
    const req = new Request('http://localhost/api/cognitive-load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate_telemetry',
        scenarioId: 'distributed_paxos_consensus',
        telemetry: {
          responseLatencyMs: 15000,
          baselineLatencyMs: 3500,
          keystrokeTimestamps: [0, 200, 1900, 2100, 4000],
          backspaceCount: 8,
          recentErrorsInLast5Cards: 3,
          subjectiveMentalEffortRating: 9,
          taskElementCount: 9,
          learnerDomainMastery: 0.2,
          targetTaskDifficulty: 0.95,
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.evaluation.tripartiteLoad.isOverloaded).toBe(true)
    expect(data.evaluation.recommendedIntervention).toBe('worked_example')
    expect(data.evaluation.fsrsModulation.stabilityMultiplier).toBe(0.75)
    expect(data.activeScaffoldStage.phase).toBe('isolated_elements')
  })
})
