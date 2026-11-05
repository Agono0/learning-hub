/**
 * /api/ai/transport — prompt transport ("bring your own AI", fully offline).
 *
 * GET  ?feature=<name>[&params]  → the AI envelope { v, feature, system,
 *        prompt, schema } for that feature plus its manual mode. Without a
 *        feature param: discovery — { provider, configured, features }.
 * POST { feature, result }       → the pasted reply validated with the same
 *        zod schema an in-process provider would satisfy.
 *
 * This is the non-AI path for every AI surface: the user copies the envelope
 * into ANY chatbot (or a human expert), pastes the reply back, and the app
 * validates it at the boundary. No provider is contacted by this route.
 */
import { z } from 'zod'
import { eq, gte } from 'drizzle-orm'
import { db, chatSessions, ideas, journalEntries, notes, sources } from '@learning-hub/db'
import {
  AI_FEATURES,
  brainwritePrompt,
  clozeGeneratorPrompt,
  coachPrompt,
  courseGeneratorPrompt,
  freetextRubricPrompt,
  getAIFeature,
  getManualMode,
  listAIFeatures,
  parseAIEnvelopeResult,
  type AIEnvelope,
  type AIFeatureDef,
} from '@learning-hub/core/ai'
import { dayKey } from '@learning-hub/core'
import { getAISettingsFromDb } from '@/lib/ai'
import { jsonError, readJson, tzOffsetFromQuery, withRoute } from '@/lib/api'

/** Prompt builders per feature. Query/body params only — DB lookups happen here. */
async function buildPrompt(
  feature: AIFeatureDef,
  params: URLSearchParams,
  tzOffset: number,
): Promise<string> {
  const text = (key: string): string => (params.get(key) ?? '').trim()

  switch (feature.name) {
    case 'tutor-grade': {
      let context = text('context')
      const contextId = Number(params.get('contextId') ?? 0)
      if (!context && contextId) {
        const [note] = await db.select().from(notes).where(eq(notes.id, contextId)).limit(1)
        if (note) context = `[${note.title}] ${note.content.slice(0, 2000)}`
      }
      return context
        ? `I'm studying this and I'm stuck. Context:\n"""\n${context}\n"""\n\nMy question or attempt:\n${text('attempt') || '(I will describe my attempt in my reply)'}`
        : `Topic I'm stuck on: ${text('topic') || text('attempt') || '(describe in your reply)'}\n\nMy best attempt so far:\n${text('attempt') || '(none yet — I will answer your first question honestly)'}`
    }
    case 'feynman-student':
      return `I want to teach you a concept, and you should interview me like a curious 12-year-old.\n\nConcept: ${text('concept') || '(named in my explanation)'}\n\nMy explanation so far:\n"""\n${text('explanation') || '(I will explain in my reply)'}\n"""`
    case 'feynman-grader': {
      const sessionId = Number(params.get('sessionId') ?? 0)
      if (!sessionId)
        throw new Error('sessionId query param required for the feynman-grader envelope')
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .limit(1)
      if (!session) throw new Error(`chat session ${sessionId} not found`)
      const transcript = ((session.messages as { role: string; content: string }[]) ?? [])
        .map((m) => `${m.role === 'user' ? 'Learner' : 'Student-questioner'}: ${m.content}`)
        .join('\n')
      return `Concept the learner was teaching: ${session.title ?? session.contextType ?? 'unknown'}\n\nTeach-back transcript:\n${transcript.slice(0, 16000)}`
    }
    case 'course-generator': {
      const pdfId = Number(params.get('pdfId') ?? 0)
      let pdfText: string | undefined
      if (pdfId) {
        const [src] = await db.select().from(sources).where(eq(sources.id, pdfId)).limit(1)
        if (!src) throw new Error(`source ${pdfId} not found`)
        pdfText = src.content
      }
      return courseGeneratorPrompt({
        topic: text('topic') || undefined,
        pdfText,
        depth: text('depth') || undefined,
      })
    }
    case 'cloze-generator': {
      const pdfId = Number(params.get('pdfId') ?? 0)
      let source = text('text')
      if (!source && pdfId) {
        const [src] = await db.select().from(sources).where(eq(sources.id, pdfId)).limit(1)
        if (!src) throw new Error(`source ${pdfId} not found`)
        source = src.content
      }
      if (!source)
        throw new Error('text (or pdfId) query param required for the cloze-generator envelope')
      return clozeGeneratorPrompt(source)
    }
    case 'coach': {
      const since = dayKey(new Date(Date.now() - 7 * 86_400_000), tzOffset)
      const week = db.select().from(journalEntries).where(gte(journalEntries.date, since)).all()
      const moods = week.map((e) => e.mood).filter((m): m is number => m != null)
      const metrics: Record<string, number | string | null> = {
        journalEntries: week.length,
        moodAvg: moods.length
          ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10
          : null,
        smallWinsLogged: week.filter((e) => e.smallWins?.trim()).length,
        gratitudeLogged: week.filter((e) => e.gratitude?.trim()).length,
        worryDumps: week.filter((e) => e.worryDump?.trim()).length,
      }
      return coachPrompt(metrics)
    }
    case 'council-optimist':
    case 'council-skeptic':
    case 'council-domain-expert':
    case 'council-devils-advocate': {
      const ideaId = Number(params.get('ideaId') ?? 0)
      if (!ideaId)
        throw new Error(
          `ideaId query param required for ${feature.name} (or copy the prompt with your idea inline)`,
        )
      const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
      if (!idea) throw new Error(`idea ${ideaId} not found`)
      return `Idea under review: "${idea.title}"\n${idea.content || '(no description yet)'}\n\nGive your persona's assessment of this idea.`
    }
    case 'brainwrite': {
      const userIdeas = text('ideas')
        .split(/\r?\n|\|/)
        .map((s) => s.trim())
        .filter(Boolean)
      return brainwritePrompt(text('topic') || '(topic in my reply)', userIdeas)
    }
    case 'freetext-rubric': {
      const rubric = text('rubric')
        .split(/\r?\n|\|\|/)
        .map((s) => s.trim())
        .filter(Boolean)
      return freetextRubricPrompt({
        prompt: text('question') || '(exercise prompt)',
        rubric: rubric.length > 0 ? rubric : ['Covers core mechanism accurately'],
        learnerAnswer: text('answer') || '(paste learner response)',
        modelAnswer: text('modelAnswer') || undefined,
      })
    }
    default:
      return text('prompt') || '(fill in your content in the reply)'
  }
}

/**
 * GET — without `feature`: discovery (provider, configured, feature list).
 * With `feature`: the envelope + manual mode for that feature.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const featureName = url.searchParams.get('feature')
  const settings = await getAISettingsFromDb()

  if (!featureName) {
    return Response.json({
      ok: true,
      provider: settings.provider,
      configured: settings.provider !== 'none',
      features: listAIFeatures().map((name) => ({
        name,
        title: AI_FEATURES[name]!.title,
        kind: AI_FEATURES[name]!.kind,
      })),
    })
  }

  const feature = getAIFeature(featureName)
  if (!feature) {
    return jsonError(
      400,
      `unknown feature "${featureName}" — valid: ${listAIFeatures().join(', ')}`,
    )
  }

  let prompt: string
  try {
    prompt = await buildPrompt(feature, url.searchParams, tzOffsetFromQuery(req))
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : String(e))
  }
  const envelope: AIEnvelope = {
    v: 1,
    feature: feature.name,
    system: feature.system,
    prompt,
    ...(feature.schemaDescription ? { schema: feature.schemaDescription } : {}),
  }
  return Response.json({
    ok: true,
    feature: feature.name,
    title: feature.title,
    kind: feature.kind,
    envelope,
    manual: getManualMode(feature.name),
    instructions:
      'Copy the envelope JSON into any chatbot (paste the system block as the system/first message, the prompt block as your message). Paste the raw reply below to validate it here.',
  })
}

const postSchema = z.object({
  feature: z.string().min(1, 'feature required'),
  /** The pasted reply — validate it against the feature's schema. */
  result: z.string().optional(),
  /** Feature params — build the envelope server-side (for payloads too big for a GET query string). */
  params: z.record(z.string(), z.string()).optional(),
})

/** POST — with `result`: validate a pasted reply; with `params` only: build the envelope (large payloads). */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postSchema)
  const feature = getAIFeature(body.feature)
  if (!feature) {
    return jsonError(
      400,
      `unknown feature "${body.feature}" — valid: ${listAIFeatures().join(', ')}`,
    )
  }

  // envelope construction for large payloads (mirrors GET ?feature=…&params)
  if (body.result === undefined) {
    const params = new URLSearchParams(body.params ?? {})
    let prompt: string
    try {
      prompt = await buildPrompt(feature, params, tzOffsetFromQuery(req))
    } catch (e) {
      return jsonError(400, e instanceof Error ? e.message : String(e))
    }
    const envelope: AIEnvelope = {
      v: 1,
      feature: feature.name,
      system: feature.system,
      prompt,
      ...(feature.schemaDescription ? { schema: feature.schemaDescription } : {}),
    }
    return Response.json({
      ok: true,
      feature: feature.name,
      title: feature.title,
      kind: feature.kind,
      envelope,
      manual: getManualMode(feature.name),
      instructions:
        'Copy the envelope JSON into any chatbot (paste the system block as the system/first message, the prompt block as your message). Paste the raw reply back here (or POST {feature, result}) to validate it.',
    })
  }

  if (feature.kind === 'text') {
    return Response.json({
      ok: true,
      kind: 'text',
      feature: feature.name,
      result: body.result.trim(),
    })
  }
  if (!feature.schema) {
    return jsonError(500, `feature "${feature.name}" is a JSON feature without a schema`)
  }
  try {
    const data = parseAIEnvelopeResult(feature.name, body.result, feature.schema)
    return Response.json({ ok: true, kind: 'json', feature: feature.name, data })
  } catch (e) {
    // the message is the feature here: the user is debugging their own pasted reply
    const message = e instanceof Error ? e.message : String(e)
    return Response.json(
      {
        ok: false,
        error: message.includes(feature.name) ? message : `${feature.name}: ${message}`,
      },
      { status: 400 },
    )
  }
})
