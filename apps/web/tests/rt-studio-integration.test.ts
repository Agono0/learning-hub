/**
 * @file apps/web/tests/rt-studio-integration.test.ts
 * @description Integration tests for Reciprocal Teaching & Dialogic Questioning Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_TEXT_PASSAGES,
  evaluateReciprocalSession,
} from '@learning-hub/core/reciprocal-teaching'
import { ReciprocalTeachingHUD } from '../src/ui/ReciprocalTeachingHUD'
import { ReciprocalTeachingStudio } from '../src/components/ReciprocalTeachingStudio'
import ReciprocalTeachingPage from '../app/reciprocal-teaching/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/reciprocal-teaching/route'

describe('Reciprocal Teaching & Dialogic Questioning Web Integration', () => {
  it('renders ReciprocalTeachingHUD correctly in server context', () => {
    const passage = CANONICAL_TEXT_PASSAGES[0]!
    const turns = [
      {
        id: 'turn-1',
        speaker: 'user' as const,
        role: 'questioner' as const,
        turnIndex: 0,
        text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial rather than eukaryotic in origin?',
        timestamp: Date.now() - 20000,
        icapLevel: 'constructive' as const,
        elaborationScore: 75,
      },
      {
        id: 'turn-2',
        speaker: 'user' as const,
        role: 'clarifier' as const,
        turnIndex: 1,
        text: 'Building on what you said, cardiolipin in the inner membrane refutes inward pinching because eukaryotic membranes lack cardiolipin.',
        timestamp: Date.now() - 10000,
        icapLevel: 'interactive' as const,
        elaborationScore: 85,
        resolvedMisconceptionId: 'misc-endo-1',
      },
    ]

    const evaluation = evaluateReciprocalSession(turns, passage)

    const html = renderToString(
      React.createElement(ReciprocalTeachingHUD, {
        evaluation,
        activePassageTitle: passage.title,
      }),
    )

    expect(html).toContain('Reciprocal Dialogic Telemetry')
    expect(html).toContain('RDMS Maturity')
    expect(html).toContain('ICAP Composite')
    expect(html).toContain('Strategy Balance')
    expect(html).toContain('Elaboration &amp; Repair')
    expect(html).toContain('Palincsar 4-Role Engagement Profile')
    expect(html).toContain('Questioner')
    expect(html).toContain('Clarifier')
    expect(html).toContain('Summarizer')
    expect(html).toContain('Predictor')
  })

  it('renders ReciprocalTeachingStudio cleanly via SSR without crashing', () => {
    const html = renderToString(React.createElement(ReciprocalTeachingStudio))
    expect(html).toContain('Reciprocal Dialogic Telemetry')
    expect(html).toContain('1. Text &amp; Role Allocation')
    expect(html).toContain('2. Cognitive Stems')
    expect(html).toContain('3. Dialogue Arena')
    expect(html).toContain('4. Synthesis &amp; FSRS Deck')
    expect(html).toContain('Lynn Margulis &amp; The Serial Endosymbiotic Theory')
    expect(html).toContain('Select Your Reciprocal Role')
  })

  it('renders ReciprocalTeachingPage wrapper', () => {
    const html = renderToString(React.createElement(ReciprocalTeachingPage))
    expect(html).toContain('container mx-auto')
    expect(html).toContain('Reciprocal Dialogic Telemetry')
  })

  it('registers /reciprocal-teaching in ALL_NAV_ITEMS with correct label', () => {
    const navItem = ALL_NAV_ITEMS.find((i) => i.href === '/reciprocal-teaching')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Reciprocal Teaching')
  })

  it('serves GET /api/reciprocal-teaching with all 5 canonical text passages', async () => {
    const res = await GET(new Request('http://localhost/api/reciprocal-teaching'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.passages).toHaveLength(5)
    expect(data.passages[0].title).toContain('Endosymbiotic')
  })

  it('serves POST /api/reciprocal-teaching with evaluate_session', async () => {
    const payload = {
      action: 'evaluate_session',
      passageId: 'passage-endosymbiosis',
      turns: [
        {
          id: 'turn-1',
          speaker: 'user',
          role: 'questioner',
          turnIndex: 0,
          text: 'What structural evidence proves that the inner mitochondrial membrane is bacterial?',
          timestamp: 1000,
          icapLevel: 'constructive',
          elaborationScore: 75,
        },
      ],
    }

    const res = await POST(
      new Request('http://localhost/api/reciprocal-teaching', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.evaluation.rdms).toBeGreaterThanOrEqual(10)
    expect(data.evaluation.icap).toBeDefined()
    expect(data.evaluation.strategy).toBeDefined()
  })

  it('serves POST /api/reciprocal-teaching with generate_peer_turn and generate_deck', async () => {
    // 1. Peer turn
    const peerRes = await POST(
      new Request('http://localhost/api/reciprocal-teaching', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_peer_turn',
          passageId: 'passage-halting-problem',
          turns: [],
          preferredRole: 'clarifier',
        }),
      }),
    )
    expect(peerRes.status).toBe(200)
    const peerData = await peerRes.json()
    expect(peerData.success).toBe(true)
    expect(peerData.peerTurn.role).toBe('clarifier')

    // 2. FSRS deck
    const deckRes = await POST(
      new Request('http://localhost/api/reciprocal-teaching', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_deck',
          passageId: 'passage-endosymbiosis',
          turns: [
            {
              id: 'turn-1',
              speaker: 'user',
              role: 'questioner',
              turnIndex: 0,
              text: 'Why does cardiolipin indicate prokaryotic descent?',
              timestamp: 1000,
              icapLevel: 'constructive',
              elaborationScore: 80,
            },
          ],
        }),
      }),
    )
    expect(deckRes.status).toBe(200)
    const deckData = await deckRes.json()
    expect(deckData.passageId).toBe('passage-endosymbiosis')
    expect(deckData.cards).toHaveLength(4)
  })
})
