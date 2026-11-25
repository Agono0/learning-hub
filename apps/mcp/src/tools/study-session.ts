/**
 * MCP study session tool. Read-only, and the same pipeline as
 * GET /api/study-session/preview and the CLI. It picks at most 100 cards and
 * returns the review link for exactly that list. It never schedules or
 * reviews anything, so no answer is simulated into history.
 */
import { z } from 'zod'
import { runStudySession } from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const studySessionTools: RegisteredTool[] = [
  tool(
    'study_session_preview',
    'Pick a bounded set of cards (at most 100) by deck, tags, FSRS state, lapses, due window and estimated recall, with the review link for exactly that list. Read-only: it never schedules or reviews anything. Recall is a model estimate as of the response date; read `assumptions`, and `funnel` shows which filter emptied a result.',
    {
      deckIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
      tags: z.array(z.string().trim().min(1).max(60)).min(1).max(10).optional(),
      states: z.array(z.number().int().min(0).max(3)).min(1).max(4).optional(),
      minLapses: z.number().int().min(0).max(1000).optional(),
      maxLapses: z.number().int().min(0).max(1000).optional(),
      recallBelow: z.number().min(0.01).max(0.99).optional(),
      dueByDays: z.number().int().min(0).max(365).optional(),
      sort: z.enum(['most-overdue', 'lowest-recall', 'most-lapses', 'newest']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => {
      const run = await runStudySession(args)
      if (!run.ok) return json({ ok: false, error: run.error })
      return json({ ok: true, ...run.value })
    },
  ),
]
