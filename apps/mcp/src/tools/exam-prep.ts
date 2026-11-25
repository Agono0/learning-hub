/**
 * MCP exam prep tool. Read-only, and the same pipeline as GET /api/exam-prep
 * and the CLI. The result carries `plan.assumptions` and a `note`: the figures
 * are model estimates, the schedule is a greedy heuristic, and nothing is
 * scheduled or reviewed for the learner.
 */
import { z } from 'zod'
import { runExamPrep } from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const examPrepTools: RegisteredTool[] = [
  tool(
    'exam_prep_plan',
    'Suggest a day-by-day review schedule toward an exam date from the FSRS model, with the no-review baseline kept separate from the scenario. Read-only: it never schedules or reviews anything. Results are model estimates under assumptions and the schedule is a greedy heuristic; read `plan.assumptions` before interpreting them.',
    {
      examId: z.number().int().positive().optional(),
      date: z.string().max(40).optional(),
      title: z.string().trim().min(1).max(120).optional(),
      target: z.number().min(0.5).max(0.99).default(0.85),
      perDay: z.number().int().min(0).max(100).default(30),
      minGain: z.number().min(0).max(0.5).default(0.01),
      maxReviewsPerCard: z.number().int().min(1).max(10).default(3),
      restWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      deckIds: z.array(z.number().int().positive()).max(200).optional(),
    },
    async (args) => {
      const run = await runExamPrep(args)
      if (!run.ok) return json({ ok: false, error: run.error })
      return json({ ok: true, ...run.value })
    },
  ),
]
