/**
 * POST /api/cards/from-text — sentence mining (M5): free text (a note, a
 * highlight, pasted material) → cloze card DRAFTS for preview-then-save.
 *
 * mode 'ai' uses the cloze-generator feature when a provider is configured
 * and falls back to the manual heuristic otherwise; mode 'manual' always uses
 * the heuristic (packages/core/src/sentence-mining.ts). Drafts are never
 * saved here — the client saves picked ones via POST /api/cards, so the
 * learner stays the editor.
 */
import { z } from 'zod'
import { clozeCandidates, type ClozeDraft } from '@learning-hub/core'
import { requireAI, AIUnavailableError, type AIClient } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

const fromTextSchema = z.object({
  text: z.string().min(1).max(50_000),
  mode: z.enum(['ai', 'manual']).optional().default('ai'),
})

const aiDraftsSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string().min(1),
      back: z.string().min(1),
    }),
  ),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, fromTextSchema)

  if (body.mode === 'ai') {
    let ai: AIClient
    try {
      ai = await requireAI()
    } catch (e) {
      if (e instanceof AIUnavailableError) {
        // graceful manual fallback — the heuristic is the manual mode
        return Response.json({
          ok: true,
          usedAI: false,
          needsSetup: true,
          drafts: clozeCandidates(body.text),
        })
      }
      return aiErrorResponse(e)
    }
    try {
      const out = await ai.generateJSON({
        schema: aiDraftsSchema,
        system:
          'You turn study material into minimal cloze cards. One deletion per card; the answer must appear VERBATIM in the sentence. Reply as JSON: {"cards": [{"front": "<sentence with ____>", "back": "<deleted answer>"}]}',
        prompt: body.text.slice(0, 8000),
      })
      const drafts: ClozeDraft[] = out.cards.slice(0, 10).map((c) => ({
        sentence: c.front,
        answer: c.back,
        text: c.front,
      }))
      return Response.json({ ok: true, usedAI: true, drafts })
    } catch (e) {
      return aiErrorResponse(e)
    }
  }

  return Response.json({ ok: true, usedAI: false, drafts: clozeCandidates(body.text) })
})
