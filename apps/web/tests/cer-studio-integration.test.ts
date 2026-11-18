/**
 * @file apps/web/tests/cer-studio-integration.test.ts
 * @description Integration tests for Claim-Evidence-Reasoning (CER) & Epistemic Argumentation Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_SCIENTIFIC_DEBATES,
  evaluateCERArgument,
  type CERArgumentSubmission,
} from '@learning-hub/core/argumentation'
import { ArgumentationHUD } from '../src/ui/ArgumentationHUD'
import { ArgumentationStudio } from '../src/components/ArgumentationStudio'
import ArgumentationPage from '../app/argumentation/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/argumentation/route'

describe('Epistemic Argumentation & CER Web Integration', () => {
  it('renders ArgumentationHUD correctly in server context', () => {
    const debate = CANONICAL_SCIENTIFIC_DEBATES[0]!
    const submission: CERArgumentSubmission = {
      debateId: debate.id,
      selectedClaimId: 'claim-amoc-tipping-near',
      claimStatement:
        'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
      selectedEvidenceIds: ['ev-amoc-sst-autocorr', 'ev-amoc-paleo-glacier', 'ev-amoc-cmip6-bias'],
      userEvidenceSynthesis:
        'Subpolar SST fingerprints exhibit critical slowing down with increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
      selectedPrincipleIds: ['princ-salt-advection', 'princ-critical-slowing'],
      userReasoningStatement:
        'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
      targetedCounterArgumentId: 'counter-amoc-rapid',
      userRebuttalStatement:
        'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
    }

    const evaluation = evaluateCERArgument(debate, submission)

    const html = renderToString(
      React.createElement(ArgumentationHUD, {
        evaluation,
        activeDebateTitle: debate.title,
      }),
    )

    expect(html).toContain('Epistemic Argumentation Telemetry')
    expect(html).toContain('Epistemic Rigor (ERS)')
    expect(html).toContain('Erduran-Osborne Toulmin Argument Pattern (TAP) Hierarchy')
    expect(html).toContain('CER Completeness')
    expect(html).toContain('Evidence Quality (EQI)')
    expect(html).toContain('Reasoning Depth (RDI)')
    expect(html).toContain('Achieved')
  })

  it('renders ArgumentationStudio cleanly via SSR without crashing', () => {
    const html = renderToString(React.createElement(ArgumentationStudio))
    expect(html).toContain('Epistemic Argumentation Telemetry')
    expect(html).toContain('1. Phenomenon &amp; Claims')
    expect(html).toContain('2. Evidence Pool')
    expect(html).toContain('3. Reasoning &amp; Rebuttal')
    expect(html).toContain('4. Dialectic Synthesis')
    expect(html).toContain('Atlantic Meridional Overturning Circulation')
    expect(html).toContain('Select Scientific Debate')
  })

  it('renders ArgumentationPage wrapper cleanly', () => {
    const html = renderToString(React.createElement(ArgumentationPage))
    expect(html).toContain('container mx-auto')
    expect(html).toContain('Epistemic Argumentation Telemetry')
  })

  it('registers /argumentation in ALL_NAV_ITEMS with correct label', () => {
    const navItem = ALL_NAV_ITEMS.find((i) => i.href === '/argumentation')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Argumentation')
  })

  it('serves GET /api/argumentation with all 5 canonical scientific debate cases', async () => {
    const res = await GET(new Request('http://localhost/api/argumentation'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.debates).toHaveLength(5)
    expect(data.debates[0].title).toContain('AMOC')
  })

  it('serves POST /api/argumentation with evaluate_argument', async () => {
    const payload = {
      action: 'evaluate_argument',
      debateId: 'debate-amoc-tipping',
      selectedClaimId: 'claim-amoc-tipping-near',
      claimStatement:
        'The AMOC has crossed early-warning tipping thresholds and is on course for irreversible bi-stable shutdown this century.',
      selectedEvidenceIds: ['ev-amoc-sst-autocorr', 'ev-amoc-paleo-glacier', 'ev-amoc-cmip6-bias'],
      userEvidenceSynthesis:
        'Subpolar SST fingerprints exhibit critical slowing down with increased variance, mirrored by Heinrich Stadial 1 paleorecords where freshwater pulses suppressed overturning by >70%. CMIP6 stability is an artifact of deep salinity restoring.',
      selectedPrincipleIds: ['princ-salt-advection', 'princ-critical-slowing'],
      userReasoningStatement:
        'According to Stommel salt-advection feedback, high-latitude freshening lowers surface density; consequently, deep convection decelerates, which reduces northward transport of saline waters, creating runaway positive feedback. Furthermore, bifurcation theory demonstrates that increased autocorrelation causally indicates loss of dynamical resilience.',
      targetedCounterArgumentId: 'counter-amoc-rapid',
      userRebuttalStatement:
        'Opponents cite the 2004–2022 RAPID-MOCHA mooring array as evidence of stability; however, this rebuttal is flawed because 18 years of instrumental data is statistically insufficient to disentangle multi-decadal Atlantic Multidecadal Variability from long-term centennial deceleration.',
    }

    const res = await POST(
      new Request('http://localhost/api/argumentation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.evaluation.ers).toBeGreaterThanOrEqual(70)
    expect(data.evaluation.tapLevel).toBe(5)
    expect(data.evaluation.ccs).toBe(100)
    expect(data.evaluation.eqi).toBeGreaterThanOrEqual(80)
  })

  it('serves POST /api/argumentation with counter_argue and generate_deck', async () => {
    // 1. Counter argue
    const counterRes = await POST(
      new Request('http://localhost/api/argumentation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'counter_argue',
          debateId: 'debate-amoc-tipping',
          claimId: 'claim-amoc-tipping-near',
        }),
      }),
    )
    expect(counterRes.status).toBe(200)
    const counterData = await counterRes.json()
    expect(counterData.success).toBe(true)
    expect(counterData.counterArgument).toBeDefined()
    expect(counterData.counterArgument.rebuttalChallenge).toBeDefined()

    // 2. FSRS deck
    const deckRes = await POST(
      new Request('http://localhost/api/argumentation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_deck',
          debateId: 'debate-amoc-tipping',
          submission: {
            debateId: 'debate-amoc-tipping',
            selectedClaimId: 'claim-amoc-tipping-near',
            claimStatement: 'AMOC tipping threshold imminent.',
            selectedEvidenceIds: ['ev-amoc-sst-autocorr'],
            userEvidenceSynthesis: 'SST autocorrelation fingerprint.',
            selectedPrincipleIds: ['princ-salt-advection'],
            userReasoningStatement:
              'Salt-advection creates runaway deceleration because of density.',
          },
        }),
      }),
    )
    expect(deckRes.status).toBe(200)
    const deckData = await deckRes.json()
    expect(deckData.debateId).toBe('debate-amoc-tipping')
    expect(deckData.cards).toHaveLength(4)
  })
})
