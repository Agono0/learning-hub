/**
 * Learning HUB — AI layer (compat shim).
 *
 * The implementation moved to `src/ai/` (port + registry + transport + manual
 * + prompts) and now has ZERO AI SDK imports — provider implementations live
 * in `@learning-hub/ai-adapters`. This file keeps the historical import paths
 * working: `@learning-hub/core/ai`, `./ai` inside core, and the barrel export
 * in src/index.ts all resolve here first (file beats directory), then
 * re-export everything from the directory.
 */
export * from './ai/index'
