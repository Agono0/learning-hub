import { describe, expect, it } from 'vitest'
import {
  buildPacket,
  escapeHtml,
  htmlHasActiveContent,
  renderMarkdownSafe,
  safeUrl,
  stripControl,
} from '../src/curriculum/authoring'
import { edit, makeCourse } from './authoring-fixtures'

describe('sanitize', () => {
  it('escapes html in text', () => {
    expect(escapeHtml(`<img src=x onerror="a()"> & '`)).toBe(
      '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;',
    )
  })
  it('accepts only http, https and mailto links without credentials', () => {
    expect(safeUrl('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&c=2')
    expect(safeUrl('mailto:a@b.co')).toBe('mailto:a@b.co')
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://x.y',
      '//evil.example',
      'https://user:pw@example.com',
      ' JaVaScRiPt:1',
      'https://',
    ])
      expect(safeUrl(bad)).toBeNull()
  })
  it('strips control and bidi override characters', () => {
    expect(stripControl('a\u202Eb\u0000c\td')).toBe('abc\td')
  })
  it('renders a small markdown subset and never raw html', () => {
    const html = renderMarkdownSafe(
      '# Title\n\nHello **bold** and *it* and `<b>code</b>`.\n\n- one\n- two\n\n1. a\n2. b\n\n> quote\n\n```js\nif (a < b) {}\n```',
    )
    expect(html).toContain('<h3>Title</h3>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>&lt;b&gt;code&lt;/b&gt;</code>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<ol><li>a</li><li>b</li></ol>')
    expect(html).toContain('<blockquote>quote</blockquote>')
    expect(html).toContain('<pre><code>if (a &lt; b) {}</code></pre>')
  })
  it('drops dangerous links and images', () => {
    const html = renderMarkdownSafe(
      '[x](javascript:alert(1)) ![pic](https://evil.example/p.png) [ok](https://example.com)',
    )
    expect(html).not.toContain('javascript')
    expect(html).not.toContain('<img')
    expect(html).toContain('pic')
    expect(html).toContain('<a href="https://example.com/"')
    expect(htmlHasActiveContent(html)).toEqual([])
  })
  it('neutralizes html tags and attributes injected into markdown', () => {
    const html = renderMarkdownSafe(
      '<script>alert(1)</script> <a href="x" onclick="y()">t</a> <img src=x onerror=z>',
    )
    expect(html).not.toMatch(/<script|<img|<a /)
    expect(html).toContain('&lt;script&gt;')
  })
  it('detects active content in html', () => {
    expect(htmlHasActiveContent('<script>1</script><img src="x">')).toEqual(
      expect.arrayContaining(['tag <script>', 'tag <img>', 'attribute src']),
    )
    expect(htmlHasActiveContent('<p onclick="x()">a</p>')).toContain('attribute onclick')
    expect(htmlHasActiveContent('<a href="javascript:alert(1)">x</a>')).toContain('unsafe href')
    expect(htmlHasActiveContent('<a href="#top" rel="x">x</a>')).toEqual([])
    expect(htmlHasActiveContent('<style>@import "x"</style>')).toContain('CSS import or url()')
    expect(htmlHasActiveContent('<p>&lt;img src=x onerror=1&gt; is only text</p>')).toEqual([])
    expect(htmlHasActiveContent('<p>fine</p>')).toEqual([])
    expect(htmlHasActiveContent('<p>ok</p><svg onload=1>')).toEqual(
      expect.arrayContaining(['tag <svg>', 'attribute onload']),
    )
  })
})

describe('buildPacket', () => {
  it('builds a self-contained page with a CSP and no remote loads', () => {
    const r = buildPacket(makeCourse())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.html).toContain("default-src 'none'")
    expect(htmlHasActiveContent(r.html)).toEqual([])
    expect(r.html).not.toMatch(/<script|<img|<link|<iframe|\ssrc=/i)
    expect(r.html).toContain('<title>SQL Basics</title>')
    expect(r.html).toContain('SELECT and WHERE')
    expect(r.html).toContain('<summary>Answer</summary>')
    expect(r.filename).toBe('sql-basics-packet.html')
    expect(r.sections).toBe(5)
    expect(r.bytes).toBeGreaterThan(2000)
  })
  it('can leave answers out', () => {
    const r = buildPacket(makeCourse(), { includeAnswers: false })
    expect(r.ok && r.html.includes('<summary>Answer</summary>')).toBe(false)
    expect(r.ok && r.warnings[0]).toMatch(/left out/)
  })
  it('sanitizes hostile course text', () => {
    const c = edit((x) => {
      x.title = '<script>alert(1)</script>'
      x.modules[0]!.lessons[0]!.theory[0]!.body =
        'Click [here](javascript:alert(1)) <img src=x onerror=alert(2)>'
      x.modules[0]!.lessons[0]!.resources = [
        { title: 'Evil', url: 'https://example.com/ok?a=1&b=2' },
      ]
      x.modules[0]!.lessons[0]!.exercises[0]!.prompt = '</p><script>steal()</script>'
    })
    const r = buildPacket(c)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(htmlHasActiveContent(r.html)).toEqual([])
    expect(r.html).not.toMatch(/<script>|href="javascript:/)
    expect(r.html).toContain('&lt;script&gt;')
    expect(r.html).toContain('href="https://example.com/ok?a=1&amp;b=2"')
  })
  it('refuses to exceed the size cap instead of truncating', () => {
    const r = buildPacket(makeCourse(), { maxBytes: 500 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('too-large')
      expect(r.detail).toContain('500')
    }
  })
  it('is deterministic and omits the exam on request', () => {
    const a = buildPacket(makeCourse())
    const b = buildPacket(makeCourse())
    expect(a.ok && b.ok && a.html === b.html).toBe(true)
    const noExam = buildPacket(makeCourse(), { includeExam: false })
    expect(noExam.ok && noExam.html.includes('id="exam"')).toBe(false)
  })
  it('does not reveal ordering or matching answers in the question view', () => {
    const c = edit((x) => {
      x.modules[0]!.lessons[1]!.exercises = [
        {
          id: 'o',
          type: 'ordering',
          prompt: 'Put the SQL steps in order now.',
          items: ['zebra first', 'apple second', 'mango third'],
        },
      ]
    })
    const r = buildPacket(c, { includeAnswers: false })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const order = ['zebra first', 'apple second', 'mango third'].map((t) => r.html.indexOf(t))
      expect(order).not.toEqual([...order].sort((a, b) => a - b))
    }
  })
  it('does not show the author order even when it matches the sorted order', () => {
    const items = ['apple first', 'banana second', 'cherry third']
    const c = edit((x) => {
      x.modules[0]!.lessons[1]!.exercises = [
        { id: 'o', type: 'ordering', prompt: 'Put the SQL steps in order now.', items },
      ]
    })
    const r = buildPacket(c, { includeAnswers: false })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const pos = items.map((t) => r.html.indexOf(t))
      expect(pos).not.toEqual([...pos].sort((a, b) => a - b))
    }
  })
  it('says worked-example answers stay when exercise answers are left out', () => {
    const r = buildPacket(makeCourse(), { includeAnswers: false })
    expect(r.ok && r.warnings.join(' ')).toMatch(/Worked examples are teaching material/)
  })
  it('warns about an unclosed code fence', () => {
    const c = edit((x) => {
      x.modules[0]!.lessons[0]!.theory[0]!.body = 'Intro\n```sql\nSELECT 1'
    })
    const r = buildPacket(c)
    expect(r.ok && r.warnings.join(' ')).toMatch(/code fence is never closed/)
  })
})

import {
  scrambled,
  htmlHasActiveContent as audit,
  markdownProblems,
} from '../src/curriculum/authoring'

describe('packet hardening', () => {
  it('scrambled never equals the author order, even when the sorted order does', () => {
    const items = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
    for (let n = 2; n <= 6; n++) {
      const list = items.slice(0, n)
      expect(scrambled(list, (x) => x)).not.toEqual(list)
      expect(scrambled(list, (x) => x).sort()).toEqual([...list].sort())
    }
    expect(scrambled(['a'], (x) => x)).toEqual(['a'])
    expect(scrambled(['a', 'a'], (x) => x)).toEqual(['a', 'a'])
  })
  it('the audit accepts only the fixed meta tags', () => {
    const ok =
      '<html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head></html>'
    expect(audit(ok)).toEqual([])
    expect(
      audit('<head><meta http-equiv="refresh" content="0;url=https://x.example"></head>'),
    ).toContain('meta tag outside the fixed set')
    expect(
      audit(`<head><meta http-equiv="Content-Security-Policy" content="default-src *"></head>`),
    ).toContain('meta tag outside the fixed set')
    expect(audit('<head><meta name="referrer" content="unsafe-url"></head>')).toContain(
      'meta tag outside the fixed set',
    )
  })
  it('detects an unclosed code fence', () => {
    expect(markdownProblems('text\n```js\nlet a = 1')).toHaveLength(1)
    expect(markdownProblems('```\nx\n```')).toEqual([])
  })
})
