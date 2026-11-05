/**
 * Learning HUB — AI prompt transport ("bring your own AI", works fully offline).
 *
 * An {@link AIEnvelope} is the complete, self-contained description of one AI
 * call: version, feature, system prompt, user prompt and the JSON schema the
 * reply must match. The app serves envelopes at GET /api/ai/transport so the
 * user can copy one into ANY chatbot (or a human expert), paste the reply
 * back, and the app validates it against the same zod schema an in-process
 * provider would satisfy. No provider, no network call from the app itself —
 * the user is the transport.
 */
import { z, type ZodType } from 'zod'
import { generatedCourseSchema } from '../curriculum'
import { extractJson } from './json'
import {
  BRAINWRITE_SYSTEM,
  CLOZE_GENERATOR_SYSTEM,
  COACH_SYSTEM,
  COURSE_GENERATOR_SYSTEM,
  COUNCIL_PERSONAS,
  FEYNMAN_GRADER,
  FEYNMAN_STUDENT,
  SOCRATIC_SYSTEM,
} from './prompts'

/** Current envelope version — bump when the wire format changes. */
export const ENVELOPE_VERSION = 1

/** The self-contained prompt packet served by GET /api/ai/transport. */
export interface AIEnvelope {
  v: typeof ENVELOPE_VERSION
  feature: string
  /** System prompt for the feature (the research guardrails live here). */
  system: string
  /** User prompt with the concrete content for this call. */
  prompt: string
  /** Human/JSON-schema description of the expected reply shape (JSON features only). */
  schema?: string
}

/** Build the JSON envelope for one AI feature call. */
export function buildAIEnvelope(
  feature: string,
  opts: { system: string; prompt: string; schemaDescription?: string },
): AIEnvelope {
  if (!feature?.trim()) throw new Error('buildAIEnvelope: feature name is required')
  const envelope: AIEnvelope = {
    v: ENVELOPE_VERSION,
    feature,
    system: opts.system,
    prompt: opts.prompt,
  }
  if (opts.schemaDescription) envelope.schema = opts.schemaDescription
  return envelope
}

/** Re-exported for compatibility — implementation lives in ./json (cycle-free). */
export { extractJson } from './json'

/**
 * Parse + validate a pasted/returned result for a JSON feature: strips fences,
 * extracts the JSON and validates it with the given zod schema. Throws a
 * descriptive error naming the feature and every schema violation.
 */
export function parseAIEnvelopeResult<T>(feature: string, raw: string, schema: ZodType<T>): T {
  const json = extractJson(raw)
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new Error(`Result for "${feature}" does not match the expected schema — ${issues}`)
  }
  return parsed.data
}

// ─── Feature registry ───────────────────────────────────────────────────────

/** Shared result schemas for the JSON features (validated at the transport boundary). */

/** Feynman teach-back grade (same shape the /api/ai/feynman/grade route persists). */
export const feynmanGradeSchema = z.object({
  coverage: z.number().int().min(0).max(100),
  misconceptions: z.array(z.string()),
  gaps: z.array(z.string()),
  suggestedCards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })),
})

/** Brainwrite result: a list of new idea sentences (merged against the user's own). */
export const brainwriteIdeasSchema = z.object({ ideas: z.array(z.string().min(1)).min(1) })

/** Cloze generation result (see CLOZE_GENERATOR_SYSTEM — answers must be verbatim substrings). */
export const clozeCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        text: z.string().min(3),
        answers: z.array(z.string().min(1)).min(1),
        hint: z.string().optional(),
      }),
    )
    .min(1),
})

/** Coach weekly-review result: exactly 3 evidence-based suggestions. */
export const coachSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().min(1),
        evidence: z.string().min(1),
        action: z.string().min(1),
      }),
    )
    .length(3),
})

const councilSystem = (key: 'optimist' | 'skeptic' | 'domain-expert' | 'devils-advocate'): string =>
  COUNCIL_PERSONAS.find((p) => p.key === key)!.system

/**
 * Feature metadata backing GET/POST /api/ai/transport. Names are the public
 * contract (`?feature=<name>`); `schema` is present only for JSON features —
 * text features return the reply as a plain string.
 */
export interface AIFeatureDef {
  name: string
  title: string
  kind: 'json' | 'text'
  system: string
  schemaDescription?: string
  schema?: ZodType<unknown>
}

/** The transport feature set (feature name → definition). */
export const AI_FEATURES: Record<string, AIFeatureDef> = {
  'tutor-grade': {
    name: 'tutor-grade',
    title: 'Socratic tutor',
    kind: 'text',
    system: SOCRATIC_SYSTEM,
  },
  'feynman-student': {
    name: 'feynman-student',
    title: 'Feynman student questioner',
    kind: 'text',
    system: FEYNMAN_STUDENT,
  },
  'feynman-grader': {
    name: 'feynman-grader',
    title: 'Feynman teach-back grader',
    kind: 'json',
    system: FEYNMAN_GRADER,
    schemaDescription:
      '{"coverage": integer 0-100, "misconceptions": string[], "gaps": string[], "suggestedCards": [{"front": string, "back": string}]}',
    schema: feynmanGradeSchema as ZodType<unknown>,
  },
  'course-generator': {
    name: 'course-generator',
    title: 'Course generator',
    kind: 'json',
    system: COURSE_GENERATOR_SYSTEM,
    schemaDescription:
      '{"title", "description", "emoji", "units": [{"title", "lessons": [{"title", "objective", "bloomVerb", "type", "cards": [...]}]}], "skills": [{"name", "requires": [...]}]}',
    schema: generatedCourseSchema as ZodType<unknown>,
  },
  'cloze-generator': {
    name: 'cloze-generator',
    title: 'Cloze card generator',
    kind: 'json',
    system: CLOZE_GENERATOR_SYSTEM,
    schemaDescription:
      '{"cards": [{"text": string with one ____, "answers": [string], "hint": string?}]}',
    schema: clozeCardsSchema as ZodType<unknown>,
  },
  coach: {
    name: 'coach',
    title: 'Weekly coach review',
    kind: 'json',
    system: COACH_SYSTEM,
    schemaDescription:
      '{"suggestions": [{"title": string, "evidence": string, "action": string}] (exactly 3)}',
    schema: coachSuggestionsSchema as ZodType<unknown>,
  },
  'council-optimist': {
    name: 'council-optimist',
    title: 'Idea council — the Optimist',
    kind: 'text',
    system: councilSystem('optimist'),
  },
  'council-skeptic': {
    name: 'council-skeptic',
    title: 'Idea council — the Skeptic',
    kind: 'text',
    system: councilSystem('skeptic'),
  },
  'council-domain-expert': {
    name: 'council-domain-expert',
    title: 'Idea council — the Domain Expert',
    kind: 'text',
    system: councilSystem('domain-expert'),
  },
  'council-devils-advocate': {
    name: 'council-devils-advocate',
    title: "Idea council — the Devil's Advocate",
    kind: 'text',
    system: councilSystem('devils-advocate'),
  },
  brainwrite: {
    name: 'brainwrite',
    title: 'Brainwriting 6-3-5 partner',
    kind: 'json',
    system: BRAINWRITE_SYSTEM,
    schemaDescription: '{"ideas": [string, string, string, string, string, string]}',
    schema: brainwriteIdeasSchema as ZodType<unknown>,
  },
}

/** Look up a transport feature def, or null for an unknown feature name. */
export function getAIFeature(name: string): AIFeatureDef | null {
  return AI_FEATURES[name] ?? null
}

/** All feature names, for discovery/error messages. */
export function listAIFeatures(): string[] {
  return Object.keys(AI_FEATURES)
}
