/**
 * AI registry tests — the provider plug-in point.
 * Verifies: 'none' → null (manual mode), registration/lookup/override, the
 * descriptive unregistered-provider error, the default-model table, and the
 * "every feature has a manual mode" invariant.
 */
import { describe, expect, it } from 'vitest'
import type { AIClient } from '../src/ai/port'
import {
  DEFAULT_MODELS,
  assertEveryFeatureHasManualMode,
  defaultModelFor,
  getAIClient,
  getAIProvider,
  listAIProviders,
  registerAIProvider,
  unregisterAIProvider,
} from '../src/ai'

function fakeClient(tag: string): AIClient {
  return {
    generateText: async () => tag,
    generateJSON: async <T,>({ schema }: { schema: import('zod').ZodType<T> }) => (schema as unknown as { parse: (v: unknown) => T }).parse({ tag }),
  }
}

describe('AI registry', () => {
  it("returns null for 'none' and empty names (manual mode), never a client", () => {
    const settings = { provider: 'none' as const, model: '' }
    expect(getAIProvider('none', settings)).toBeNull()
    expect(getAIProvider('', settings)).toBeNull()
    expect(getAIClient(settings)).toBeNull()
  })

  it('builds clients from registered factories and passes settings through', async () => {
    let received: unknown = null
    registerAIProvider('test-factory', (settings) => {
      received = settings
      return fakeClient(`hello-${settings.model}`)
    })
    const client = getAIProvider('test-factory', { provider: 'anthropic', model: 'm1' })
    expect(client).not.toBeNull()
    expect(await client!.generateText({ prompt: 'x' })).toBe('hello-m1')
    expect(received).toEqual({ provider: 'anthropic', model: 'm1' })
    unregisterAIProvider('test-factory')
  })

  it('throws a DESCRIPTIVE error for unregistered providers (names the fix + registered set)', () => {
    expect(() => getAIProvider('no-such-provider', { provider: 'none', model: '' })).toThrowError(/no-such-provider.*registerAIProvider|registerAIProvider.*no-such-provider/)
    expect(() => getAIProvider('no-such-provider', { provider: 'none', model: '' })).toThrowError(/@learning-hub\/ai-adapters/)
  })

  it('lists providers with none first, in registration order', () => {
    registerAIProvider('zzz-a', () => fakeClient('a'))
    registerAIProvider('zzz-b', () => fakeClient('b'))
    const names = listAIProviders()
    expect(names[0]).toBe('none')
    expect(names).toContain('zzz-a')
    expect(names).toContain('zzz-b')
    expect(names.indexOf('zzz-a')).toBeLessThan(names.indexOf('zzz-b'))
    unregisterAIProvider('zzz-a')
    unregisterAIProvider('zzz-b')
  })

  it('re-registration replaces the factory (last one wins)', async () => {
    registerAIProvider('dup', () => fakeClient('first'))
    registerAIProvider('dup', () => fakeClient('second'))
    const client = getAIProvider('dup', { provider: 'none', model: '' })
    expect(await client!.generateText({ prompt: '' })).toBe('second')
    unregisterAIProvider('dup')
  })

  it('unregisterAIProvider removes a registration', () => {
    registerAIProvider('gone', () => fakeClient('gone'))
    unregisterAIProvider('gone')
    expect(() => getAIProvider('gone', { provider: 'none', model: '' })).toThrowError(/not registered/)
  })

  it('rejects invalid registrations loudly', () => {
    expect(() => registerAIProvider('', () => fakeClient(''))).toThrowError(/non-empty string/)
    expect(() => registerAIProvider('bad-factory', undefined as never)).toThrowError(/factory must be a function/)
  })

  it('defaults models: known defaults for hosted providers, blank for endpoint-defined ones', () => {
    expect(defaultModelFor('anthropic')).toBe('claude-sonnet-4-5')
    expect(defaultModelFor('openai')).toBe('gpt-4o-mini')
    expect(defaultModelFor('ollama')).toBe('llama3.1')
    // endpoint-defined providers have NO silent default — a wrong model id 404s
    expect(defaultModelFor('openai-compatible')).toBe('')
    expect(defaultModelFor('custom-endpoint')).toBe('')
    expect(defaultModelFor('none')).toBe('')
    expect(DEFAULT_MODELS['custom-endpoint']).toBe('')
  })

  it('every transport feature has a manual mode (the never-dead-end invariant)', () => {
    expect(assertEveryFeatureHasManualMode()).toEqual([])
  })
})
