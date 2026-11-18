import { describe, expect, it } from 'vitest'
import {
  CANONICAL_SKILLS,
  auditCodeAgainstAgentsRules,
  executeSkillSimulation,
  interpolateSkillPrompt,
  parseSkillMarkdown,
  renderSkillMarkdown,
  skillDefinitionSchema,
} from '../src/skills'

describe('Matt Pocock Agent Skills & Autonomous Engineering Engine', () => {
  it('validates all canonical skills against skillDefinitionSchema', () => {
    const skillKeys = Object.keys(CANONICAL_SKILLS)
    expect(skillKeys.length).toBeGreaterThanOrEqual(7)
    expect(skillKeys).toContain('grill-me')
    expect(skillKeys).toContain('to-spec')
    expect(skillKeys).toContain('to-tickets')
    expect(skillKeys).toContain('deliberate-practice')
    expect(skillKeys).toContain('concept-refactor')
    expect(skillKeys).toContain('code-review')
    expect(skillKeys).toContain('handoff')
    expect(skillKeys).toContain('wayfinder')

    for (const [id, skill] of Object.entries(CANONICAL_SKILLS)) {
      const parsed = skillDefinitionSchema.safeParse(skill)
      expect(parsed.success, `Skill ${id} failed validation: ${parsed.error}`).toBe(true)
      expect(skill.meta.name).toBe(id)
      expect(skill.systemPrompt.length).toBeGreaterThan(20)
    }
  })

  it('parses and serializes SKILL.md format with YAML frontmatter', () => {
    const rawMarkdown = `---
name: custom-audit
title: 'Custom Architectural Audit'
description: 'Audits components for compliance.'
category: engineering
author: 'Test Agent'
version: '1.0.0'
tags: ['test', 'audit']
requiredTools: ['run_command']
---

# Custom Architectural Audit

You are an architectural auditor for custom systems.
`
    const parsed = parseSkillMarkdown(rawMarkdown)
    expect(parsed.meta.name).toBe('custom-audit')
    expect(parsed.meta.title).toBe('Custom Architectural Audit')
    expect(parsed.meta.category).toBe('engineering')
    expect(parsed.meta.tags).toEqual(['test', 'audit'])
    expect(parsed.systemPrompt).toContain('You are an architectural auditor')

    const serialized = renderSkillMarkdown(parsed)
    expect(serialized).toContain('name: custom-audit')
    expect(serialized).toContain('category: engineering')
    expect(serialized).toContain('# Custom Architectural Audit')
  })

  it('audits code against AGENTS.md hard invariants', () => {
    // 1. Violation: raw fetch in UI (Rule 1)
    const badUiCode = `
      export function BadComponent() {
        async function load() {
          const res = await fetch('/api/cards')
          return res.json()
        }
        return <div>Bad</div>
      }
    `
    const uiViolations = auditCodeAgainstAgentsRules(badUiCode, 'apps/web/app/cards/page.tsx')
    expect(uiViolations.some((v) => v.ruleId === 1)).toBe(true)
    expect(uiViolations[0]!.severity).toBe('error')

    // 2. Violation: static node import in handlers (Rule 2)
    const badHandlerCode = `
      import fs from 'node:fs'
      export async function GET() {
        return Response.json({ ok: true })
      }
    `
    const handlerViolations = auditCodeAgainstAgentsRules(
      badHandlerCode,
      'apps/web/src/server/handlers/test/route.ts',
    )
    expect(handlerViolations.some((v) => v.ruleId === 2)).toBe(true)

    // 3. Violation: direct card stability update outside review-service (Rule 7)
    const badGradingCode = `
      tx.update(cards).set({ stability: 5.0 }).where(eq(cards.id, 12)).run()
    `
    const gradingViolations = auditCodeAgainstAgentsRules(
      badGradingCode,
      'apps/web/src/server/handlers/custom/route.ts',
    )
    expect(gradingViolations.some((v) => v.ruleId === 7)).toBe(true)

    // 4. Violation: dangerouslySetInnerHTML (Rule 11)
    const badHtmlCode = `
      <div dangerouslySetInnerHTML={{ __html: content }} />
    `
    const htmlViolations = auditCodeAgainstAgentsRules(
      badHtmlCode,
      'apps/web/src/components/Renderer.tsx',
    )
    expect(htmlViolations.some((v) => v.ruleId === 11)).toBe(true)

    // 5. Clean compliant code: 0 violations
    const cleanUiCode = `
      import { apiGet } from '@/lib/transport'
      import { Markdown } from '@/ui'
      export function GoodComponent({ text }: { text: string }) {
        return <Markdown content={text} />
      }
    `
    const cleanViolations = auditCodeAgainstAgentsRules(
      cleanUiCode,
      'apps/web/src/components/Good.tsx',
    )
    expect(cleanViolations).toHaveLength(0)
  })

  it('interpolates template variables in skill prompts', () => {
    const template = 'Reviewing topic {{topic}} with context: {{context}}'
    const result = interpolateSkillPrompt(template, {
      topic: 'FSRS-6 Spaced Repetition',
      context: 'Stability calculation',
    })
    expect(result).toBe(
      'Reviewing topic FSRS-6 Spaced Repetition with context: Stability calculation',
    )
  })

  it('executes grill-me simulation to surface ambiguities and establish clarity', () => {
    const result = executeSkillSimulation('grill-me', {
      topic: 'Vector Embedding Search Engine',
      context: 'Want to add cosine similarity search over card prompts and note paragraphs.',
    })

    expect(result.skillName).toBe('grill-me')
    expect(result.clarityIndex).toBeGreaterThan(60)
    expect(result.ambiguitiesResolved.length).toBeGreaterThanOrEqual(2)
    expect(result.assumptionsSurfaced.length).toBeGreaterThanOrEqual(1)
    expect(result.suggestedNextSkill).toBe('to-spec')
    expect(result.rawOutput).toContain('Socratic Grill-Me Report')
  })

  it('executes to-tickets simulation and outputs atomic actionable tickets', () => {
    const result = executeSkillSimulation('to-tickets', {
      topic: 'Pretesting Crucible',
      context: 'Specification for errorful generation potentiation.',
    })

    expect(result.skillName).toBe('to-tickets')
    expect(result.tickets).toBeDefined()
    expect(result.tickets!.length).toBeGreaterThanOrEqual(3)

    const [t0, t1, t2] = result.tickets!
    expect(t0!.priority).toBe('P0')
    expect(t0!.category).toBe('core')
    expect(t0!.testRecipe).toContain('npm test')

    expect(t1!.category).toBe('api')
    expect(t1!.filesAffected.some((f) => f.includes('hub/handlers-registry'))).toBe(true)

    expect(t2!.category).toBe('ui')
    expect(result.suggestedNextSkill).toBe('code-review')
  })

  it('executes deliberate-practice and generates active recall flashcards', () => {
    const result = executeSkillSimulation('deliberate-practice', {
      topic: 'Differential Calculus Chain Rule',
      context: 'Struggling with composition of trigonometric and logarithmic functions.',
    })

    expect(result.skillName).toBe('deliberate-practice')
    expect(result.generatedCards).toBeDefined()
    expect(result.generatedCards!.length).toBeGreaterThanOrEqual(2)
    expect(result.generatedCards![0]!.front).toContain('Differential Calculus')
    expect(result.generatedCards![0]!.tags).toContain('deliberate-practice')
  })
})
