/**
 * Learning HUB — AI media generation.
 * NotebookLM-style artifacts: a two-host podcast dialogue from a lesson
 * summary, and a FAQ/briefing study guide from any source.
 * Uses the AIClient from ai.ts; degrades gracefully when AI is unconfigured.
 */
import { z } from 'zod'
import type { AIGenerationResult } from './types'
import { getActiveAIClientFromDb, type AIClient } from './ai'

// ─── Podcast (two-host dialogue) ────────────────────────────────────────────

export const podcastScriptSchema = z.object({
  title: z.string().min(1),
  hosts: z.tuple([z.string(), z.string()]),
  segments: z
    .array(
      z.object({
        host: z.number().int().min(0).max(1),
        line: z.string().min(1),
      }),
    )
    .min(4),
})

/** Parsed two-host podcast script (see {@link podcastScriptSchema}). */
export type PodcastScript = z.infer<typeof podcastScriptSchema>

/** System prompt: two-host podcast dialogue from a lesson summary. */
export const PODCAST_SCRIPT_SYSTEM = `You write a two-host podcast script that teaches the given lesson summary. Host 1 is the enthusiastic guide, Host 2 is the curious questioner who asks exactly what a struggling learner would ask.

Rules:
1. 8-16 exchanges, alternating hosts by turn (host: 0 then 1 then 0 …).
2. Walk through the material in its logical order; Host 2 must ask at least one "why does that work?" and one "what's a concrete example?" question.
3. Conversational, spoken-word register — contractions, short sentences. No stage directions, no sound effects.
4. Stay faithful to the summary: no invented facts beyond common-sense connective tissue.
5. End with a one-line takeaway from Host 1.
Return ONLY JSON: { "title", "hosts": [nameA, nameB], "segments": [{ "host": 0|1, "line" }] }.`

export async function podcastScript(
  lessonSummary: string,
  client?: AIClient,
): Promise<AIGenerationResult<PodcastScript>> {
  const ai = client ?? (await getActiveAIClientFromDb())
  if (!ai) {
    return { ok: false, error: 'Configure AI in Settings to generate a podcast script.' }
  }
  try {
    const data = await ai.generateJSON({
      schema: podcastScriptSchema,
      system: PODCAST_SCRIPT_SYSTEM,
      prompt: `Lesson summary:\n"""\n${lessonSummary.slice(0, 12000)}\n"""\n\nWrite the two-host podcast script.`,
    })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─── Study guide (FAQ + briefing) ───────────────────────────────────────────

export const studyGuideSchema = z.object({
  title: z.string().min(1),
  briefing: z.string().min(1),
  faq: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).min(1),
})

/** Parsed study guide (see {@link studyGuideSchema}). */
export type StudyGuide = z.infer<typeof studyGuideSchema>

/** System prompt: briefing + grounded FAQ study guide from source material. */
export const STUDY_GUIDE_SYSTEM = `You produce a study guide from source material: a tight briefing (what this material is about and its 3-5 key points, in order of importance) followed by the questions a diligent learner would actually ask about it, each with a precise, grounded answer.

Rules:
1. 5-8 FAQ entries; answers 1-3 sentences, strictly grounded in the source (no invention).
2. Briefing under 200 words, plain language.
3. Prefer "why/how" questions over trivia.
Return ONLY JSON: { "title", "briefing", "faq": [{ "q", "a" }] }.`

export async function studyGuide(
  source: string,
  client?: AIClient,
): Promise<AIGenerationResult<StudyGuide>> {
  const ai = client ?? (await getActiveAIClientFromDb())
  if (!ai) {
    return { ok: false, error: 'Configure AI in Settings to generate a study guide.' }
  }
  try {
    const data = await ai.generateJSON({
      schema: studyGuideSchema,
      system: STUDY_GUIDE_SYSTEM,
      prompt: `Source material:\n"""\n${source.slice(0, 16000)}\n"""\n\nProduce the study guide.`,
    })
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
