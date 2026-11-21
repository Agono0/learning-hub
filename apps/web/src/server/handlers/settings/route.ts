/**
 * /api/settings — GET/PUT user settings (AI provider/model/baseUrl/apiKey/
 * headers, desiredRetention, sessionMinutes, theme); POST { action: 'test',
 * settings? } pings the model with a tiny generateText. The registered
 * providers come from @learning-hub/ai-adapters (imported via '@/lib/ai'),
 * so 'custom-endpoint' works end-to-end including the Test button.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { learnerProfileSchema } from '@learning-hub/core'
import { cards, courses, db, userSettings } from '@learning-hub/db'
import { fsrsWeightsSchema, getAIClient, type AIProvider } from '@learning-hub/core'
import '@/lib/ai'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** Providers accepted by the settings boundary — the full registry set. */
const aiProviderSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'openai-compatible',
  'ollama',
  'custom-endpoint',
  'none',
])

const putSettingsSchema = z.object({
  aiProvider: aiProviderSchema.optional(),
  aiModel: z.string().max(200).nullable().optional(),
  aiBaseUrl: z.string().max(2000).nullable().optional(),
  aiApiKey: z.string().max(500).nullable().optional(),
  /** JSON object string of extra HTTP headers (custom-endpoint); validated + stored canonically. */
  aiHeaders: z.string().max(4000).nullable().optional(),
  desiredRetention: z.number().optional(), // zod rejects NaN/Infinity → finite by construction
  fsrsWeights: fsrsWeightsSchema.nullable().optional(),
  sessionMinutes: z.number().optional(),
  theme: z.enum(['dark', 'light', 'system', 'e-ink']).optional(),
  /** Tactile feedback (grading, session boundaries) — sensory features are opt-out. */
  hapticsEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
  sidebarCollapsedGroups: z.array(z.string().max(80)).max(20).nullable().optional(),
  remindersEnabled: z.boolean().optional(),
  remindersQuietStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  remindersQuietEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  remindersDailyCap: z.number().int().min(1).max(10).optional(),
  remindersKinds: z.array(z.string()).optional(),
  /** Learner profile from onboarding (packages/core/src/learner-profile); null clears it. */
  learnerProfile: learnerProfileSchema.nullable().optional(),
})

const testSettingsSchema = z.object({
  action: z.literal('test'),
  settings: z
    .object({
      aiProvider: aiProviderSchema,
      aiModel: z.string(),
      aiBaseUrl: z.string().optional(),
      aiApiKey: z.string().optional(),
      aiHeaders: z.string().optional(),
    })
    .optional(),
})

function maskKey(key: string | null): string | null {
  if (!key) return null
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

/**
 * Validate a headers JSON string → canonical compact JSON; throws when it is
 * not an object of string values (the user is editing it right now — a clear
 * message beats silent corruption).
 */
function canonicalHeaders(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError(400, 'Headers must be a JSON object, e.g. {"Authorization": "Bearer sk-…"}')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'Headers must be a JSON object, e.g. {"Authorization": "Bearer sk-…"}')
  }
  const entries = Object.entries(parsed as Record<string, unknown>)
  for (const [k, v] of entries) {
    if (typeof v !== 'string') throw new ApiError(400, `Header "${k}" must map to a string value`)
  }
  return JSON.stringify(Object.fromEntries(entries))
}

async function getRow() {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.id, 'default')).limit(1)
  if (row) return row
  const [created] = await db.insert(userSettings).values({ id: 'default' }).returning()
  return created!
}

async function isWorkspaceEmpty(): Promise<boolean> {
  const [anyCourse] = await db.select({ id: courses.id }).from(courses).limit(1)
  if (anyCourse) return false
  const [anyCard] = await db.select({ id: cards.id }).from(cards).limit(1)
  return !anyCard
}

export async function GET() {
  const [row, empty] = await Promise.all([getRow(), isWorkspaceEmpty()])
  return Response.json({
    settings: {
      ...row,
      aiApiKey: maskKey(row.aiApiKey),
      hasApiKey: Boolean(row.aiApiKey),
      aiHeaders: row.aiHeaders ? '••••' : null, // values masked; the UI keeps them unless edited
      hasHeaders: Boolean(row.aiHeaders),
      hasCustomWeights: Array.isArray(row.fsrsWeights) && row.fsrsWeights.length === 21,
      isEmptyWorkspace: empty,
    },
  })
}

export const PUT = withRoute(async (req: Request) => {
  const body = await readJson(req, putSettingsSchema)
  const row = await getRow()
  const patch: Partial<typeof userSettings.$inferInsert> = { updatedAt: new Date().toISOString() }
  if (body.aiProvider !== undefined) patch.aiProvider = body.aiProvider as AIProvider
  if (body.aiModel !== undefined) patch.aiModel = body.aiModel
  if (body.aiBaseUrl !== undefined) patch.aiBaseUrl = body.aiBaseUrl
  // apiKey: only overwrite when a non-empty value is sent (empty = keep)
  if (body.aiApiKey !== undefined && body.aiApiKey !== '') patch.aiApiKey = body.aiApiKey
  // headers: same keep-when-empty rule (null/undefined/'' all keep); validate the JSON before storing
  if (body.aiHeaders) patch.aiHeaders = canonicalHeaders(body.aiHeaders)
  if (body.desiredRetention !== undefined) {
    // clamp to the supported FSRS band [0.5, 0.97]
    patch.desiredRetention = Math.max(0.5, Math.min(0.97, body.desiredRetention))
  }
  if (body.fsrsWeights !== undefined) {
    patch.fsrsWeights = body.fsrsWeights
  }
  if (body.sessionMinutes !== undefined)
    patch.sessionMinutes = Math.max(5, Math.min(180, Math.round(body.sessionMinutes)))
  if (body.theme !== undefined) patch.theme = body.theme
  if (body.hapticsEnabled !== undefined) patch.hapticsEnabled = body.hapticsEnabled
  if (body.onboardingCompleted !== undefined) patch.onboardingCompleted = body.onboardingCompleted
  if (body.sidebarCollapsedGroups !== undefined)
    patch.sidebarCollapsedGroups = body.sidebarCollapsedGroups
  if (body.remindersEnabled !== undefined) patch.remindersEnabled = body.remindersEnabled
  if (body.remindersQuietStart !== undefined) patch.remindersQuietStart = body.remindersQuietStart
  if (body.remindersQuietEnd !== undefined) patch.remindersQuietEnd = body.remindersQuietEnd
  if (body.remindersDailyCap !== undefined) patch.remindersDailyCap = body.remindersDailyCap
  if (body.remindersKinds !== undefined) patch.remindersKinds = body.remindersKinds
  if (body.learnerProfile !== undefined) patch.learnerProfile = body.learnerProfile
  await db.update(userSettings).set(patch).where(eq(userSettings.id, row.id))
  const [updated, empty] = await Promise.all([getRow(), isWorkspaceEmpty()])
  return Response.json({
    ok: true,
    settings: {
      ...updated,
      aiApiKey: maskKey(updated.aiApiKey),
      hasApiKey: Boolean(updated.aiApiKey),
      aiHeaders: updated.aiHeaders ? '••••' : null,
      hasHeaders: Boolean(updated.aiHeaders),
      hasCustomWeights: Array.isArray(updated.fsrsWeights) && updated.fsrsWeights.length === 21,
      isEmptyWorkspace: empty,
    },
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, testSettingsSchema)
  try {
    const row = await getRow()
    const effective = body.settings ?? {
      aiProvider: row.aiProvider,
      aiModel: row.aiModel ?? '',
      aiBaseUrl: row.aiBaseUrl ?? undefined,
      aiApiKey: row.aiApiKey ?? undefined,
      aiHeaders: row.aiHeaders ?? undefined,
    }
    const headers = effective.aiHeaders ? canonicalHeaders(effective.aiHeaders) : undefined
    const client = getAIClient({
      provider: effective.aiProvider as AIProvider,
      model: effective.aiModel,
      baseUrl: effective.aiBaseUrl ?? undefined,
      apiKey: effective.aiApiKey ?? undefined,
      headers: headers ? (JSON.parse(headers) as Record<string, string>) : undefined,
    })
    if (!client)
      return Response.json({
        ok: false,
        error:
          'Provider is set to "none" — manual mode is active and needs no connection. Pick a provider to test one.',
      })
    const started = Date.now()
    const reply = await client.generateText({ prompt: 'Reply with the single word: OK' })
    return Response.json({
      ok: true,
      reply: reply.trim().slice(0, 80),
      latencyMs: Date.now() - started,
    })
  } catch (e) {
    // the user is testing their own provider config here — the raw message IS the feature
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})
