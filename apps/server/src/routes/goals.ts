/**
 * Learning HUB headless server — GOALS routes (WOOP goals). The same repo (createGoal, listGoals)
 * and the same validation (validateWoopGoal: wish present, if-then shape) as the web handler
 * (handlers/goals) and the MCP goal_woop / goal_list tools. Validation failures use the web body
 * `{ error, errors[] }` with 400; creation answers `{ ok: true, goal }` like the other server routes.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_IF_THEN_CHARS, validateWoopGoal } from '@learning-hub/core'
import { createGoal, listGoals } from '@learning-hub/db'
import { readJson, sendJson } from '../http'
import type { Route } from './shared'

const createGoalSchema = z.object({
  wish: z.string().optional(),
  outcome: z.string().nullable().optional(),
  obstacle: z.string().nullable().optional(),
  ifThenPlan: z.string().nullable().optional(),
  // structured implementation intention (Gollwitzer & Sheeran 2006)
  ifCondition: z.string().max(MAX_IF_THEN_CHARS).nullable().optional(),
  thenAction: z.string().max(MAX_IF_THEN_CHARS).nullable().optional(),
  dueDate: z.string().nullable().optional(),
})

const asString = (v?: string | null): string | null =>
  v !== undefined && v !== null && v.trim() !== '' ? v : null

/** GET /goals — WOOP goals, newest first. */
async function getGoals(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, { goals: listGoals() })
}

/** POST /goals {wish, outcome?, obstacle?, ifThenPlan?, ifCondition?, thenAction?, dueDate?} */
async function postGoal(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, createGoalSchema)
  const wish = body.wish ?? ''
  const goal = {
    wish,
    outcome: asString(body.outcome),
    obstacle: asString(body.obstacle),
    ifThenPlan: asString(body.ifThenPlan),
    ifCondition: asString(body.ifCondition),
    thenAction: asString(body.thenAction),
    dueDate: asString(body.dueDate),
  }
  const validation = validateWoopGoal(goal)
  if (!validation.ok) {
    return sendJson(res, 400, { error: validation.errors.join(' '), errors: validation.errors })
  }
  sendJson(res, 200, { ok: true, goal: createGoal({ ...goal, wish: wish.trim() }) })
}

export const goalsRoutes: Route[] = [
  { method: 'GET', path: '/goals', summary: 'list WOOP goals (listGoals)', handler: getGoals },
  { method: 'POST', path: '/goals', summary: 'create a WOOP goal (createGoal)', handler: postGoal },
]
