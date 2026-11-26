import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ARTICLE_HTML_CHARS, MAX_CHAPTER_HTML_CHARS } from '@learning-hub/core/html-scan'

const createSource = vi.fn((v: Record<string, unknown>) => ({ id: 1, ...v }))
let pageHtml = ''

vi.mock('@learning-hub/db', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createSource: (v: Record<string, unknown>) => createSource(v),
}))

import { setPinnedFetch } from '../src/server/bounded-fetch'
import { POST as ingestPost } from '../src/server/handlers/reading/ingest/route'
import { POST as readingPost } from '../src/server/handlers/reading/route'

/** A real EPUB whose single chapter is `chapter`. */
function epubWithChapter(chapter: string): Uint8Array {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OEBPS/content.opf': strToU8(
      '<package><metadata><dc:title>Big</dc:title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
    ),
    'OEBPS/c1.xhtml': strToU8(chapter),
  })
}
const chapterOf = (chars: number) =>
  `<html><body><p>${'a'.repeat(chars - 30)}</p></body></html>`.padEnd(chars, ' ')

function json(body: unknown) {
  return new Request('http://localhost/api/reading/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('oversized HTML maps to 422, not 400 or 500', () => {
  beforeEach(() => {
    createSource.mockClear()
    // The URL fetch goes through the pinned transport, not the AI adapters' fetch.
    setPinnedFetch(async () => new Response(pageHtml, { status: 200 }))
  })
  afterEach(() => setPinnedFetch(null))

  it('ingest epub mode: a chapter over the limit is a 422 with fixed text and no source', async () => {
    const big = epubWithChapter(chapterOf(MAX_CHAPTER_HTML_CHARS + 10))
    const res = await ingestPost(
      json({ mode: 'epub', base64: Buffer.from(big).toString('base64'), title: 'x' }),
    )
    expect(res.status).toBe(422)
    const text = await res.text()
    expect(text).toMatch(/too large to import safely/i)
    expect(text).not.toMatch(/\d{6,}/) // no sizes, no limit arithmetic
    expect(text).not.toContain('aaaa')
    expect(createSource).not.toHaveBeenCalled() // nothing partial is stored
  })

  it('ingest epub mode: a chapter at the limit still imports', async () => {
    const ok = epubWithChapter(chapterOf(60_000))
    const res = await ingestPost(
      json({ mode: 'epub', base64: Buffer.from(ok).toString('base64'), title: 'x' }),
    )
    expect(res.status).toBe(200)
    expect(createSource).toHaveBeenCalledOnce()
  })

  it('ingest url mode: a page over the 5MB byte cap is refused (413) before the 8M-character check can matter', async () => {
    // The byte cap (5MB) is below the article character cap (8M chars), so the pinned,
    // bounded fetch refuses an oversized page first. The 422 mapping stays as a backstop.
    pageHtml = `<html><body>${'b'.repeat(5 * 1024 * 1024 + 10)}</body></html>`
    const res = await ingestPost(json({ mode: 'url', url: 'https://example.com/a' }))
    expect(res.status).toBe(413)
    expect(await res.text()).not.toContain('bbbb')
    expect(createSource).not.toHaveBeenCalled()
  })

  it('reading upload: an oversized chapter is a 422', async () => {
    const big = epubWithChapter(chapterOf(MAX_CHAPTER_HTML_CHARS + 10))
    const form = new FormData()
    form.set('file', new File([new Uint8Array(big)], 'book.epub', { type: 'application/epub+zip' }))
    const res = await readingPost(
      new Request('http://localhost/api/reading', { method: 'POST', body: form }),
    )
    expect(res.status).toBe(422)
    expect(createSource).not.toHaveBeenCalled()
  })

  it('a malformed epub is still a 400', async () => {
    const res = await ingestPost(
      json({ mode: 'epub', base64: Buffer.from('not a zip at all').toString('base64') }),
    )
    expect(res.status).toBe(400)
  })
})
