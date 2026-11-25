import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  allElements,
  allOpeningTags,
  assertHtmlWithinLimit,
  firstElement,
  HtmlTooLargeError,
  MAX_ARTICLE_HTML_CHARS,
  MAX_CHAPTER_HTML_CHARS,
  replaceComments,
  replaceElements,
  replaceTags,
  withScanStats,
} from '../src/html-scan'
import {
  extractArticleFromHtml,
  extractEpubBytes,
  extractYoutubeCaptionTrackFromHtml,
  htmlFragmentToMarkdown,
  parseYoutubeCaptionPayload,
} from '../src/ingest'

/**
 * Known-fixture goldens: the expected values below were produced by the regex-based
 * implementation this scanner replaces (packages/core/src/ingest.ts at #147 head d271174),
 * so a mismatch means behavior changed.
 */
const CORPUS = {
  frag: [
    '<h1 class="t">Title &amp; One</h1><p>Hello <b>world</b> &mdash; text.</p><h2>Sub</h2><ul><li>a</li><li>b <code>x</code></li></ul><pre>code  here\n  line</pre><blockquote>Quote</blockquote><script>var a="<h1>no</h1>"</script><!-- c --><style>p{}</style><div>end</div>',
    '<H1>Upper</H1><H2 id=x>Mixed</h2><h10>not heading</h10><p>a<br/>b<br>c</p><nav>x</nav>',
    '<h1>one<h1>nested</h1> after</h1> tail <h3>three</h3><h4>four</h4>',
    '<h1>unclosed <h2>closed</h2> text',
    '<p>x</p><li>one<li>two</li>',
    '<svg><path d="M0"/></svg><p>keep</p><iframe src="x"></iframe><template><p>t</p></template><noscript>ns</noscript><canvas></canvas>',
    '<h1 data-x="a<b">attr lt</h1>',
  ],
  pages: [
    '<html><head><title>My Page - Site</title><meta property="og:title" content="OG Title"><meta name="d" content="x"></head><body><nav>menu</nav><header>h</header><main><article><h1>Heading</h1><p>Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. </p></article></main><footer>f</footer><aside>a</aside><form>f</form></body></html>',
    '<html><head><title>My Page - Site</title><meta content="OG Rev" property="og:title"><meta name="d" content="x"></head><body><nav>menu</nav><header>h</header><main><article><h1>Heading</h1><p>Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. </p></article></main><footer>f</footer><aside>a</aside><form>f</form></body></html>',
    '<html><head><title>My Page - Site</title><meta name="d" content="x"></head><body><nav>menu</nav><header>h</header><main><article><h1>Heading</h1><p>Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. </p></article></main><footer>f</footer><aside>a</aside><form>f</form></body></html>',
    '<body><p>short short short short short </p></body>',
    '<div><section>Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. </section></div>',
  ],
  caps: [
    '<transcript><text start="1.5" dur="2">Hello &amp; welcome</text><text start="70">Second <i>part</i></text></transcript>',
    '<timedtext><body><p t="1000" d="2">First line</p><p t="65000">Later</p></body></timedtext>',
    '{"events":[{"tStartMs":0,"segs":[{"utf8":"Hi"}]}]}',
  ],
  watch:
    '<html><head><title>Cool Video - YouTube</title></head><body>"captionTracks":[{"baseUrl":"https://x/y","languageCode":"en"}]</body></html>',
} as {
  frag: string[]
  pages: string[]
  caps: string[]
  watch: string
}
const LEGACY = {
  frag: [
    '# Title & One\n\nHello world — text.\n\n## Sub\n\n- a\n- b `x`\n\n```\ncode here\nline\n```\n\n> Quote\n\nend',
    '# Upper\n\n## Mixed\n\nnot headinga\nb\nc\n\nx',
    '# onenested\n\nafter tail\n\n### three\n\n#### four',
    'unclosed\n\n## closed\n\ntext',
    'x\n\n- onetwo',
    'keep',
    '# attr lt',
  ],
  pages: [
    {
      title: 'OG Title',
      content:
        '# Heading\n\nReadable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text.',
    },
    {
      title: 'OG Rev',
      content:
        '# Heading\n\nReadable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text.',
    },
    {
      title: 'My Page - Site',
      content:
        '# Heading\n\nReadable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text. Readable paragraph text.',
    },
    { title: 'example.com', content: 'short short short short short' },
    {
      title: 'example.com',
      content:
        'Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only. Plain body text only.',
    },
  ],
  caps: [
    '## [00:01]\n\nHello & welcome\n\n## [01:10]\n\nSecond part',
    '## [00:01]\n\nFirst line\n\n## [01:05]\n\nLater',
    '## [00:00]\n\nHi',
  ],
  watch: { title: 'Cool Video', captionUrl: 'https://x/y' },
} as {
  frag: string[]
  pages: { title: string; content: string }[]
  caps: string[]
  watch: { title: string; captionUrl: string | null }
}

describe('known fixtures match the previous regex implementation', () => {
  it('htmlFragmentToMarkdown', () => {
    CORPUS.frag.forEach((f, i) => expect(htmlFragmentToMarkdown(f)).toBe(LEGACY.frag[i]))
  })
  it('extractArticleFromHtml', () => {
    CORPUS.pages.forEach((p, i) =>
      expect(extractArticleFromHtml(p, 'https://example.com/a')).toEqual(LEGACY.pages[i]),
    )
  })
  it('parseYoutubeCaptionPayload and extractYoutubeCaptionTrackFromHtml', () => {
    CORPUS.caps.forEach((c, i) => expect(parseYoutubeCaptionPayload(c)).toBe(LEGACY.caps[i]))
    expect(extractYoutubeCaptionTrackFromHtml(CORPUS.watch)).toEqual(LEGACY.watch)
  })
})

/** Seeded generator for small adversarial strings built from tag-like pieces. */
function* corpus(count: number): Generator<string> {
  const pieces = [
    '<h1>',
    '</h1>',
    '<H1 a="<b">',
    '</H1>',
    '<h10>',
    '<h1-x>',
    '<h1/>',
    '<h1 ',
    '>',
    '<',
    '</',
    'x',
    ' ',
    '\n',
    '<!--',
    '-->',
    '<>',
    '<item id="a" href="b"/>',
    '<item ',
    '<ITEMREF idref=q>',
    '<dc:title>',
    '</dc:title>',
    '<title>',
    '</title>',
    '</h1 >',
    '<br>',
    '&',
    '<p>',
    '</p>',
  ]
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed
  }
  for (let i = 0; i < count; i++) {
    const len = 1 + (rnd() % 14)
    let s = ''
    for (let k = 0; k < len; k++) s += pieces[rnd() % pieces.length]
    yield s
  }
}

describe('helpers match the regexes they replace (differential, 4000 small cases)', () => {
  it('replaceElements == lazy first-close regex', () => {
    for (const s of corpus(4000)) {
      expect(replaceElements(s, ['h1'], (_n, inner) => `[${inner}]`)).toBe(
        s.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, '[$1]'),
      )
    }
  })
  it('multi-name replaceElements == backreference regex', () => {
    for (const s of corpus(4000)) {
      expect(replaceElements(s, ['h1', 'title', 'p'], () => '_')).toBe(
        s.replace(/<(h1|title|p)\b[^>]*>[\s\S]*?<\/\1>/gi, '_'),
      )
    }
  })
  it('firstElement == first regex match', () => {
    for (const s of corpus(4000)) {
      const m = /<(?:dc:)?title\b[^>]*>([\s\S]*?)<\/(?:dc:)?title>/i.exec(s)
      const f = firstElement(s, ['dc:title', 'title'])
      expect(f ? f.inner : null).toBe(m ? m[1]! : null)
    }
  })
  it('allOpeningTags == /<item\b([^>]*?)\/?>/gi', () => {
    for (const s of corpus(4000)) {
      const want = [...s.matchAll(/<item\b([^>]*?)\/?>/gi)].map((m) => m[1]!)
      expect(allOpeningTags(s, 'item')).toEqual(want)
    }
  })
  it('replaceTags == /<[^>]+>/g and replaceComments == /<!--[\s\S]*?-->/g', () => {
    for (const s of corpus(4000)) {
      expect(replaceTags(s, '|')).toBe(s.replace(/<[^>]+>/g, '|'))
      expect(replaceComments(s, '|')).toBe(s.replace(/<!--[\s\S]*?-->/g, '|'))
    }
  })
  it('allElements == global regex iteration', () => {
    for (const s of corpus(4000)) {
      const want = [...s.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)].map((m) => [m[1], m[2]])
      expect(allElements(s, ['p']).map((e) => [e.attrs, e.inner])).toEqual(want)
    }
  })
})

describe('work stays linear on hostile input (operation count, not wall time)', () => {
  const N = 20_000
  // each pass may touch every character a small constant number of times
  const PER_CHAR = 12
  const hostile: [string, string][] = [
    ['unclosed headings', '<h1>x'.repeat(N)],
    ['openings without >', '<h1 '.repeat(N)],
    ['bare <', '<'.repeat(N)],
    ['unclosed comments', '<!--'.repeat(N)],
    ['unclosed items', '<item '.repeat(N)],
    ['nested same tag', '<li>a'.repeat(N) + '</li>'],
    ['nested chrome', '<nav><footer>'.repeat(N / 2)],
    ['many metas', '<meta property="og:title" '.repeat(N / 2)],
    ['text cues unclosed', '<text start="1">'.repeat(N)],
  ]
  for (const [name, html] of hostile) {
    it(`every call site: ${name}`, () => {
      const stats = withScanStats(() => {
        htmlFragmentToMarkdown(html)
        extractArticleFromHtml(html, 'https://example.com')
        parseYoutubeCaptionPayload(html)
        extractYoutubeCaptionTrackFromHtml(html)
      })
      expect(stats.chars).toBeGreaterThan(0)
      // htmlFragmentToMarkdown and extractArticleFromHtml run ~20 passes between them
      expect(stats.chars).toBeLessThanOrEqual(html.length * PER_CHAR * 12)
    })
  }

  it('EPUB OPF and chapter parsing', () => {
    const opf = `<package><metadata><dc:title>T</dc:title></metadata><manifest>${'<item '.repeat(
      N,
    )}</manifest><spine>${'<itemref '.repeat(N)}</spine></package>`
    const z = zipSync({
      'META-INF/container.xml': strToU8('<rootfile full-path="c.opf"/>' + '<rootfile '.repeat(N)),
      'c.opf': strToU8(opf),
    })
    const stats = withScanStats(() => {
      expect(() => extractEpubBytes(z)).toThrow(/no readable text chapters/)
    })
    expect(stats.chars).toBeLessThanOrEqual((opf.length + 30 * N) * PER_CHAR)
  })

  it('a single scan is linear: doubling the input about doubles the work', () => {
    const w = (n: number) =>
      withScanStats(() => replaceElements('<h1>x'.repeat(n), ['h1'], () => '')).chars
    const a = w(10_000)
    const b = w(20_000)
    expect(b / a).toBeLessThan(2.5)
  })
})

describe('size caps refuse instead of importing a partial result', () => {
  const container = '<rootfile full-path="c.opf"/>'
  const opf =
    '<package><metadata><dc:title>T</dc:title></metadata><manifest><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/></spine></package>'
  const epub = (chapter: string) =>
    zipSync({
      'META-INF/container.xml': strToU8(container),
      'c.opf': strToU8(opf),
      'a.xhtml': strToU8(chapter),
    })

  it('refuses an EPUB chapter over the parser cap with a typed error', () => {
    const big = '<body><p>' + 'a'.repeat(MAX_CHAPTER_HTML_CHARS) + '</p></body>'
    expect(() => extractEpubBytes(epub(big))).toThrow(HtmlTooLargeError)
  })

  it('accepts a chapter exactly at the cap', () => {
    const body = '<body><p>' + 'a'.repeat(100) + '</p></body>'
    const pad = ' '.repeat(MAX_CHAPTER_HTML_CHARS - body.length)
    const out = extractEpubBytes(epub(body + pad))
    expect(out.chapters).toHaveLength(1)
  })

  it('refuses an article over the cap and accepts one at the cap', () => {
    expect(() => assertHtmlWithinLimit('a'.repeat(MAX_ARTICLE_HTML_CHARS + 1), 'article')).toThrow(
      /refusing instead of importing a partial result/,
    )
    expect(() => assertHtmlWithinLimit('a'.repeat(MAX_ARTICLE_HTML_CHARS), 'article')).not.toThrow()
    expect(() =>
      extractArticleFromHtml('a'.repeat(MAX_ARTICLE_HTML_CHARS + 1), 'https://x.test'),
    ).toThrow(HtmlTooLargeError)
  })
})

// Old-vs-new og:title behavior. "Old" values were measured by running the same inputs against
// the pre-#150 extractor (base d271174). The correct title is the meta tag's content attribute
// value, as the author wrote it, so the new results are the intended behavior.
describe('og:title per-tag attribute reading (old vs new)', () => {
  const body =
    '<main><article><p>' + 'Readable paragraph text here. '.repeat(10) + '</p></article></main>'
  const page = (meta: string) =>
    `<html><head><title>Fallback Title</title>${meta}</head><body>${body}</body></html>`
  const cases: [string, string, string, string][] = [
    // [name, meta tag, old output, new output]
    [
      'apostrophe in value',
      `<meta property="og:title" content="Don't Panic: A Guide">`,
      'Don',
      "Don't Panic: A Guide",
    ],
    [
      'spaces around =',
      `<meta property = "og:title" content = "Spaced Title">`,
      'Fallback Title',
      'Spaced Title',
    ],
    [
      'content before property',
      `<meta content="Reversed Order" property="og:title">`,
      'Reversed Order',
      'Reversed Order',
    ],
  ]
  for (const [name, meta, , expected] of cases) {
    it(name, () => {
      expect(extractArticleFromHtml(page(meta), 'https://example.com').title).toBe(expected)
    })
  }
})
