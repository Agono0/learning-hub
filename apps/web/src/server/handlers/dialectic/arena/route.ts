/**
 * /api/dialectic/arena — Multi-agent dialectical courtroom debate & fallacy grading.
 */
import { z } from 'zod'
import { evaluateFallacyFlag, FALLACY_DEFINITIONS, logicalFallacySchema } from '@learning-hub/core'
import { getDialecticDebate, listDialecticDebates, recordDialecticDebate } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const debateActionSchema = z.object({
  action: z.enum(['create_debate', 'evaluate_fallacy', 'submit_verdict']),
  id: z.number().int().positive().optional(),
  topic: z.string().optional(),
  thesisAgentRole: z.string().optional(),
  antithesisAgentRole: z.string().optional(),
  transcript: z.array(z.any()).optional(),
  argumentText: z.string().optional(),
  fallacy: logicalFallacySchema.optional(),
  plantedFallacies: z.array(logicalFallacySchema).optional(),
  verdict: z.string().optional(),
  score: z.number().optional(),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ? Number(url.searchParams.get('id')) : undefined

  if (id) {
    const debate = getDialecticDebate(id)
    if (!debate) {
      return Response.json({ ok: false, error: 'Debate not found' }, { status: 404 })
    }
    return Response.json({ ok: true, debate, fallacyCatalog: FALLACY_DEFINITIONS })
  }

  const debates = listDialecticDebates(20)
  return Response.json({
    ok: true,
    debates,
    fallacyCatalog: FALLACY_DEFINITIONS,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, debateActionSchema)

  if (body.action === 'evaluate_fallacy') {
    if (!body.fallacy || !body.argumentText) {
      return Response.json(
        { ok: false, error: 'fallacy and argumentText required' },
        { status: 400 },
      )
    }
    const evalResult = evaluateFallacyFlag(
      body.argumentText,
      body.fallacy,
      body.plantedFallacies ?? [],
    )
    return Response.json({ ok: true, ...evalResult })
  }

  if (body.action === 'create_debate') {
    const debate = recordDialecticDebate({
      topic: body.topic ?? 'General Dialectic',
      thesisAgentRole: body.thesisAgentRole ?? 'Thesis Advocate',
      antithesisAgentRole: body.antithesisAgentRole ?? 'Antithesis Critic',
      transcript: body.transcript ?? [],
      learnerVerdict: body.verdict,
      learnerScore: body.score ?? 0,
    })
    return Response.json({ ok: true, debate })
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 })
})
