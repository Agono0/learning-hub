/**
 * @learning-hub/ai-adapters — shared AI SDK → AIClient wrapper.
 * The only place in the monorepo (besides the provider factories below) that
 * touches the `ai` package. Wraps generateObject/generateText/streamText into
 * the pinned AIClient port from @learning-hub/core, including the one-retry
 * JSON reminder behaviour of the original core ai.ts.
 */
import { generateObject, generateText, streamText, type LanguageModel, type ModelMessage } from 'ai'
import type { AIClient, ChatMessage } from '@learning-hub/core/ai'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Build the pinned AIClient over an AI SDK LanguageModel instance. */
export function makeSdkClient(model: LanguageModel): AIClient {
  return {
    /** Zod-validated JSON generation. One retry with an explicit JSON reminder; then throws. */
    async generateJSON<T>({
      schema,
      system,
      prompt,
    }: {
      schema: import('zod').ZodType<T>
      system?: string
      prompt: string
    }): Promise<T> {
      const jsonReminder = 'Return ONLY JSON matching the schema — no prose, no markdown fences.'
      try {
        const { object } = await generateObject({ model, schema, system, prompt })
        return object
      } catch (firstError) {
        try {
          const { object } = await generateObject({
            model,
            schema,
            system,
            prompt: `${prompt}\n\n${jsonReminder}`,
          })
          return object
        } catch (secondError) {
          throw new Error(
            `AI generateJSON failed after 1 retry: ${errText(secondError)} (first attempt: ${errText(firstError)})`,
          )
        }
      }
    },
    async generateText({ system, prompt }: { system?: string; prompt: string }): Promise<string> {
      const { text } = await generateText({ model, system, prompt })
      return text
    },
    /** Token streaming over the same model (optional port method). */
    async *streamChat({
      system,
      prompt,
      messages,
      signal,
    }: {
      system?: string
      prompt?: string
      messages?: ChatMessage[]
      signal?: AbortSignal
    }) {
      const coreMessages: ModelMessage[] = (messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }))
      if (prompt) coreMessages.push({ role: 'user', content: prompt })
      const result = streamText({ model, system, messages: coreMessages, abortSignal: signal })
      for await (const chunk of result.textStream) {
        yield chunk
      }
    },
  }
}
