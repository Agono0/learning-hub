import { describe, it, expect } from 'vitest'
import { extractJson } from '../src/ai/json'

describe('AI JSON Extraction Module (extractJson)', () => {
  it('parses pure JSON object strings cleanly', () => {
    const raw = '{"name": "Neural Networks", "layers": 4}'
    const result = extractJson(raw) as { name: string; layers: number }
    expect(result.name).toBe('Neural Networks')
    expect(result.layers).toBe(4)
  })

  it('parses pure JSON array strings cleanly', () => {
    const raw = '[1, 2, 3, 5, 8]'
    const result = extractJson(raw) as number[]
    expect(result).toEqual([1, 2, 3, 5, 8])
  })

  it('extracts JSON from markdown fences with json tag (```json ... ```)', () => {
    const raw = `\`\`\`json
{
  "title": "Spaced Retrieval",
  "status": "active"
}
\`\`\``
    const result = extractJson(raw) as { title: string; status: string }
    expect(result.title).toBe('Spaced Retrieval')
    expect(result.status).toBe('active')
  })

  it('extracts JSON from untagged markdown fences (``` ... ```)', () => {
    const raw = `\`\`\`
{
  "deckId": 42
}
\`\`\``
    const result = extractJson(raw) as { deckId: number }
    expect(result.deckId).toBe(42)
  })

  it('extracts embedded JSON surrounded by conversational model prose', () => {
    const raw = `Here is the generated analysis you requested:

{
  "score": 98,
  "recommendation": "Advance to next module"
}

Let me know if you would like more details!`
    const result = extractJson(raw) as { score: number; recommendation: string }
    expect(result.score).toBe(98)
    expect(result.recommendation).toBe('Advance to next module')
  })

  it('handles strings with escaped quotes and braces inside values correctly', () => {
    const raw = `Prefix note: {"formula": "f(x) = { x > 0 }", "quote": "She said: \\"Hello\\"."} Postfix note.`
    const result = extractJson(raw) as { formula: string; quote: string }
    expect(result.formula).toBe('f(x) = { x > 0 }')
    expect(result.quote).toBe('She said: "Hello".')
  })

  it('extracts balanced arrays embedded inside conversational prose', () => {
    const raw = `The top cards are: [{"id": 1, "priority": 10}, {"id": 2, "priority": 20}] Hope this helps!`
    const result = extractJson(raw) as Array<{ id: number; priority: number }>
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[1].priority).toBe(20)
  })

  it('throws a descriptive error on empty or whitespace-only input', () => {
    expect(() => extractJson('')).toThrow('the result was empty')
    expect(() => extractJson('   \n  \t ')).toThrow('the result was empty')
  })

  it('throws a descriptive error when no valid JSON is present in the text', () => {
    const raw = 'Sorry, as an AI language model I cannot parse this text at the moment.'
    expect(() => extractJson(raw)).toThrow('No JSON found in the result')
  })
})
