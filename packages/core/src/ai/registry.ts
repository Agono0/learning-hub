/**
 * Learning HUB — AI provider registry.
 *
 * The registry is the plug-in point that makes the project never depend on AI:
 * core ships exactly ONE built-in provider, `'none'` (returns null → every
 * surface shows its manual mode). Real providers are registered by importing
 * an adapters package — `@learning-hub/ai-adapters` calls `registerAIProvider`
 * for 'anthropic', 'openai', 'openai-compatible', 'ollama' and
 * 'custom-endpoint' at import time. Anything else can be plugged in the same
 * way (see docs/ai-providers.md, "writing your own provider").
 */
import type { AIClient, AIClientFactory } from './port'
import type { AISettings, AIProvider } from '../types'

const providers = new Map<string, AIClientFactory>()

/** Register (or replace) a provider factory under the given name. */
export function registerAIProvider(name: string, factory: AIClientFactory): void {
  if (!name || typeof name !== 'string')
    throw new Error('registerAIProvider: provider name must be a non-empty string')
  if (typeof factory !== 'function')
    throw new Error(`registerAIProvider("${name}"): factory must be a function`)
  providers.set(name, factory)
}

/** Remove a provider registration (useful in tests). */
export function unregisterAIProvider(name: string): void {
  providers.delete(name)
}

/** Names of every registered provider, in registration order. 'none' is always available. */
export function listAIProviders(): string[] {
  return ['none', ...Array.from(providers.keys()).filter((n) => n !== 'none')]
}

/**
 * Build an AIClient for the named provider. Returns `null` for 'none' (the
 * default — callers must show the manual alternative instead of dead-ending).
 * Throws a descriptive error for a provider name that was never registered
 * (the adapters package was not imported, or the name is misspelled).
 */
export function getAIProvider(name: string, settings: AISettings): AIClient | null {
  if (name === 'none' || !name) return null
  const factory = providers.get(name)
  if (!factory) {
    throw new Error(
      `AI provider "${name}" is not registered. Import '@learning-hub/ai-adapters' (or call registerAIProvider("${name}", factory)), ` +
        `or set the provider to "none" in Settings to use manual mode. Registered: [${listAIProviders().join(', ')}]`,
    )
  }
  return factory(settings)
}

/** Build an AIClient from settings; null when the provider is 'none' (not configured). */
export function getAIClient(settings: AISettings): AIClient | null {
  return getAIProvider(settings.provider, settings)
}

/**
 * Default model per provider. Empty string means "the endpoint defines the
 * model" — the provider then requires an explicit model in Settings instead
 * of silently sending a wrong one to a custom/Ollama-style endpoint.
 */
export const DEFAULT_MODELS: Record<Exclude<AIProvider, 'none'>, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.5-flash',
  'openai-compatible': '',
  ollama: 'llama3.1',
  'custom-endpoint': '',
}

/** Default model for a provider ('' when the endpoint must define its own model). */
export function defaultModelFor(provider: AIProvider): string {
  if (provider === 'none') return ''
  return DEFAULT_MODELS[provider] ?? ''
}
