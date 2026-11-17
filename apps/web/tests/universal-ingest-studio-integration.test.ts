import { describe, expect, it } from 'vitest'
import { POST as ingestPost } from '../src/server/handlers/ingest/multimodal/route'

describe('Universal Ingest Studio Integration Suite', () => {
  it('parses markdown study notes and returns structured clozes and definitions', async () => {
    const rawContent = `
# Cognitive Architecture

- **Spaced Repetition**: Memory retention improves exponentially when reviews are spaced out.
- The hippocampus projects to the {{c1::Neocortex}} during slow-wave sleep.

Q: What is the testing effect?
A: Retrieval practice produces stronger recall than passive rereading.

Synaptic Weight :: The physical strength of connection between two neurons.
`
    const req = new Request('http://localhost/api/ingest/multimodal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'markdown_notes',
        rawContent,
        title: 'Cognitive Notes',
      }),
    })

    const res = await ingestPost(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.kind).toBe('markdown_notes')
    expect(data.cardCount).toBeGreaterThanOrEqual(4)
    expect(data.cards.some((c: { format: string }) => c.format === 'cloze')).toBe(true)
    expect(data.items.length).toBe(data.cards.length)
  })

  it('parses YouTube lecture transcript with timestamped deep links', async () => {
    const rawContent = `00:01:15.000
Gradient descent iteratively adjusts parameters toward negative loss gradients.

00:02:40.000
Momentum prevents oscillations in narrow ravines.`

    const req = new Request('http://localhost/api/ingest/multimodal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'youtube_transcript',
        rawContent,
        title: 'Deep Learning Lecture',
        sourceUrl: 'https://youtube.com/watch?v=sample123',
      }),
    })

    const res = await ingestPost(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.segmentCount).toBe(2)
    expect(data.cards.length).toBe(2)
    expect(data.cards[0].sourceReference).toContain('t=75s')
  })

  it('parses academic paper definitions and LaTeX display formulas', async () => {
    const rawContent = `
In this paper we define the Transformer architecture.
$$Attention(Q, K, V) = softmax(\\frac{QK^T}{\\sqrt{d_k}})V$$

Definition 1.1: Scaled Dot-Product Attention scales dot-products of queries and keys.
`
    const req = new Request('http://localhost/api/ingest/multimodal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'academic_paper',
        rawContent,
        title: 'Transformer Paper',
      }),
    })

    const res = await ingestPost(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.cardCount).toBeGreaterThanOrEqual(2)
    expect(data.cards.some((c: { front: string }) => c.front.includes('softmax'))).toBe(true)
  })

  it('parses source code and generates cloze syntax declaration flashcards', async () => {
    const rawContent = `export function computeCosineSimilarity(a: number[], b: number[]): number {
  return dotProduct(a, b) / (norm(a) * norm(b))
}

export interface MetricScore {
  similarity: number
  purity: number
}`

    const req = new Request('http://localhost/api/ingest/multimodal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'code_files',
        rawContent,
        title: 'Similarity Metrics',
        filename: 'similarity.ts',
      }),
    })

    const res = await ingestPost(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.cardCount).toBeGreaterThanOrEqual(2)
    expect(data.cards[0].format).toBe('cloze')
  })
})
