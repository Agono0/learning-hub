/**
 * @file apps/web/tests/skills-studio-integration.test.ts
 * @description Integration test suite for Matt Pocock Agent Skills & Autonomous Engineering Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CANONICAL_SKILLS, executeSkillSimulation } from '@learning-hub/core/skills'
import { GET, POST } from '../src/server/handlers/skills/route'
import { SkillsHUD } from '../src/ui/SkillsHUD'

describe('Agent Skills & Autonomous Engineering Suite', () => {
  it('GET /api/skills returns the complete canonical skills catalog', async () => {
    const res = await GET()
    expect(res.status).toBe(200)

    const data = (await res.json()) as { ok: boolean; total: number; skills: unknown[] }
    expect(data.ok).toBe(true)
    expect(data.total).toBeGreaterThanOrEqual(8)
    expect(Array.isArray(data.skills)).toBe(true)
  })

  it('POST /api/skills with action="execute" runs Socratic grill-me and to-tickets', async () => {
    // 1. Grill-Me
    const grillReq = new Request('http://localhost/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'execute',
        skillId: 'grill-me',
        topic: 'Offline-First SQLite Worker Architecture',
        context: 'Evaluating OPFS vs IndexedDB storage with web worker message protocol.',
      }),
    })

    const grillRes = await POST(grillReq)
    expect(grillRes.status).toBe(200)
    const grillData = await grillRes.json()
    expect(grillData.ok).toBe(true)
    expect(grillData.result.skillName).toBe('grill-me')
    expect(grillData.result.clarityIndex).toBeGreaterThan(60)
    expect(grillData.result.suggestedNextSkill).toBe('to-spec')

    // 2. To-Tickets
    const ticketsReq = new Request('http://localhost/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'execute',
        skillId: 'to-tickets',
        topic: 'Circadian Peak Optimizer',
        context: 'Process C & S simulation with caffeine pharmacokinetics.',
      }),
    })

    const ticketsRes = await POST(ticketsReq)
    expect(ticketsRes.status).toBe(200)
    const ticketsData = await ticketsRes.json()
    expect(ticketsData.ok).toBe(true)
    expect(ticketsData.result.tickets.length).toBeGreaterThanOrEqual(3)
    expect(ticketsData.result.tickets[0].priority).toBe('P0')
  })

  it('POST /api/skills with action="audit" checks AGENTS.md rule compliance', async () => {
    const badCode = `
      export default function Test() {
        const data = fetch('/api/test')
        return <div dangerouslySetInnerHTML={{ __html: 'test' }} />
      }
    `
    const auditReq = new Request('http://localhost/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'audit',
        topic: 'Code Audit',
        context: badCode,
        parameters: { filepath: 'apps/web/app/test/page.tsx' },
      }),
    })

    const auditRes = await POST(auditReq)
    expect(auditRes.status).toBe(200)
    const auditData = await auditRes.json()
    expect(auditData.ok).toBe(true)
    expect(auditData.violationsCount).toBeGreaterThanOrEqual(2) // Rule 1 (fetch) and Rule 11 (dangerouslySetInnerHTML)
  })

  it('POST /api/skills with action="render" exports standard SKILL.md format', async () => {
    const renderReq = new Request('http://localhost/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'render',
        skillId: 'to-spec',
        topic: 'Specification',
      }),
    })

    const renderRes = await POST(renderReq)
    expect(renderRes.status).toBe(200)
    const renderData = await renderRes.json()
    expect(renderData.ok).toBe(true)
    expect(renderData.markdown).toContain('---')
    expect(renderData.markdown).toContain('name: to-spec')
    expect(renderData.markdown).toContain('# To Spec — Formal Specification Synthesizer')
  })

  it('SkillsHUD renders telemetry gauges, active phases, and tool chips', () => {
    const skill = CANONICAL_SKILLS['grill-me']!
    const mockResult = executeSkillSimulation('grill-me', {
      topic: 'Test Topic',
      context: 'Test context description.',
    })

    const html = renderToString(
      React.createElement(SkillsHUD, {
        skill,
        currentPhaseIndex: 1,
        lastResult: mockResult,
      }),
    )

    expect(html).toContain('Grill Me — Relentless Socratic Interview')
    expect(html).toContain('Socratic Clarity')
    expect(html).toContain('Invariant Rigor')
    expect(html).toContain('Pipeline Stage')
    expect(html).toContain('ask_question')
  })
})
