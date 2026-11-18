/**
 * @file apps/web/src/server/handlers/practice/successive-relearning/route.ts
 * @description Runtime-neutral API handler for Successive Relearning & Ebbinghaus Savings Studio.
 *
 * Implements:
 * - GET /api/practice/successive-relearning — Fetches or initializes a relearning plan.
 * - POST /api/practice/successive-relearning — Processes trials, advances waves, generates audits.
 *
 * Adheres strictly to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  CALIBRATED_SUCCESSIVE_SUITES,
  advancePlanToNextSession,
  computeQueueState,
  createRelearningItem,
  generateRelearningAudit,
  recordItemTrial,
  relearningPlanSchema,
  synthesizeFSRSDeckCards,
  trialInputSchema,
} from '@learning-hub/core/successive-relearning'
import { readJson, withRoute } from '@/lib/api'

const requestActionSchema = z.object({
  action: z
    .enum(['record_trial', 'advance_session', 'audit', 'synthesize_deck'])
    .default('record_trial'),
  plan: relearningPlanSchema,
  trial: trialInputSchema.optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const suiteId = url.searchParams.get('suiteId') || 'distributed_systems'

  const suite =
    CALIBRATED_SUCCESSIVE_SUITES[suiteId] ?? CALIBRATED_SUCCESSIVE_SUITES.distributed_systems!

  const nowIso = new Date().toISOString()
  const plan = relearningPlanSchema.parse({
    id: `sr-plan-${suite.id}`,
    title: suite.title,
    domain: suite.domain,
    targetCriterion: 2,
    currentSessionIndex: 0,
    scheduleDays: [1, 3, 7, 16, 35],
    items: suite.items.map((i) =>
      createRelearningItem({
        id: i.id,
        prompt: i.prompt,
        targetAnswer: i.targetAnswer,
        conceptCluster: i.conceptCluster,
        mnemonicCue: i.mnemonicCue,
        acquisitionCriterion: 2,
      }),
    ),
    sessionHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  })

  const queue = computeQueueState(plan)
  const audit = generateRelearningAudit(plan)

  return Response.json({
    ok: true,
    plan,
    queue,
    audit,
  })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, requestActionSchema)
  const nowIso = new Date().toISOString()

  if (body.action === 'advance_session') {
    const { updatedPlan, sessionSummary } = advancePlanToNextSession(body.plan, nowIso)
    const queue = computeQueueState(updatedPlan)
    const audit = generateRelearningAudit(updatedPlan, nowIso)
    return Response.json({
      ok: true,
      action: 'advance_session',
      plan: updatedPlan,
      sessionSummary,
      queue,
      audit,
    })
  }

  if (body.action === 'audit') {
    const audit = generateRelearningAudit(body.plan, nowIso)
    return Response.json({
      ok: true,
      action: 'audit',
      audit,
    })
  }

  if (body.action === 'synthesize_deck') {
    const cards = synthesizeFSRSDeckCards(body.plan)
    return Response.json({
      ok: true,
      action: 'synthesize_deck',
      totalCards: cards.length,
      cards,
    })
  }

  // Default: record_trial
  if (!body.trial) {
    return Response.json(
      { ok: false, error: 'Trial payload required for record_trial action' },
      { status: 400 },
    )
  }

  const targetItem = body.plan.items.find((i) => i.id === body.trial!.itemId)
  if (!targetItem) {
    return Response.json(
      { ok: false, error: `Item with id ${body.trial.itemId} not found in plan` },
      { status: 404 },
    )
  }

  const { updatedItem, justMetCriterion } = recordItemTrial(targetItem, body.trial, nowIso)
  const nextItems = body.plan.items.map((it) => (it.id === targetItem.id ? updatedItem : it))
  const nextPlan = {
    ...body.plan,
    items: nextItems,
    updatedAt: nowIso,
  }
  const queue = computeQueueState(nextPlan)

  return Response.json({
    ok: true,
    action: 'record_trial',
    updatedItem,
    justMetCriterion,
    queue,
    plan: nextPlan,
  })
})
