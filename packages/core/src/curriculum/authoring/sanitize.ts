/**
 * Escaping and a tiny Markdown-to-HTML renderer for untrusted course text.
 *
 * Course files come from anyone (AI tools, other authors). Every string is
 * HTML-escaped BEFORE any Markdown rule runs, so raw tags in the source can
 * never reach the output. Only a fixed set of tags is produced, and only
 * http(s) and mailto links are kept. Images are never loaded: they become
 * their alt text. The renderer is intentionally small; it is not CommonMark.
 */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape text for HTML text and attribute positions. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESC[c]!)
}

/** Remove control characters (except tab and newline) and bidi overrides that can disguise text. */
export function stripControl(text: string): string {
  return text.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g,
    '',
  )
}

/** Return a safe absolute http(s)/mailto URL, or null. Rejects credentials in the URL. */
export function safeUrl(raw: string): string | null {
  const trimmed = stripControl(raw).trim()
  if (!/^(?:https?:\/\/|mailto:)/i.test(trimmed)) return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'mailto:') return null
    if (u.username || u.password) return null
    return u.href
  } catch {
    return null
  }
}

function inline(escaped: string): string {
  // Order matters: code first so its content is not touched by other rules.
  const codes: string[] = []
  let s = escaped.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  s = s.replace(/!\[([^\]\n]*)\]\(([^)\n]*)\)/g, (_m, alt: string) => alt || '[image]')
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    // url is already escaped; undo only &amp; so URL parsing sees the real characters
    const real = url
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
    const safe = safeUrl(real)
    return safe
      ? `<a href="${escapeHtml(safe)}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`
      : label
  })
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>')
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>')
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]!)
}

/** Render untrusted Markdown to safe HTML (paragraphs, headings, lists, quotes, code). */
export function renderMarkdownSafe(
  markdown: string,
  opts: { headingOffset?: number } = {},
): string {
  const offset = opts.headingOffset ?? 2
  const lines = stripControl(markdown).replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const flushPara = (buf: string[]) => {
    if (buf.length) out.push(`<p>${inline(escapeHtml(buf.join(' ')))}</p>`)
    buf.length = 0
  }
  const para: string[] = []
  while (i < lines.length) {
    const line = lines[i]!
    const fence = /^```\s*([\w+-]*)\s*$/.exec(line.trim())
    if (fence) {
      flushPara(para)
      const code: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) code.push(lines[i++]!)
      i += 1
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      flushPara(para)
      const level = Math.min(6, h[1]!.length + offset)
      out.push(`<h${level}>${inline(escapeHtml(h[2]!.trim()))}</h${level}>`)
      i += 1
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      flushPara(para)
      const quote: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!))
        quote.push(lines[i++]!.replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${inline(escapeHtml(quote.join(' ')))}</blockquote>`)
      continue
    }
    const li = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line)
    if (li) {
      flushPara(para)
      const ordered = li[2] !== undefined
      const items: string[] = []
      while (i < lines.length) {
        const m = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i]!)
        if (!m || (m[2] !== undefined) !== ordered) break
        items.push(`<li>${inline(escapeHtml(m[3]!))}</li>`)
        i += 1
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    if (/^\s*$/.test(line)) flushPara(para)
    else para.push(line.trim())
    i += 1
  }
  flushPara(para)
  return out.join('\n')
}

/** Escape plain text and keep line breaks. For short fields that are not Markdown. */
export function renderPlain(text: string): string {
  return escapeHtml(stripControl(text)).replace(/\n/g, '<br>')
}

/** The only Content-Security-Policy the packet carries. */
export const PACKET_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

/** The only <meta> tags a packet may contain, as `attribute=value` lists. */
const ALLOWED_META = new Set([
  'charset=utf-8',
  `http-equiv=content-security-policy|content=${PACKET_CSP}`,
  'name=viewport|content=width=device-width,initial-scale=1',
  'name=referrer|content=no-referrer',
])

/** Markdown problems that change what a reader sees, such as a code fence that never closes. */
export function markdownProblems(text: string): string[] {
  const fences = text.split('\n').filter((l) => /^```/.test(l.trim())).length
  return fences % 2 === 1
    ? ['a code fence is never closed, so the rest of the text renders as code']
    : []
}

const ALLOWED_TAGS = new Set(
  'html head meta title style body header nav section footer h1 h2 h3 h4 h5 h6 p br ul ol li dl dt dd a strong em code pre blockquote details summary div span'.split(
    ' ',
  ),
)
const ALLOWED_ATTRS = new Set([
  'href',
  'rel',
  'target',
  'lang',
  'id',
  'class',
  'type',
  'open',
  'charset',
  'name',
  'content',
  'http-equiv',
])

/**
 * Audit generated HTML by walking its real tags (escaped text such as
 * `&lt;img src=x&gt;` is not a tag and is ignored). Returns one entry per
 * problem: a tag outside the allow-list, an attribute outside the allow-list,
 * or a link that is not http(s), mailto or an in-page anchor. Also reports any
 * `@import` or `url(` inside style blocks. An empty list means the document
 * cannot run script or load remote resources.
 */
export function htmlHasActiveContent(html: string): string[] {
  const problems = new Set<string>()
  const styles = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []
  for (const st of styles) if (/@import|url\(/i.test(st)) problems.add('CSS import or url()')
  const stripped = html
    .replace(/^<!doctype html>/i, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>')
  const tagRe =
    /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(stripped))) {
    const name = m[1]!.toLowerCase()
    if (!ALLOWED_TAGS.has(name)) problems.add(`tag <${name}>`)
    const attrRe = /\s+([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    const metaParts: string[] = []
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(m[2] ?? ''))) {
      const attr = a[1]!.toLowerCase()
      if (!ALLOWED_ATTRS.has(attr)) problems.add(`attribute ${attr}`)
      if (name === 'meta') {
        const raw = a[2] ?? a[3] ?? a[4] ?? ''
        metaParts.push(
          `${attr}=${attr === 'http-equiv' || attr === 'charset' ? raw.toLowerCase() : raw}`,
        )
      }
      if (attr === 'href') {
        const v = (a[2] ?? a[3] ?? a[4] ?? '').replace(/&amp;/g, '&')
        if (!v.startsWith('#') && !safeUrl(v)) problems.add('unsafe href')
      }
    }
    if (name === 'meta' && !m[0]!.startsWith('</') && !ALLOWED_META.has(metaParts.join('|')))
      problems.add('meta tag outside the fixed set')
  }
  // A stray "<" that starts something tag-like but was not parsed above is suspicious.
  const rest = stripped.replace(tagRe, '')
  if (/<[a-zA-Z!/?]/.test(rest)) problems.add('malformed tag')
  return [...problems]
}
