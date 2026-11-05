import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  extractArticleFromHtml,
  extractEpubBytes,
  extractSurveyHeadings,
  extractYoutubeCaptionTrackFromHtml,
  extractYoutubeVideoId,
  parseYoutubeCaptionPayload,
} from '../src/ingest'

describe('multi-format reading ingestion & SQ3R helpers', () => {
  it('unpacks an EPUB archive in spine order into clean Markdown chapters', () => {
    const epubBytes = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`),
      'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Effective Study &amp; Recall</dc:title>
            <dc:creator>Francis P. Robinson</dc:creator>
          </metadata>
          <manifest>
            <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
            <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine>
            <itemref idref="ch1"/>
            <itemref idref="ch2"/>
          </spine>
        </package>`),
      'OEBPS/text/ch1.xhtml': strToU8(`<html><body>
        <h1>Chapter 1: Survey First</h1>
        <p>Scan headings before reading to construct a mental scaffold for incoming ideas.</p>
      </body></html>`),
      'OEBPS/text/ch2.xhtml': strToU8(`<html><body>
        <h2>Chapter 2: Active Recitation</h2>
        <p>Close the book and recite key mechanisms from memory to trigger the testing effect.</p>
      </body></html>`),
    })

    const res = extractEpubBytes(epubBytes)
    expect(res.title).toBe('Effective Study & Recall')
    expect(res.author).toBe('Francis P. Robinson')
    expect(res.chapters).toHaveLength(2)
    // Spine order is ch1 -> ch2 even though manifest listed ch2 first
    expect(res.chapters[0]!.title).toBe('Chapter 1: Survey First')
    expect(res.chapters[1]!.title).toBe('Chapter 2: Active Recitation')
    expect(res.content).toContain('# Chapter 1: Survey First')
    expect(res.content).toContain('## Chapter 2: Active Recitation')
  })

  it('extracts clean Markdown from web HTML while stripping nav, scripts, and footers', () => {
    const html = `<!doctype html>
      <html>
        <head>
          <meta property="og:title" content="Spaced Repetition Deep Dive" />
          <style>.ad { display:block }</style>
          <script>window.evil = 1</script>
        </head>
        <body>
          <nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
          <article>
            <h1>Why Spacing Works</h1>
            <p>Distributed practice strengthens long-term storage strength across days and weeks. Over hundreds of experiments since Ebbinghaus (1885), spacing consistently beats cramming by a wide margin.</p>
            <h2>Practical FSRS Tips</h2>
            <ul><li>Keep cards atomic</li><li>Grade honestly</li></ul>
          </article>
          <footer>Copyright 2026</footer>
        </body>
      </html>`

    const article = extractArticleFromHtml(html, 'https://example.com/sr')
    expect(article.title).toBe('Spaced Repetition Deep Dive')
    expect(article.content).toContain('# Why Spacing Works')
    expect(article.content).toContain('- Keep cards atomic')
    expect(article.content).not.toContain('window.evil')
    expect(article.content).not.toContain('Pricing')
    expect(article.content).not.toContain('Copyright 2026')
  })

  it('parses YouTube URLs, watch-page captionTracks, and XML/json3 transcripts', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe(
      'dQw4w9WgXcQ',
    )
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeVideoId('https://example.com/not-yt')).toBeNull()

    const watchHtml = `<html><head><title>FSRS Lecture - YouTube</title></head><body>
      <script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc&lang=es","languageCode":"es"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc&lang=en","languageCode":"en"}]}}};</script>
    </body></html>`
    const meta = extractYoutubeCaptionTrackFromHtml(watchHtml)
    expect(meta.title).toBe('FSRS Lecture')
    expect(meta.captionUrl).toContain('lang=en')

    const xml = `<transcript>
      <text start="2.5" dur="4.0">Welcome to cognitive psychology &amp; memory.</text>
      <text start="68.0" dur="5.0">Now let us examine retrieval practice.</text>
    </transcript>`
    const parsedXml = parseYoutubeCaptionPayload(xml)
    expect(parsedXml).toContain('## [00:02]')
    expect(parsedXml).toContain('Welcome to cognitive psychology & memory.')
    expect(parsedXml).toContain('## [01:08]')

    const json3 = JSON.stringify({
      events: [{ tStartMs: 5000, segs: [{ utf8: 'Hello ' }, { utf8: 'world!' }] }],
    })
    expect(parseYoutubeCaptionPayload(json3)).toContain('Hello world!')
  })

  it('extracts Survey headings from Markdown or topic landmarks from plain prose', () => {
    const md = '# Intro\n\nBody\n\n## Mechanism\n\nMore\n\n### Summary\n\nEnd'
    expect(extractSurveyHeadings(md)).toEqual(['Intro', 'Mechanism', 'Summary'])
  })
})
