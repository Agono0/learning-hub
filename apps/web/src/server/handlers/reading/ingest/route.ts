/**
 * /api/reading/ingest — runtime-neutral remote & structured source ingestion:
 * - `mode: 'url'`     → fetches web article via `networkFetch` & extracts clean Markdown
 * - `mode: 'youtube'` → fetches YouTube watch page & timedtext captions via `networkFetch`
 * - `mode: 'epub'`    → extracts base64-encoded `.epub` archive via `extractEpubBytes`
 * - `mode: 'markdown'`→ saves Markdown/plain text with optional priority & URL
 */
import { z } from 'zod'
import { networkFetch } from '@learning-hub/ai-adapters'
import {
  extractArticleFromHtml,
  extractEpubBytes,
  extractYoutubeCaptionTrackFromHtml,
  extractYoutubeVideoId,
  parseYoutubeCaptionPayload,
} from '@learning-hub/core'
import { db, sources } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const ingestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('url'),
    url: z
      .string()
      .trim()
      .url()
      .refine((u) => /^https?:\/\//i.test(u), 'only http(s) URLs are allowed'),
    title: z.string().trim().max(300).optional(),
    priority: z.number().int().min(0).max(100).optional(),
  }),
  z.object({
    mode: z.literal('youtube'),
    url: z.string().trim().min(5).max(500),
    title: z.string().trim().max(300).optional(),
    priority: z.number().int().min(0).max(100).optional(),
  }),
  z.object({
    mode: z.literal('epub'),
    base64: z.string().min(16),
    title: z.string().trim().max(300).optional(),
    priority: z.number().int().min(0).max(100).optional(),
  }),
  z.object({
    mode: z.literal('markdown'),
    title: z.string().trim().min(1).max(300),
    content: z.string().trim().min(1),
    url: z.string().trim().max(500).optional(),
    priority: z.number().int().min(0).max(100).optional(),
  }),
])

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '')
  if (typeof atob === 'function') {
    const bin = atob(clean)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  const G = globalThis as unknown as {
    Buffer?: { from(s: string, enc: 'base64'): Uint8Array }
  }
  if (G.Buffer) return new Uint8Array(G.Buffer.from(clean, 'base64'))
  throw new Error('Base64 decoder unavailable')
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, ingestSchema)
  const priority = body.priority ?? 50

  if (body.mode === 'url') {
    let html: string
    try {
      const res = await networkFetch(body.url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; LearningHUB/1.0)',
        },
      })
      if (!res.ok) {
        return Response.json(
          { ok: false, error: `Could not fetch URL (HTTP ${res.status})` },
          { status: 502 },
        )
      }
      html = await res.text()
    } catch (err) {
      return Response.json(
        {
          ok: false,
          error: `Network error fetching URL: ${err instanceof Error ? err.message : 'failed'}`,
        },
        { status: 502 },
      )
    }

    const extracted = extractArticleFromHtml(html, body.url)
    if (!extracted.content || extracted.content.length < 40) {
      throw new ApiError(
        422,
        'Page returned too little readable article text (JavaScript-gated or paywalled) — paste the article text in the Markdown tab instead.',
      )
    }

    const [source] = await db
      .insert(sources)
      .values({
        kind: 'article',
        title: body.title || extracted.title,
        url: body.url,
        content: extracted.content,
        priority,
      })
      .returning()
    return Response.json({ ok: true, source, characters: extracted.content.length })
  }

  if (body.mode === 'youtube') {
    const videoId = extractYoutubeVideoId(body.url)
    if (!videoId) {
      throw new ApiError(
        400,
        'Enter a valid YouTube video URL (youtube.com/watch?v=… or youtu.be/…)',
      )
    }
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`

    let watchHtml: string
    try {
      const watchRes = await networkFetch(`${canonicalUrl}&hl=en`, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (compatible; LearningHUB/1.0)',
        },
      })
      if (!watchRes.ok) {
        return Response.json(
          { ok: false, error: `YouTube page fetch failed (HTTP ${watchRes.status})` },
          { status: 502 },
        )
      }
      watchHtml = await watchRes.text()
    } catch (err) {
      return Response.json(
        {
          ok: false,
          error: `Could not reach YouTube: ${err instanceof Error ? err.message : 'failed'}`,
        },
        { status: 502 },
      )
    }

    const { title: pageTitle, captionUrl } = extractYoutubeCaptionTrackFromHtml(watchHtml)
    if (!captionUrl) {
      return Response.json(
        {
          ok: false,
          error:
            'Captions are unavailable or disabled on this YouTube video — click "Show transcript" on YouTube and paste it in the Markdown tab.',
        },
        { status: 422 },
      )
    }

    const capRes = await networkFetch(captionUrl)
    if (!capRes.ok) {
      return Response.json(
        { ok: false, error: `Caption track download failed (HTTP ${capRes.status})` },
        { status: 502 },
      )
    }
    const transcript = parseYoutubeCaptionPayload(await capRes.text())
    if (!transcript) {
      return Response.json(
        {
          ok: false,
          error:
            'Caption track returned no text — paste the transcript manually in the Markdown tab.',
        },
        { status: 422 },
      )
    }

    const [source] = await db
      .insert(sources)
      .values({
        kind: 'youtube',
        title: body.title || pageTitle,
        url: canonicalUrl,
        content: transcript,
        priority,
      })
      .returning()
    return Response.json({ ok: true, source, characters: transcript.length })
  }

  if (body.mode === 'epub') {
    const bytes = base64ToBytes(body.base64)
    let extracted: ReturnType<typeof extractEpubBytes>
    try {
      extracted = extractEpubBytes(bytes)
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'Invalid EPUB')
    }
    const [source] = await db
      .insert(sources)
      .values({
        kind: 'epub',
        title: body.title || extracted.title,
        content: extracted.content,
        priority,
      })
      .returning()
    return Response.json({
      ok: true,
      source,
      chapters: extracted.chapters.length,
      characters: extracted.content.length,
    })
  }

  const [source] = await db
    .insert(sources)
    .values({
      kind: 'markdown',
      title: body.title,
      url: body.url || null,
      content: body.content,
      priority,
    })
    .returning()
  return Response.json({ ok: true, source, characters: body.content.length })
})
