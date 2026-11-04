/**
 * Learning HUB — AI layer barrel.
 *
 * The core engine has ZERO AI SDK dependencies: this directory contains only
 * the port (AIClient interface), the provider registry, the prompt-transport
 * envelope machinery, manual-mode definitions and the prompt library. Provider
 * implementations (AI SDK, Anthropic/OpenAI/Ollama, custom HTTP endpoints)
 * live in `@learning-hub/ai-adapters` and register themselves into the
 * registry at import time. docs/ai-providers.md documents the whole contract.
 */
export * from './port'
export * from './registry'
export * from './prompts'
export * from './transport'
export * from './manual'
export * from './settings'
