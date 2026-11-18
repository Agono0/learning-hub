/**
 * Review MCP tools — the canonical grading path (executeReview) and the
 * shared review statistics. All FSRS/XP/mastery writes go through
 * packages/db review-service (Hard Rule #7); stats come from repos/stats.
 */
import { z } from 'zod'
import {
  CardNotFoundError,
  executeReview,
  getDueCardCount,
  getTrueRetention,
} from '@learning-hub/db'
import { type Grade } from '@learning-hub/core'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const reviewTools: RegisteredTool[] = [
  tool(
    'review_log',
    'Log a review for a card: runs the canonical executeReview engine (FSRS-6 scheduling + revlog + XP + streak + Elo/BKT mastery) atomically.',
    {
      cardId: z.number().int(),
      rating: z.number().int().min(1).max(4).describe('1 Again, 2 Hard, 3 Good, 4 Easy'),
      confidence: z.number().int().min(0).max(1).default(1).describe('0 unsure, 1 sure'),
      timeMs: z.number().int().min(0).default(5000),
    },
    async ({ cardId, rating, confidence, timeMs }) => {
      const now = new Date()
      try {
        const result = await executeReview({
          cardId,
          grade: rating as Grade,
          confidence: confidence as 0 | 1,
          timeMs,
        })
        const intervalDays = Math.max(
          0,
          Math.round((Date.parse(result.card.due) - now.getTime()) / 86_400_000),
        )
        return json({
          ok: true,
          cardId,
          rating,
          due: result.card.due,
          intervalDays,
          xpEarned: result.xpEarned,
          streak: { current: result.streak.current, best: result.streak.best },
        })
      } catch (err) {
        if (err instanceof CardNotFoundError) {
          return json({ ok: false, error: `Card ${cardId} not found` })
        }
        throw err
      }
    },
  ),
  tool(
    'review_stats',
    'Review statistics: true retention (from v_true_retention) and the current due count.',
    {},
    () => {
      // Shared stats repo — one definition for web, CLI and the headless server.
      const retention = getTrueRetention()
      return json({
        trueRetention: retention,
        dueCount: getDueCardCount(),
      })
    },
  ),
]
