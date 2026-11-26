/**
 * Integration tests for the Elaborative Interrogation handler, page and nav entry.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ElaborativeInterrogationPage from '../app/elaborative-interrogation/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/elaborative-interrogation/route'

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/elaborative-interrogation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const fact = {
  id: 'a',
  statement:
    'Spaced practice improves retention because each retrieval strengthens the memory trace.',
  keyTerms: ['retrieval', 'memory'],
  priorKnowledge: 0.5,
}

describe('Elaborative Interrogation web surfaces', () => {
  it('registers a nav entry', () => {
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/elaborative-interrogation')).toBe(true)
  })
  it('renders the page server-side with the empty state', () => {
    const html = renderToString(React.createElement(ElaborativeInterrogationPage))
    expect(html).toContain('Elaborative Interrogation')
    expect(html).toContain('Paste study text')
  })
  it('GET lists actions', async () => {
    const res = await GET(new Request('http://localhost/api/elaborative-interrogation'))
    const data = await res.json()
    expect(data.actions).toEqual(
      expect.arrayContaining(['extract', 'grade', 'lint', 'calibration', 'export']),
    )
  })
  it('POST extract returns facts', async () => {
    const res = await post({
      action: 'extract',
      text: 'Photosynthesis converts sunlight into chemical energy inside the chloroplasts of plant cells.',
    })
    expect(res.status).toBe(200)
    expect((await res.json()).facts).toHaveLength(1)
  })
  it('POST grade returns grade, state, fsrs rating and next prompt', async () => {
    const res = await post({
      action: 'grade',
      fact,
      today: 100,
      answer:
        'Each retrieval takes effort, and that effort strengthens the memory so retention lasts, because forgetting makes recall harder and therefore more useful. For example vocabulary after a week.',
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.grade.total).toBeGreaterThan(40)
    expect(data.state.attempts).toBe(1)
    expect(data.state.dueDay).toBeGreaterThan(100)
    expect([1, 2, 3, 4]).toContain(data.fsrsRating)
    expect(data.nextPrompt.text).toContain(fact.statement)
  })
  it('POST queue, summary, lint, calibration and export work', async () => {
    const q = await (await post({ action: 'queue', facts: [fact], states: [], today: 1 })).json()
    expect(q.queue).toHaveLength(1)
    expect(q.summary.facts).toBe(1)
    expect(
      (await (await post({ action: 'summary', facts: [fact], today: 1 })).json()).summary.due,
    ).toBe(1)
    expect((await (await post({ action: 'lint', facts: [fact] })).json()).issues).toEqual([])
    expect(
      (
        await (
          await post({ action: 'calibration', points: [{ predicted: 90, actual: 40 }] })
        ).json()
      ).report.n,
    ).toBe(1)
    expect((await (await post({ action: 'export', facts: [fact] })).json()).markdown).toContain(
      'Elaborative Interrogation bank',
    )
  })
  it('rejects invalid bodies', async () => {
    expect((await post({ action: 'nope' })).status).toBe(400)
    expect((await post({ action: 'grade', fact, answer: 'x' })).status).toBe(400)
    expect(
      (await post({ action: 'calibration', points: [{ predicted: 120, actual: 1 }] })).status,
    ).toBe(400)
  })
})
