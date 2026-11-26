import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import FreeRecallPage from '../app/free-recall/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/free-recall/route'

const TEXT =
  'Photosynthesis converts sunlight into chemical energy inside chloroplasts. The light reactions split water and release oxygen as a byproduct. The Calvin cycle fixes carbon dioxide into glucose using ATP.'
const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/free-recall', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

describe('Free Recall web surfaces', () => {
  it('registers a nav entry and renders the page', () => {
    expect(ALL_NAV_ITEMS.some((i) => i.href === '/free-recall')).toBe(true)
    const html = renderToString(React.createElement(FreeRecallPage))
    expect(html).toContain('Free Recall')
    expect(html).toContain('Passage to learn')
  })
  it('GET lists actions', async () => {
    expect(
      (await (await GET(new Request('http://localhost/api/free-recall'))).json()).actions,
    ).toEqual(['units', 'score'])
  })
  it('units splits the passage', async () => {
    const res = await post({ action: 'units', passage: { text: TEXT } })
    expect((await res.json()).units).toHaveLength(3)
  })
  it('score returns report, gaps, EI facts, next step and round count', async () => {
    const res = await post({
      action: 'score',
      passage: { text: TEXT },
      recall: 'Photosynthesis converts sunlight into chemical energy inside chloroplasts.',
      history: [20],
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.report.recalled).toBe(1)
    expect(data.gaps).toHaveLength(2)
    expect(data.eiFacts).toHaveLength(2)
    expect(data.round).toBe(2)
    expect(['retry', 'explain', 'done']).toContain(data.next.action)
    expect(data.delayMinutes).toBeGreaterThan(0)
  })
  it('rejects short passages and bad actions', async () => {
    expect((await post({ action: 'units', passage: { text: 'short' } })).status).toBe(400)
    expect((await post({ action: 'nope' })).status).toBe(400)
    expect(
      (await post({ action: 'score', passage: { text: TEXT }, recall: 'x', history: [120] }))
        .status,
    ).toBe(400)
  })
})
