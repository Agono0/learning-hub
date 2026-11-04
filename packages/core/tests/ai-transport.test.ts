/**
 * Prompt-transport tests — the "bring your own AI" path.
 * Verifies: envelope shape/round-trip, parseAIEnvelopeResult against fenced
 * JSON, prose-wrapped JSON, bare arrays, and descriptive failures for invalid
 * replies and schema violations. Also pins the feature registry contract.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  AI_FEATURES,
  ENVELOPE_VERSION,
  buildAIEnvelope,
  extractJson,
  getAIFeature,
  listAIFeatures,
  parseAIEnvelopeResult,
} from '../src/ai/transport'

const schema = z.object({ name: z.string(), count: z.number().int() })

describe('buildAIEnvelope', () => {
  it('builds a versioned envelope with feature, system, prompt', () => {
    const env = buildAIEnvelope('cloze-generator', { system: 'SYS', prompt: 'PROMPT' })
    expect(env).toEqual({ v: ENVELOPE_VERSION, feature: 'cloze-generator', system: 'SYS', prompt: 'PROMPT' })
    expect(ENVELOPE_VERSION).toBe(1)
  })

  it('includes the schema description only when given', () => {
    const withSchema = buildAIEnvelope('f', { system: 's', prompt: 'p', schemaDescription: '{"cards":[]}' })
    expect(withSchema.schema).toBe('{"cards":[]}')
    const without = buildAIEnvelope('f', { system: 's', prompt: 'p' })
    expect('schema' in without).toBe(false)
  })

  it('rejects an empty feature name', () => {
    expect(() => buildAIEnvelope('', { system: 's', prompt: 'p' })).toThrowError(/feature name is required/)
  })

  it('round-trips through a simulated chatbot reply', () => {
    const env = buildAIEnvelope('brainwrite', { system: 'SYS', prompt: 'PROMPT', schemaDescription: '{"ideas":[…]}' })
    // the user pastes env into a chatbot; the chatbot's reply comes back as text
    const reply = 'Sure! Here is the JSON:\n```json\n{"ideas":["one","two"]}\n```'
    const parsed = parseAIEnvelopeResult(env.feature, reply, z.object({ ideas: z.array(z.string()).min(1) }))
    expect(parsed).toEqual({ ideas: ['one', 'two'] })
  })
})

describe('parseAIEnvelopeResult', () => {
  it('parses plain JSON', () => {
    expect(parseAIEnvelopeResult('f', '{"name":"a","count":1}', schema)).toEqual({ name: 'a', count: 1 })
  })

  it('parses fenced JSON (```json … ``` with surrounding whitespace)', () => {
    const fenced = '```json\n{"name": "b", "count": 2}\n```'
    expect(parseAIEnvelopeResult('f', fenced, schema)).toEqual({ name: 'b', count: 2 })
  })

  it('parses fenced JSON without a language tag', () => {
    expect(parseAIEnvelopeResult('f', '```\n{"name":"c","count":3}\n```', schema)).toEqual({ name: 'c', count: 3 })
  })

  it('parses prose-wrapped JSON (the model chatted around the answer)', () => {
    const prose = 'Here is my grading of your teach-back. I hope it helps!\n\n{"name":"d","count":4}\n\nLet me know if you want more detail.'
    expect(parseAIEnvelopeResult('f', prose, schema)).toEqual({ name: 'd', count: 4 })
  })

  it('parses a prose-wrapped JSON array', () => {
    const parsed = parseAIEnvelopeResult('f', 'before ["x","y"] after', z.array(z.string()))
    expect(parsed).toEqual(['x', 'y'])
  })

  it('handles braces inside strings when finding the balanced block', () => {
    const tricky = 'prefix {"name":"a { weird } name","count":5} suffix'
    expect(parseAIEnvelopeResult('f', tricky, schema)).toEqual({ name: 'a { weird } name', count: 5 })
  })

  it('throws a descriptive error on non-JSON text', () => {
    expect(() => parseAIEnvelopeResult('f', 'no json at all here', schema)).toThrowError(/No JSON found/)
    expect(() => parseAIEnvelopeResult('f', '', schema)).toThrowError(/result was empty/)
  })

  it('throws a descriptive error naming the feature and issue on schema violations', () => {
    try {
      parseAIEnvelopeResult('feynman-grader', '{"coverage": 200}', z.object({ coverage: z.number().int().min(0).max(100) }))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('feynman-grader')
      expect((e as Error).message).toMatch(/coverage/)
    }
  })

  it('reports the failing path for nested violations', () => {
    const nested = z.object({ cards: z.array(z.object({ text: z.string() })).min(1) })
    try {
      parseAIEnvelopeResult('cloze-generator', '{"cards": []}', nested)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('cards')
    }
  })
})

describe('extractJson', () => {
  it('returns raw values (numbers, strings) when the whole text is JSON', () => {
    expect(extractJson('42')).toBe(42)
    expect(extractJson('"hi"')).toBe('hi')
  })

  it('prefers the fenced body over stray braces in prose', () => {
    expect(extractJson('note { here\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('throws when the balanced block is malformed', () => {
    expect(() => extractJson('xxx {"a": [1, 2} yyy')).toThrowError(/No JSON found/)
  })
})

describe('AI feature registry', () => {
  it('exposes the prompt-transport feature set with the right kinds', () => {
    const names = listAIFeatures()
    for (const expected of ['tutor-grade', 'feynman-student', 'feynman-grader', 'course-generator', 'cloze-generator', 'coach', 'council-optimist', 'council-skeptic', 'council-domain-expert', 'council-devils-advocate', 'brainwrite']) {
      expect(names).toContain(expected)
    }
    expect(AI_FEATURES['tutor-grade']!.kind).toBe('text')
    expect(AI_FEATURES['feynman-grader']!.kind).toBe('json')
    expect(AI_FEATURES['brainwrite']!.kind).toBe('json')
  })

  it('JSON features always carry a zod schema + schema description; text features never do', () => {
    for (const def of Object.values(AI_FEATURES)) {
      if (def.kind === 'json') {
        expect(def.schema, def.name).toBeDefined()
        expect(def.schemaDescription, def.name).toBeTruthy()
      } else {
        expect(def.schema, def.name).toBeUndefined()
      }
      expect(def.system.length).toBeGreaterThan(20)
    }
  })

  it('getAIFeature returns null for unknown features', () => {
    expect(getAIFeature('nope')).toBeNull()
    expect(getAIFeature('coach')).not.toBeNull()
  })

  it('the council personas back their transport features (same guardrailed prompts)', () => {
    expect(AI_FEATURES['council-skeptic']!.system).toContain('Skeptic')
    expect(AI_FEATURES['council-optimist']!.system).toContain('Optimist')
  })
})
