/**
 * MCP exam readiness tools. Read-only, and the same pipeline as
 * GET /api/readiness and the CLI. Every result carries `assumptions`: the
 * figures are model estimates, not validated exam scores, and the review
 * scenario is hypothetical.
 */
import { z } from 'zod'
import { listReadinessExams, runReadiness } from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const readinessTools: RegisteredTool[] = [
  tool(
    'readiness_exams',
    'List saved exam dates that readiness_report can use (read-only).',
    {},
    () => json({ ok: true, exams: listReadinessExams() }),
  ),
  tool(
    'readiness_report',
    "Estimate how much of the learner's card memory the FSRS model expects to be recalled on an exam date, with no further review and under a hypothetical review plan, plus which cards a review budget helps most. Read-only. Results are model estimates, not validated exam scores; read `assumptions` before interpreting them.",
    {
      examId: z.number().int().positive().optional(),
      date: z.string().max(40).optional(),
      title: z.string().trim().min(1).max(120).optional(),
      plan: z.enum(['none', 'on-schedule', 'capacity']).default('on-schedule'),
      perDay: z.number().int().min(0).max(1000).default(20),
      target: z.number().min(0.5).max(0.99).default(0.85),
      deckIds: z.array(z.number().int().positive()).max(200).optional(),
      budget: z.number().int().min(0).max(5000).default(20),
    },
    async (args) => {
      const run = await runReadiness(args, { maxGainRows: 50 })
      if (!run.ok) return json({ ok: false, error: run.error })
      return json({ ok: true, ...run.value })
    },
  ),
]
