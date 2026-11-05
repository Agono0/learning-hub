/**
 * @learning-hub/ai-adapters — the four built-in SDK provider factories.
 * Logic moved verbatim from the old getAIModel switch in packages/core/src/ai.ts;
 * core itself no longer knows any of this exists (it only sees the registry).
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { defaultModelFor, registerAIProvider } from '@learning-hub/core/ai'
import type { AISettings } from '@learning-hub/core/types'
import type { AIClientFactory } from '@learning-hub/core/ai'
import { makeSdkClient } from './sdk-client'
import { networkFetch } from './network'

/** Resolve the model id from settings, falling back to the provider default; '' defaults throw. */
function resolveModel(settings: AISettings, provider: AISettings['provider']): string {
  const model = settings.model?.trim() || defaultModelFor(provider)
  if (!model) {
    throw new Error(
      `Provider "${provider}" requires an explicit model in Settings — it has no safe default.`,
    )
  }
  return model
}

/** Anthropic via the AI SDK (@ai-sdk/anthropic). Requires an API key. */
export const anthropicFactory: AIClientFactory = (settings) => {
  return makeSdkClient(
    createAnthropic({ apiKey: settings.apiKey, fetch: networkFetch })(
      resolveModel(settings, 'anthropic'),
    ),
  )
}

/** OpenAI via the AI SDK (@ai-sdk/openai). Requires an API key. */
export const openaiFactory: AIClientFactory = (settings) => {
  return makeSdkClient(
    createOpenAI({ apiKey: settings.apiKey, fetch: networkFetch }).chat(
      resolveModel(settings, 'openai'),
    ),
  )
}

/** Any OpenAI-compatible endpoint (LM Studio, vLLM, OpenRouter, …) via @ai-sdk/openai. */
export const openaiCompatibleFactory: AIClientFactory = (settings) => {
  return makeSdkClient(
    createOpenAI({ apiKey: settings.apiKey, baseURL: settings.baseUrl, fetch: networkFetch }).chat(
      resolveModel(settings, 'openai-compatible'),
    ),
  )
}

/** Ollama's OpenAI-compatible local server (default http://localhost:11434/v1). */
export const ollamaFactory: AIClientFactory = (settings) => {
  return makeSdkClient(
    createOpenAICompatible({
      name: 'ollama',
      baseURL: settings.baseUrl ?? 'http://localhost:11434/v1',
      fetch: networkFetch,
    })(resolveModel(settings, 'ollama')),
  )
}

/** Register all four SDK providers (called at package import time via index.ts). */
export function registerBuiltinProviders(): void {
  registerAIProvider('anthropic', anthropicFactory)
  registerAIProvider('openai', openaiFactory)
  registerAIProvider('openai-compatible', openaiCompatibleFactory)
  registerAIProvider('ollama', ollamaFactory)
}
