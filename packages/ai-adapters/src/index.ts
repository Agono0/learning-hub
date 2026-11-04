/**
 * @learning-hub/ai-adapters — entry point.
 *
 * IMPORTING THIS PACKAGE IS THE REGISTRATION STEP: the side effects below
 * register the five built-in providers into @learning-hub/core's registry.
 * Server apps that can talk to AI import it exactly once (apps/web does it in
 * src/lib/ai.ts). core itself never imports this package — with no adapters
 * imported, only the 'none' provider exists and every surface shows its
 * manual mode.
 *
 * Writing your own provider: call registerAIProvider(name, factory) with a
 * function (settings) => AIClient (see docs/ai-providers.md).
 */
import { registerBuiltinProviders } from './providers'
import { registerCustomEndpoint } from './custom-endpoint'

registerBuiltinProviders()
registerCustomEndpoint()

// Public surface for tree-shakeable manual registration (no side effects).
export { anthropicFactory, openaiFactory, openaiCompatibleFactory, ollamaFactory, registerBuiltinProviders } from './providers'
export { customEndpointFactory, registerCustomEndpoint } from './custom-endpoint'
export { makeSdkClient } from './sdk-client'
