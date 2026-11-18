/**
 * @file apps/web/tests/pi-studio-integration.test.ts
 * @description Integration tests for Peer Instruction & Interactive ConcepTest Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  calculatePIMetrics,
  getCanonicalConcepTestSuites,
} from '@learning-hub/core/peer-instruction'
import { PeerInstructionHUD } from '../src/ui/PeerInstructionHUD'
import { PeerInstructionStudio } from '../src/components/PeerInstructionStudio'
import PeerInstructionPage from '../app/peer-instruction/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/peer-instruction/route'

describe('Peer Instruction Studio Web Integration', () => {
  it('renders PeerInstructionHUD correctly in server context', () => {
    const suite = getCanonicalConcepTestSuites()[0]!
    const metrics = calculatePIMetrics({
      suite,
      q1InitialOptionId: suite.q1Options[0]!.id,
      q1InitialConfidence: 3,
      q1RevoteOptionId: suite.q1Options.find((o) => o.isCorrect)!.id,
      q1RevoteConfidence: 5,
      q2TransferOptionId: suite.q2Options.find((o) => o.isCorrect)!.id,
      peerDiscussionOccurred: true,
      simulatedClassroomAccuracyVote1: 38,
      simulatedClassroomAccuracyVote2: 82,
    })

    const html = renderToString(
      React.createElement(PeerInstructionHUD, {
        metrics,
        activeSuiteTitle: suite.title,
      }),
    )

    expect(html).toContain('Peer Instruction Telemetry')
    expect(html).toContain('Mazur-Smith Engine')
    expect(html).toContain('Hake Gain')
    expect(html).toContain('Vote Polarization (PI)')
    expect(html).toContain('Convergence Ratio')
    expect(html).toContain('Smith Q2 Transfer')
    expect(html).toContain('Thermal Expansion')
  })

  it('renders PeerInstructionStudio with tabs, suite selection, and interactive controls', () => {
    const html = renderToString(React.createElement(PeerInstructionStudio))

    // Tab buttons
    expect(html).toContain('1. Individual Vote (Q1)')
    expect(html).toContain('2. Peer Deliberation')
    expect(html).toContain('3. Revote &amp; Synthesis')
    expect(html).toContain('4. Isomorphic Q2 &amp; Cards')

    // Suite selector
    expect(html).toContain('Thermal Expansion &amp; Geometric Scaling')
    expect(html).toContain('Classical Mechanics &amp; Thermodynamics')

    // Challenge context
    expect(html).toContain('Step 1: Silent Individual Poll (Mazur 1997)')
    expect(html).toContain('Qualitative ConcepTest Challenge (Q1):')
    expect(html).toContain('Cast Your Individual Vote (No consulting peers yet):')
  })

  it('renders PeerInstructionPage Next.js route entrypoint without crashing', () => {
    const html = renderToString(React.createElement(PeerInstructionPage))
    expect(html).toContain('Peer Instruction Telemetry')
    expect(html).toContain('Step 1: Silent Individual Poll (Mazur 1997)')
    expect(html).toContain('Qualitative ConcepTest Challenge (Q1):')
  })

  it('verifies that /peer-instruction is registered in navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/peer-instruction')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Peer Instruction')
    expect(item?.icon).toBeDefined()
  })

  it('verifies GET /api/peer-instruction endpoint returns canonical suites', async () => {
    const res = await GET(new Request('http://localhost/api/peer-instruction'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.suites.length).toBeGreaterThanOrEqual(5)
  })

  it('verifies POST /api/peer-instruction endpoint evaluates trajectories, dialogue, and decks', async () => {
    // 1. Get dialogue
    const dialogueReq = new Request('http://localhost/api/peer-instruction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_dialogue',
        suiteId: 'ct-thermal-expansion-plate',
      }),
    })
    const dialogueRes = await POST(dialogueReq)
    expect(dialogueRes.status).toBe(200)
    const dialogueData = await dialogueRes.json()
    expect(dialogueData.success).toBe(true)
    expect(dialogueData.simulatedPeers.length).toBeGreaterThanOrEqual(2)

    // 2. Calculate metrics
    const metricsReq = new Request('http://localhost/api/peer-instruction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'calculate_metrics',
        suiteId: 'ct-thermal-expansion-plate',
        q1InitialConfidence: 3,
        q1RevoteConfidence: 5,
        peerDiscussionOccurred: true,
      }),
    })
    const metricsRes = await POST(metricsReq)
    expect(metricsRes.status).toBe(200)
    const metricsData = await metricsRes.json()
    expect(metricsData.success).toBe(true)
    expect(metricsData.metrics.hakeNormalizedGain).toBeGreaterThan(0)
    expect(metricsData.metrics.smithLearningVerification).toBe(true)

    // 3. Generate deck
    const deckReq = new Request('http://localhost/api/peer-instruction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_deck',
        suiteId: 'ct-thermal-expansion-plate',
      }),
    })
    const deckRes = await POST(deckReq)
    expect(deckRes.status).toBe(200)
    const deckData = await deckRes.json()
    expect(deckData.success).toBe(true)
    expect(deckData.deck.length).toBeGreaterThanOrEqual(3)
  })
})
