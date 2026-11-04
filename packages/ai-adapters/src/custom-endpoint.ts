/**
 * @learning-hub/ai-adapters — the 'custom-endpoint' provider.
 *
 * Lets the user plug in ANY HTTP service as their AI: the adapter POSTs the
 * AI envelope JSON ({ v, feature, system, prompt, schema }) to the configured
 * URL and expects { "result": string | object } back. This is the same
 * envelope the prompt-transport copy-paste mode serves, so a tiny script, a
 * self-hosted gateway, a company proxy or any chatbot-with-an-API works.
 * Contract documented in docs/ai-providers.md.
 */
import { z, type ZodType } from 'zod'
import { buildAIEnvelope, parseAIEnvelopeResult, registerAIProvider } from '@learning-hub/core/ai'
import type { AISettings } from '@learning-hub/core/types'
import type { AIClient, AIClientFactory } from '@learning-hub/core/ai'

const REQUEST_TIMEOUT_MS = 120_000

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Best-effort JSON Schema rendering of a zod schema (custom-endpoint envelope `schema` field). */
function jsonSchemaOf(schema: ZodType<unknown>): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { io: 'output' }))
  } catch {
    return '(see the prompt for the expected JSON shape — this schema could not be rendered to JSON Schema)'
  }
}

interface CustomEndpointResult {
  result: string | object
}

/** POST the envelope, return the parsed { result } body. */
async function callEndpoint(url: string, headers: Record<string, string>, envelope: unknown): Promise<string | object> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    throw new Error(`custom-endpoint request failed: ${errText(e)}`)
  }
  if (!res.ok) {
    throw new Error(`custom-endpoint responded with HTTP ${res.status} (the response body is not shown to the client)`)
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (e) {
    throw new Error(`custom-endpoint returned non-JSON body: ${errText(e)}`)
  }
  const result = (body as Partial<CustomEndpointResult> | null)?.result
  if (typeof result !== 'string' && typeof result !== 'object') {
    throw new Error('custom-endpoint response must be {"result": string | object} — "result" is missing or not a string/object')
  }
  return result
}

/**
 * The 'custom-endpoint' factory. Requires `settings.baseUrl` (the URL that
 * accepts the envelope POST); `settings.headers` are sent alongside the
 * request (e.g. {"Authorization": "Bearer …"}). Streaming is not part of the
 * contract, so the returned client omits `streamChat` — callers fall back to
 * `generateText`.
 */
export const customEndpointFactory: AIClientFactory = (settings: AISettings): AIClient => {
  const url = settings.baseUrl?.trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('custom-endpoint provider requires an http(s) Base URL in Settings — the URL that accepts the AI envelope POST (see docs/ai-providers.md).')
  }
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(settings.headers ?? {}) }

  return {
    /** POST the envelope; the string result is fence-stripped + zod-validated, object results validated directly. */
    async generateJSON<T>({ schema, system, prompt }: { schema: ZodType<T>; system?: string; prompt: string }): Promise<T> {
      const envelope = buildAIEnvelope('adhoc', {
        system: system ?? '',
        prompt,
        schemaDescription: jsonSchemaOf(schema),
      })
      const result = await callEndpoint(url, headers, envelope)
      if (typeof result === 'string') return parseAIEnvelopeResult('custom-endpoint', result, schema)
      const parsed = schema.safeParse(result)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ')
        throw new Error(`custom-endpoint result does not match the expected schema — ${issues}`)
      }
      return parsed.data
    },

    /** POST the envelope; the reply's `result` (string) is returned verbatim. */
    async generateText({ system, prompt }: { system?: string; prompt: string }): Promise<string> {
      const result = await callEndpoint(url, headers, buildAIEnvelope('adhoc', { system: system ?? '', prompt }))
      return typeof result === 'string' ? result : JSON.stringify(result)
    },
  }
}

/** Register the custom-endpoint provider (called at package import time via index.ts). */
export function registerCustomEndpoint(): void {
  registerAIProvider('custom-endpoint', customEndpointFactory)
}
