/**
 * Goals MCP tools — WOOP goal creation and listing through the shared goals
 * repository (packages/db repos/goals).
 */
import { z } from 'zod'
import { createGoal, listGoals } from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const goalTools: RegisteredTool[] = [
  tool(
    'goal_woop',
    'Create a WOOP goal: Wish, Outcome, Obstacle, if-then Plan.',
    {
      wish: z.string().min(1),
      outcome: z.string().optional(),
      obstacle: z.string().optional(),
      ifThenPlan: z.string().optional().describe('If <obstacle>, then I will <action>'),
    },
    ({ wish, outcome, obstacle, ifThenPlan }) => {
      const goal = createGoal({ wish, outcome, obstacle, ifThenPlan })
      return json({ ok: true, goal })
    },
  ),
  tool('goal_list', 'List goals with status and progress.', {}, () => {
    const rows = listGoals({ limit: 50 })
    return json({ count: rows.length, goals: rows })
  }),
]
