/**
 * Runtime-neutral multi-format reading ingestion & SQ3R helpers.
 *
 * Pure TypeScript + `fflate` (zero `node:*`, `fs`, or DOM `DOMParser` imports),
 * so identical extraction runs inside Node API routes, Web Workers (Windows /
 * Android Tauri OPFS), CLI, and MCP.
 *
 * Formats supported:
 * 1. EPUB (`.epub` ZIP container → `META-INF/container.xml` → OPF `<manifest>`
 *    & `<spine>` → ordered XHTML chapters → clean Markdown).
 * 2. Web HTML articles (`<article>` / `<main>` / `<body>` content extraction,
 *    stripping scripts, styles, nav, footer, aside).
 * 3. YouTube watch pages & `timedtext` XML / `json3` caption tracks.
 * 4. SQ3R Survey heading / section landmark extraction (Robinson 1946,
 *    *Effective Study*).
 */
import {
  allElements,
  allOpeningTags,
  assertHtmlWithinLimit,
  firstElement,
  replaceComments,
  replaceElements,
  replaceTags,
} from './html-scan'
import { ArchiveLimitError, EPUB_LIMITS, openBoundedZip } from './archive-limits'

export interface EpubChapter {
  id: string
  title: string
  content: string
}

export interface EpubExtractResult {
  title: string
  author: string | null
  content: string
  chapters: EpubChapter[]
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
}

/** Decode standard XML/HTML named and numeric character entities. */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? full
  })
}

function getAttr(tagAttrs: string, attrName: string): string | null {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  const m = re.exec(tagAttrs)
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? '') : null
}

function stripNonContentBlocks(html: string): string {
  return replaceElements(
    replaceComments(html, ' '),
    ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'template'],
    () => ' ',
  )
}

/** Convert an HTML/XHTML fragment into clean, readable Markdown paragraphs and headings. */
export function htmlFragmentToMarkdown(html: string): string {
  let s = stripNonContentBlocks(html)

  // Convert headings <h1>..<h4>
  s = replaceElements(s, ['h1'], (_n, inner) => `\n\n# ${inner}\n\n`)
  s = replaceElements(s, ['h2'], (_n, inner) => `\n\n## ${inner}\n\n`)
  s = replaceElements(s, ['h3'], (_n, inner) => `\n\n### ${inner}\n\n`)
  s = replaceElements(s, ['h4'], (_n, inner) => `\n\n#### ${inner}\n\n`)

  // Convert code/pre, blockquotes, lists, line breaks, and block boundaries
  s = replaceElements(s, ['pre'], (_n, inner) => `\n\n\`\`\`\n${inner}\n\`\`\`\n\n`)
  s = replaceElements(s, ['code'], (_n, inner) => `\`${inner}\``)
  s = replaceElements(s, ['blockquote'], (_n, inner) => `\n\n> ${inner}\n\n`)
  s = replaceElements(s, ['li'], (_n, inner) => `\n- ${inner}`)
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|section|article|tr|ul|ol|table)>/gi, '\n\n')

  // Strip remaining tags
  s = replaceTags(s, '')
  s = decodeHtmlEntities(s)

  // Normalize horizontal whitespace & collapse excessive blank lines
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeZipPath(baseDir: string, relativeHref: string): string {
  const cleanHref = (relativeHref.split('#')[0] ?? '').split('?')[0] ?? ''
  const combined = baseDir ? `${baseDir}/${cleanHref}` : cleanHref
  const parts = combined.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}

/**
 * Extract structured Markdown text and chapter metadata from an `.epub` byte buffer.
 */
export function extractEpubBytes(bytes: Uint8Array): EpubExtractResult {
  let zip: ReturnType<typeof openBoundedZip>
  try {
    zip = openBoundedZip(bytes, EPUB_LIMITS)
  } catch (err) {
    if (err instanceof ArchiveLimitError) {
      throw new Error(
        err.code === 'not-zip'
          ? 'Invalid EPUB file — could not unpack ZIP archive'
          : `Invalid EPUB file — ${err.message}`,
      )
    }
    throw new Error('Invalid EPUB file — could not unpack ZIP archive')
  }

  const decoder = new TextDecoder('utf-8')
  // Names only; entries are inflated lazily, one at a time, and only if the parser reads
  // them (container.xml, the OPF, and spine/manifest chapters). Images, fonts, CSS, NCX
  // and nav are never inflated.
  const fileMap = new Map<string, string>()
  const lowerMap = new Map<string, string>()
  for (const k of zip.names) {
    if (k.endsWith('/')) continue
    fileMap.set(k, k)
    lowerMap.set(k.toLowerCase(), k)
  }

  const readEntry = (path: string): string | null => {
    const key = fileMap.get(path) ?? lowerMap.get(path.toLowerCase())
    if (!key) return null
    let data: Uint8Array
    try {
      data = zip.read(key)
    } catch (err) {
      if (err instanceof ArchiveLimitError) throw new Error(`Invalid EPUB file — ${err.message}`)
      throw err
    }
    try {
      return decoder.decode(data)
    } catch {
      return null
    }
  }

  // 1. Locate OPF package document via META-INF/container.xml (or fallback scan)
  let opfPath: string | null = null
  const containerXml = readEntry('META-INF/container.xml')
  if (containerXml) {
    const rootAttrs = allOpeningTags(containerXml, 'rootfile')[0]
    if (rootAttrs !== undefined) {
      opfPath = getAttr(rootAttrs, 'full-path')
    }
  }
  if (!opfPath) {
    opfPath = [...fileMap.keys()].find((k) => k.toLowerCase().endsWith('.opf')) ?? null
  }
  if (!opfPath) {
    throw new Error('Invalid EPUB file — missing OPF package manifest')
  }

  const opfXml = readEntry(opfPath)
  if (!opfXml) {
    throw new Error(`Invalid EPUB file — could not read "${opfPath}"`)
  }

  const lastSlash = opfPath.lastIndexOf('/')
  const opfDir = lastSlash >= 0 ? opfPath.slice(0, lastSlash) : ''

  // 2. Metadata: dc:title & dc:creator
  const titleMatch = firstElement(opfXml, ['dc:title', 'title'])
  const creatorMatch = firstElement(opfXml, ['dc:creator', 'creator'])
  const bookTitle = titleMatch
    ? decodeHtmlEntities(replaceTags(titleMatch.inner, '').trim()) || 'Imported Book'
    : 'Imported Book'
  const author = creatorMatch
    ? decodeHtmlEntities(replaceTags(creatorMatch.inner, '').trim()) || null
    : null

  // 3. Manifest items (id -> { href, mediaType })
  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const attrs of allOpeningTags(opfXml, 'item')) {
    const id = getAttr(attrs, 'id')
    const href = getAttr(attrs, 'href')
    const mediaType = getAttr(attrs, 'media-type') ?? ''
    if (id && href) {
      manifest.set(id, { href: decodeURIComponent(href), mediaType })
    }
  }

  // 4. Spine reading order (<itemref idref="..."/>)
  const spineIds: string[] = []
  for (const attrs of allOpeningTags(opfXml, 'itemref')) {
    const linear = getAttr(attrs, 'linear')
    if (linear && linear.toLowerCase() === 'no') continue
    const idref = getAttr(attrs, 'idref')
    if (idref) spineIds.push(idref)
  }

  // Fallback if spine was empty: take all HTML/XHTML manifest items
  const orderedItems =
    spineIds.length > 0
      ? spineIds.map((id) => ({ id, item: manifest.get(id) })).filter((x) => Boolean(x.item))
      : [...manifest.entries()]
          .filter(([, it]) => /html|xml/i.test(it.mediaType) && !/ncx|nav/i.test(it.href))
          .map(([id, item]) => ({ id, item }))

  const chapters: EpubChapter[] = []
  for (const { id, item } of orderedItems) {
    if (!item) continue
    const resolvedPath = normalizeZipPath(opfDir, item.href)
    const rawChapter = readEntry(resolvedPath)
    if (rawChapter === null) {
      // A chapter the OPF lists but the archive lacks is refused, not silently dropped.
      throw new Error(`Invalid EPUB file — chapter "${item.href}" listed in the OPF is missing`)
    }

    assertHtmlWithinLimit(rawChapter, 'chapter')
    const bodyMatch = firstElement(rawChapter, ['body'])
    const bodyHtml = bodyMatch ? bodyMatch.inner : rawChapter
    const md = htmlFragmentToMarkdown(bodyHtml)
    if (md.length < 20) continue

    const chHeadingMatch = /^#{1,3}\s+(.+)$/m.exec(md)
    const htmlTitleMatch = firstElement(rawChapter, ['title'])
    const chTitle =
      chHeadingMatch?.[1]?.trim() ||
      (htmlTitleMatch ? decodeHtmlEntities(htmlTitleMatch.inner.trim()) : '') ||
      `Section ${chapters.length + 1}`

    chapters.push({ id, title: chTitle, content: md })
  }

  if (chapters.length === 0) {
    throw new Error('EPUB contains no readable text chapters (DRM-protected or image-only)')
  }

  const combined = chapters.map((c) => c.content).join('\n\n')
  return {
    title: bookTitle,
    author,
    content: combined,
    chapters,
  }
}

/**
 * Extract the main readable article title and Markdown body from a web page's HTML.
 */
export function extractArticleFromHtml(
  html: string,
  fallbackUrl?: string,
): { title: string; content: string } {
  assertHtmlWithinLimit(html, 'article')
  const cleaned = stripNonContentBlocks(html)

  // Title priority: og:title -> <title> -> first <h1> -> hostname
  let title = ''
  for (const attrs of allOpeningTags(cleaned, 'meta')) {
    if (getAttr(attrs, 'property')?.toLowerCase() !== 'og:title') continue
    const content = getAttr(attrs, 'content')
    if (content) {
      title = decodeHtmlEntities(content.trim())
      break
    }
  }
  if (!title) {
    const titleTag = firstElement(cleaned, ['title'])
    if (titleTag?.inner) title = decodeHtmlEntities(titleTag.inner.replace(/\s+/g, ' ').trim())
  }

  // Strip site chrome (<nav>, <header>, <footer>, <aside>, <form>) before choosing main region
  const chromeFree = replaceElements(
    cleaned,
    ['nav', 'footer', 'aside', 'form', 'menu', 'dialog'],
    () => ' ',
  )

  const articleMatch = firstElement(chromeFree, ['article'])
  const mainMatch = firstElement(chromeFree, ['main'])
  const bodyMatch = firstElement(chromeFree, ['body'])

  let candidateMd = ''
  for (const region of [articleMatch?.inner, mainMatch?.inner, bodyMatch?.inner, chromeFree]) {
    if (!region) continue
    const md = htmlFragmentToMarkdown(region)
    if (md.length >= 200) {
      candidateMd = md
      break
    }
    if (md.length > candidateMd.length) candidateMd = md
  }

  if (!title) {
    const h1 = /^#\s+(.+)$/m.exec(candidateMd)
    if (h1?.[1]) title = h1[1].trim()
  }
  if (!title && fallbackUrl) {
    try {
      title = new URL(fallbackUrl).hostname
    } catch {
      title = 'Web Article'
    }
  }

  return {
    title: title || 'Web Article',
    content: candidateMd.trim(),
  }
}

/** Parse a YouTube URL or 11-character ID into its canonical video ID. */
export function extractYoutubeVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
  try {
    const u = new URL(trimmed)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0] ?? ''
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = u.searchParams.get('v')
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
      const parts = u.pathname.split('/').filter(Boolean)
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
        return /^[a-zA-Z0-9_-]{11}$/.test(parts[1]) ? parts[1] : null
      }
    }
  } catch {
    return null
  }
  return null
}

function formatTimestamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`
}

/**
 * Extract the video title and preferred `captionTracks` URL from a YouTube watch HTML page.
 */
export function extractYoutubeCaptionTrackFromHtml(watchHtml: string): {
  title: string
  captionUrl: string | null
} {
  let title = 'YouTube Video'
  const titleMatch = firstElement(watchHtml, ['title'])
  if (titleMatch?.inner) {
    title = decodeHtmlEntities(titleMatch.inner.replace(/\s*-\s*YouTube\s*$/i, '').trim()) || title
  }

  // Locate `"captionTracks":[...]` inside ytInitialPlayerResponse
  const marker = '"captionTracks":['
  const idx = watchHtml.indexOf(marker)
  if (idx === -1) return { title, captionUrl: null }

  const arrayStart = idx + marker.length - 1
  let depth = 0
  let inStr = false
  let escaped = false
  let end = -1
  for (let i = arrayStart; i < Math.min(watchHtml.length, arrayStart + 50_000); i++) {
    const ch = watchHtml[i]!
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end === -1) return { title, captionUrl: null }

  try {
    const tracks = JSON.parse(watchHtml.slice(arrayStart, end)) as {
      baseUrl?: string
      languageCode?: string
      kind?: string
    }[]
    if (!Array.isArray(tracks) || tracks.length === 0) return { title, captionUrl: null }
    // Prefer manual English -> auto English -> first available track
    const best =
      tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
      tracks.find((t) => t.languageCode?.startsWith('en')) ??
      tracks[0]
    return { title, captionUrl: best?.baseUrl ?? null }
  } catch {
    return { title, captionUrl: null }
  }
}

/**
 * Parse YouTube `timedtext` XML (`<text start="...">` / `<p t="...">`) or `json3`
 * caption payloads into timestamped Markdown paragraphs (~60s sections).
 */
export function parseYoutubeCaptionPayload(payload: string): string {
  const trimmed = payload.trim()
  if (!trimmed) return ''

  interface Cue {
    sec: number
    text: string
  }
  const cues: Cue[] = []

  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as {
        events?: { tStartMs?: number; segs?: { utf8?: string }[] }[]
      }
      for (const ev of json.events ?? []) {
        const txt = (ev.segs ?? [])
          .map((s) => s.utf8 ?? '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
        if (txt) cues.push({ sec: (ev.tStartMs ?? 0) / 1000, text: txt })
      }
    } catch {
      // fall through
    }
  } else {
    for (const el of allElements(trimmed, ['text'])) {
      const start = Number(getAttr(el.attrs, 'start') ?? 0)
      const txt = decodeHtmlEntities(replaceTags(el.inner, ' ')).replace(/\s+/g, ' ').trim()
      if (txt) cues.push({ sec: Number.isFinite(start) ? start : 0, text: txt })
    }
    if (cues.length === 0) {
      for (const el of allElements(trimmed, ['p'])) {
        const tMs = Number(getAttr(el.attrs, 't') ?? 0)
        const txt = decodeHtmlEntities(replaceTags(el.inner, ' ')).replace(/\s+/g, ' ').trim()
        if (txt) cues.push({ sec: Number.isFinite(tMs) ? tMs / 1000 : 0, text: txt })
      }
    }
  }

  if (cues.length === 0) return ''

  // Group cues into ~60-second readable sections with ## [MM:SS] headings (feeds SQ3R Survey!)
  const sections: string[] = []
  let bucketStart = cues[0]!.sec
  let bucketWords: string[] = []

  const flush = () => {
    if (bucketWords.length === 0) return
    sections.push(`## ${formatTimestamp(bucketStart)}\n\n${bucketWords.join(' ')}`)
    bucketWords = []
  }

  for (const cue of cues) {
    if (bucketWords.length > 0 && cue.sec - bucketStart >= 60) {
      flush()
      bucketStart = cue.sec
    }
    bucketWords.push(cue.text)
  }
  flush()

  return sections.join('\n\n')
}

/**
 * Extract structural headings or major section landmarks from a reading source
 * for Step 1 (**Survey**) of Robinson's SQ3R method (1946).
 */
export function extractSurveyHeadings(content: string, maxHeadings = 15): string[] {
  const headings: string[] = []
  const seen = new Set<string>()

  const pushUnique = (raw: string) => {
    const clean = raw.replace(/\s+/g, ' ').trim()
    if (clean.length < 3 || clean.length > 140) return
    const key = clean.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    headings.push(clean)
  }

  // 1. Explicit Markdown headings (# .. ####)
  const mdRe = /^(#{1,4})\s+(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = mdRe.exec(content)) !== null) {
    pushUnique(m[2]!)
    if (headings.length >= maxHeadings) return headings
  }
  if (headings.length > 0) return headings

  // 2. Fallback for plain PDFs / pasted prose: short standalone title-like lines or paragraph topic sentences
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('#'))

  for (const p of paragraphs) {
    if (!p.includes('\n') && p.length >= 6 && p.length <= 80 && !/[.?!]$/.test(p)) {
      pushUnique(p)
      if (headings.length >= maxHeadings) return headings
    }
  }

  if (headings.length < 3) {
    const step = Math.max(
      1,
      Math.floor(paragraphs.length / Math.min(8, Math.max(1, paragraphs.length))),
    )
    for (let i = 0; i < paragraphs.length && headings.length < maxHeadings; i += step) {
      const firstSentence = (paragraphs[i]!.split(/(?<=[.?!])\s+/)[0] ?? paragraphs[i]!).slice(
        0,
        110,
      )
      pushUnique(firstSentence)
    }
  }

  return headings
}
