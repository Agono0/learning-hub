/**
 * @file apps/web/tests/feedback-studio-integration.test.ts
 * @description Integration tests for the Feedback Literacy & Formative
 * Assessment Studio: SSR rendering of the HUD, studio and page, navigation
 * registration, and handler route behavior.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  calculateFLMetrics,
  FeedbackStatementSchema,
  getCanonicalFeedbackScenarios,
} from '@learning-hub/core/feedback-studio'
import { FeedbackStudioHUD } from '../src/ui/FeedbackStudioHUD'
import { FeedbackStudio } from '../src/components/FeedbackStudio'
import FeedbackStudioPage from '../app/feedback-studio/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/feedback-studio/route'

const sampleStatements = [
  FeedbackStatementSchema.parse({
    id: 't1',
    text: 'The calculation in step 2 is incorrect: a sign was dropped.',
  }),
  FeedbackStatementSchema.parse({
    id: 't2',
    text: 'Strategy tip: estimate the magnitude before computing each step of the method.',
  }),
  FeedbackStatementSchema.parse({
    id: 't3',
    text: 'Check your answer against the boundary case to verify it.',
  }),
]

describe('Feedback Studio Web Integration', () => {
  it('renders FeedbackStudioHUD with all four metrics in server context', () => {
    const metrics = calculateFLMetrics(sampleStatements)
    const html = renderToString(
      React.createElement(FeedbackStudioHUD, {
        feedbackQualityIndex: metrics.feedbackQualityIndex,
        formativeAlignmentScore: metrics.formativeAlignmentScore,
        levelBalanceScore: metrics.levelBalanceScore,
        selfFocusSafetyScore: metrics.selfFocusSafetyScore,
        statementCount: metrics.statementCount,
      }),
    )
    expect(html).toContain('Feedback Quality Index')
    expect(html).toContain('Formative alignment')
    expect(html).toContain('Level balance')
    expect(html).toContain('Self-focus safety')
    expect(html).toContain('3 statements analyzed')
  })

  it('renders the FeedbackStudio with tabs and the practice scenario', () => {
    const html = renderToString(React.createElement(FeedbackStudio))
    expect(html).toContain('Practice')
    expect(html).toContain('Analyzer')
    expect(html).toContain('Deck')
    expect(html).toContain('Mathematics')
    expect(html).toContain('Confidence')
    expect(html).toContain('Commit answer')
  })

  it('renders the Next.js page entrypoint without crashing', () => {
    const html = renderToString(React.createElement(FeedbackStudioPage))
    expect(html).toContain('Feedback Studio')
    expect(html).toContain('Practice')
  })

  it('registers /feedback-studio in the navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/feedback-studio')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Feedback Studio')
    expect(item?.icon).toBeDefined()
  })

  it('GET returns scenarios, guidelines, and reference constants', async () => {
    const res = await GET(new Request('http://localhost/api/feedback-studio'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.scenarios)).toBe(true)
    expect(data.scenarios.length).toBe(getCanonicalFeedbackScenarios().length)
    expect(Array.isArray(data.guidelines)).toBe(true)
    expect(data.targetLevelMix.self).toBeLessThanOrEqual(0.05)
    expect(Array.isArray(data.misconceptionTags)).toBe(true)
  })

  it('POST classify returns classifications and composite metrics', async () => {
    const res = await POST(
      new Request('http://localhost/api/feedback-studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'classify',
          statements: [
            { id: 'p1', text: 'You are so smart, better than most of the class.' },
            { id: 'p2', text: 'Check your units in step 2 before submitting.' },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.classifications.length).toBe(2)
    expect(data.classifications[0].level).toBe('self')
    expect(data.classifications[0].fitRisks.length).toBeGreaterThan(0)
    expect(data.metrics.statementCount).toBe(2)
    expect(data.metrics.feedbackQualityIndex).toBeGreaterThanOrEqual(0)
  })

  it('POST grade_response returns three-level formative feedback', async () => {
    const scenario = getCanonicalFeedbackScenarios()[0]
    const wrong = scenario.options.find((o) => !o.isCorrect)!
    const res = await POST(
      new Request('http://localhost/api/feedback-studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'grade_response',
          response: { scenarioId: scenario.id, optionId: wrong.id, confidence: 5 },
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.isCorrect).toBe(false)
    expect(data.hypercorrectionFlag).toBe(true)
    expect(data.misconceptionTag).toBe(wrong.misconceptionTag)
    expect(data.feedback.task.length).toBeGreaterThan(0)
    expect(data.feedback.process.length).toBeGreaterThan(0)
    expect(data.feedback.selfRegulation.length).toBeGreaterThan(0)
  })

  it('POST grade_response rejects a missing response', async () => {
    const res = await POST(
      new Request('http://localhost/api/feedback-studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'grade_response' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST generate_deck emits cards for the full bank and for subsets', async () => {
    const res = await POST(
      new Request('http://localhost/api/feedback-studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'generate_deck' }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.count).toBeGreaterThan(getCanonicalFeedbackScenarios().length)
    const scenario = getCanonicalFeedbackScenarios()[0]
    const res2 = await POST(
      new Request('http://localhost/api/feedback-studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'generate_deck', scenarioIds: [scenario.id] }),
      }),
    )
    const data2 = await res2.json()
    expect(
      data2.cards.every((c: { sourceRef: string }) =>
        c.sourceRef.startsWith(`feedback-scenario:${scenario.id}`),
      ),
    ).toBe(true)
  })

  it('POST audit reports one row per Shute guideline', async () => {
    const res = await POST(
      new Request('http://localhost/api/feedback-studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'audit',
          statements: [{ id: 'a1', text: 'Well done!' }],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.audits.length).toBeGreaterThanOrEqual(7)
    expect(data.formativeAlignmentScore).toBeLessThan(100)
  })

  it('POST rejects invalid bodies with a 400', async () => {
    const res = await POST(
      new Request('http://localhost/api/feedback-studio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'not-a-real-action' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})
