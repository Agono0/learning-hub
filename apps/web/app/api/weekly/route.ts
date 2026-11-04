/**
 * GET /api/weekly?tzOffset=N — the weekly review report.
 *
 * { metrics, weakestCards, forecast, suggestions } — metrics from core's pure
 * math over real rows, suggestions AI-optional:
 *  - a configured provider → 3 evidence-based suggestions via COACH_SYSTEM +
 *    coachPrompt, validated with the coach zod schema;
 *  - 'none' (the default) → a deterministic rule-based summary labeled as
 *    manual mode PLUS the coach prompt-transport envelope, so the user can
 *    paste it into any chatbot and POST the reply to /api/ai/transport.
 * The whole response is zod-validated at the boundary before returning.
 */
import { COACH_SYSTEM, AI_FEATURES, buildAIEnvelope, coachPrompt, coachSuggestionsSchema, type AIEnvelope } from '@learning-hub/core/ai'
import {
  ruleBasedSuggestions,
  weeklyReportResponseSchema,
  type WeeklySuggestion,
} from '@learning-hub/core'
import { computeWeeklyReport } from '@/lib/weekly'
import { getActiveAIClientFromDb } from '@/lib/ai'
import { tzOffsetFromQuery, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

/** Provider errors leak base URLs/model ids — the client only gets a generic message. */
function sanitizeAIError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('not configured') || message.includes('Settings')) {
    return 'AI is not configured — pick a provider and model in Settings.'
  }
  console.error('[api/weekly] AI provider failure:', err)
  return 'AI request failed — showing the deterministic manual summary instead.'
}

/** GET /api/weekly?tzOffset=N — the zod-validated weekly report. */
export const GET = withRoute(async (req: Request) => {
  const offsetMinutes = tzOffsetFromQuery(req)
  const metrics = await computeWeeklyReport(offsetMinutes)

  const prompt = coachPrompt(metrics.coachMetrics)
  let suggestions: WeeklySuggestion[]
  let mode: 'ai' | 'manual' = 'manual'
  let error: string | undefined
  try {
    const client = await getActiveAIClientFromDb()
    if (client) {
      const reply = await client.generateJSON({
        schema: coachSuggestionsSchema,
        system: COACH_SYSTEM,
        prompt,
      })
      suggestions = reply.suggestions
      mode = 'ai'
    } else {
      suggestions = ruleBasedSuggestions(metrics)
    }
  } catch (err) {
    suggestions = ruleBasedSuggestions(metrics)
    error = sanitizeAIError(err)
  }

  // Prompt-transport envelope whenever the suggestions are rule-based (always
  // in the default 'none' case): paste into any AI, POST the reply to /api/ai/transport.
  const envelope: AIEnvelope | undefined =
    mode === 'manual'
      ? buildAIEnvelope('coach', {
          system: COACH_SYSTEM,
          prompt,
          schemaDescription: AI_FEATURES['coach']?.schemaDescription,
        })
      : undefined

  const response = weeklyReportResponseSchema.parse({
    metrics,
    weakestCards: metrics.weakestCards,
    forecast: metrics.forecast,
    suggestions: {
      mode,
      suggestions,
      ...(envelope ? { envelope } : {}),
      ...(error ? { error } : {}),
    },
  })
  return Response.json(response)
})
