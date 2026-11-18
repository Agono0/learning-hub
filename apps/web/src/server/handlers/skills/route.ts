/**
 * @file apps/web/src/server/handlers/skills/route.ts
 * @description Runtime-neutral API handler for Matt Pocock Agent Skills & Autonomous Engineering.
 *
 * Implements:
 * - GET /api/skills — Lists all available canonical skills and metadata.
 * - POST /api/skills — Executes skill simulation, AGENTS.md rule audits, or SKILL.md rendering.
 *
 * Adheres strictly to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  CANONICAL_SKILLS,
  auditCodeAgainstAgentsRules,
  executeSkillSimulation,
  renderSkillMarkdown,
} from '@learning-hub/core/skills'
import { readJson, withRoute } from '@/lib/api'

const executeSkillSchema = z.object({
  action: z.enum(['execute', 'audit', 'render']).default('execute'),
  skillId: z.string().default('grill-me'),
  topic: z.string().min(1),
  context: z.string().optional().default(''),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
})

export async function GET() {
  const skillsList = Object.values(CANONICAL_SKILLS)
  return Response.json({
    ok: true,
    total: skillsList.length,
    skills: skillsList,
  })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, executeSkillSchema)

  if (body.action === 'render') {
    const skill = CANONICAL_SKILLS[body.skillId] ?? CANONICAL_SKILLS['grill-me']!
    const markdown = renderSkillMarkdown(skill)
    return Response.json({
      ok: true,
      action: 'render',
      skillId: skill.meta.name,
      markdown,
    })
  }

  if (body.action === 'audit') {
    const filepath = String(body.parameters.filepath || 'apps/web/app/example/page.tsx')
    const violations = auditCodeAgainstAgentsRules(body.context, filepath)
    return Response.json({
      ok: true,
      action: 'audit',
      filepath,
      violationsCount: violations.length,
      violations,
    })
  }

  // Default: action === 'execute'
  const result = executeSkillSimulation(body.skillId, {
    topic: body.topic,
    context: body.context,
    parameters: body.parameters,
  })

  return Response.json({
    ok: true,
    action: 'execute',
    result,
  })
})
