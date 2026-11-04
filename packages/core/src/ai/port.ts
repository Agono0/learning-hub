/**
 * Learning HUB — AI port (the pinned client interface).
 *
 * This file is the ONLY thing consumers know about AI providers: an
 * {@link AIClient} built by a factory registered in `registry.ts`. There are
 * ZERO SDK imports here (and in the whole `ai/` directory) — the AI SDK and
 * provider SDKs live exclusively in `@learning-hub/ai-adapters`, so the core
 * learning engine stays installable and testable without any AI dependency.
 *
 * Hard guardrail (unchanged from the original ai.ts): the AI never hands out
 * answers before the student has made a retrieval attempt — every prompt in
 * `prompts.ts` is written around that rule (Socratic escalation ladder).
 */
import type { ZodType } from 'zod'

/** A single chat turn for {@link AIClient.streamChat}. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Pinned provider-agnostic AI client interface (Zod-validated JSON + plain
 * text + optional streaming). Adapters in `@learning-hub/ai-adapters` build
 * implementations of this from user settings; `streamChat` is optional —
 * providers that cannot stream (e.g. 'custom-endpoint') simply omit it and
 * callers fall back to `generateText`.
 */
export interface AIClient {
  /** Zod-validated JSON generation. Implementations should retry once with an explicit JSON reminder, then throw. */
  generateJSON<T>(opts: { schema: ZodType<T>; system?: string; prompt: string }): Promise<T>
  /** Plain text generation. */
  generateText(opts: { system?: string; prompt: string }): Promise<string>
  /**
   * OPTIONAL token streaming for chat surfaces. Yields text chunks as they
   * arrive. When absent, callers fall back to `generateText` over the
   * flattened transcript and emit it as one chunk.
   */
  streamChat?(opts: {
    system?: string
    /** Either a single user prompt or the full message history (prompt wins when both are given). */
    prompt?: string
    messages?: ChatMessage[]
    signal?: AbortSignal
  }): AsyncIterable<string>
}

/** Factory registered under a provider name via {@link import('./registry').registerAIProvider}. */
export type AIClientFactory = (settings: import('../types').AISettings) => AIClient
