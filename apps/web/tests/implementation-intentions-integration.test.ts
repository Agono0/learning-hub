/**
 * @file apps/web/tests/implementation-intentions-integration.test.ts
 * @description Integration tests for the Implementation Intentions & Habit
 * Formation Studio: SSR rendering, navigation registration, and handler
 * route behavior.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  getCanonicalPlanTemplates,
  instantiateTemplate,
  LALLY_MEDIAN_DAYS,
} from '@learning-hub/core/implementation-intentions'
import { ImplementationIntentionsStudio } from '../src/components/ImplementationIntentionsStudio'
import ImplementationIntentionsPage from '../app/implementation-intentions/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/implementation-intentions/route'

const validPlan = {
  id: 'p1',
  goal: 'Study daily',
  trigger: 'After I finish breakfast at the kitchen table',
  triggerKind: 'event' as const,
  action: 'I open the review queue and complete my due cards',
  obstacle: 'Phone notifications',
  obstacleResponse: 'If a notification appears, then I note it and return to the card',
}

describe('Implementation Intentions Studio Web Integration', () => {
  it('renders the studio with tabs and the plan builder', () => {
    const html = renderToString(React.createElement(ImplementationIntentionsStudio))
    expect(html).toContain('Plan builder')
    expect(html).toContain('Automaticity')
    expect(html).toContain('Deck')
    expect(html).toContain('Start from a template')
    expect(html).toContain('IF (critical situation)')
  })

  it('renders the Next.js page entrypoint without crashing', () => {
    const html = renderToString(React.createElement(ImplementationIntentionsPage))
    expect(html).toContain('Implementation Intentions')
    expect(html).toContain('Plan builder')
  })

  it('registers /implementation-intentions in the navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/implementation-intentions')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Implementation Intentions')
    expect(item?.icon).toBeDefined()
  })

  it('GET returns templates, obstacles and Lally reference constants', async () => {
    const res = await GET(new Request('http://localhost/api/implementation-intentions'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.templates.length).toBe(getCanonicalPlanTemplates().length)
    expect(Array.isArray(data.obstacles)).toBe(true)
    expect(data.reference.medianDays).toBe(LALLY_MEDIAN_DAYS)
  })

  it('POST evaluate_plan scores a complete MCII plan highly', async () => {
    const res = await POST(
      new Request('http://localhost/api/implementation-intentions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate_plan', plan: validPlan }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.quality.qualityIndex).toBeGreaterThanOrEqual(70)
    expect(data.quality.rationales.length).toBe(4)
  })

  it('POST evaluate_plan rejects a missing plan', async () => {
    const res = await POST(
      new Request('http://localhost/api/implementation-intentions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate_plan' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST project returns a bounded Lally-curve projection', async () => {
    const res = await POST(
      new Request('http://localhost/api/implementation-intentions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'project',
          adherence: [
            { date: '2026-01-01', performed: true },
            { date: '2026-01-02', performed: false },
            { date: '2026-01-03', performed: true },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.projection.currentStrength).toBeGreaterThan(0)
    expect(data.projection.currentStrength).toBeLessThanOrEqual(100)
    expect(data.projection.daysToAutomaticity).toBeGreaterThanOrEqual(0)
    expect(data.projection.currentStreak).toBe(1)
  })

  it('POST instantiate drafts a schema-valid plan from a template', async () => {
    const res = await POST(
      new Request('http://localhost/api/implementation-intentions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'instantiate',
          templateId: 'ii-study-spaced-review',
          goal: 'Master organic chemistry',
        }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.plan.goal).toBe('Master organic chemistry')
    expect(data.plan.trigger.length).toBeGreaterThan(10)
  })

  it('POST instantiate rejects missing templateId or goal', async () => {
    const res = await POST(
      new Request('http://localhost/api/implementation-intentions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'instantiate', templateId: 'ii-study-spaced-review' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('POST generate_deck emits template + obstacle cards', async () => {
    const res = await POST(
      new Request('http://localhost/api/implementation-intentions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'generate_deck' }),
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.count).toBeGreaterThan(getCanonicalPlanTemplates().length)
  })

  it('POST rejects invalid bodies with a 400', async () => {
    const res = await POST(
      new Request('http://localhost/api/implementation-intentions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'nope' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('template instantiation works end-to-end through the engine', () => {
    const plan = instantiateTemplate('ii-exercise-morning', 'Run a 10k in spring')
    expect(plan.triggerKind).toBe('event')
    expect(plan.obstacle).toBeTruthy()
  })
})
