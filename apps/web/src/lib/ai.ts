/**
 * Server-side AI accessor for the web app.
 *
 * THE REGISTRATION STEP: importing '@learning-hub/ai-adapters' registers the
 * five built-in providers (anthropic, openai, openai-compatible, ollama,
 * custom-endpoint) into @learning-hub/core's provider registry as a side
 * effect. Every AI route goes through this module, so providers are always
 * registered before use. core itself never imports the adapters — with no
 * provider configured ('none', the default) every surface shows its manual
 * mode instead (see docs/ai-providers.md).
 */
import '@learning-hub/ai-adapters'
import { getActiveAIClientFromDb, getAISettingsFromDb, type AIClient } from '@learning-hub/core/ai'

export { getActiveAIClientFromDb, getAISettingsFromDb }
/** Re-export of the pinned AI client interface from @learning-hub/core/ai. */
export type { AIClient }

/** Thrown by requireAI when no AI provider is configured in Settings. */
export class AIUnavailableError extends Error {
  constructor() {
    super('AI is not configured — pick a provider and model in Settings.')
    this.name = 'AIUnavailableError'
  }
}

/**
 * Throws AIUnavailableError when no provider is configured. Route handlers
 * should catch it and return 400 with the message so the UI can show the
 * manual alternative / "Configure AI in Settings" hint.
 */
export async function requireAI(): Promise<AIClient> {
  const client = await getActiveAIClientFromDb()
  if (!client) throw new AIUnavailableError()
  return client
}
