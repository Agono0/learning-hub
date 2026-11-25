/**
 * /api/reading/ingest — runtime-neutral remote & structured source ingestion:
 * - `mode: 'url'`     → fetches web article via `boundedFetchText` & extracts clean Markdown
 * - `mode: 'youtube'` → fetches YouTube watch page & timedtext captions via `boundedFetchText`
 * - `mode: 'epub'`    → extracts base64-encoded `.epub` archive via `extractEpubBytes`
 * - `mode: 'markdown'`→ saves Markdown/plain text with optional priority & URL
 */
import { z } from 'zod'
import {
  extractArticleFromHtml,
  extractEpubBytes,
  extractYoutubeCaptionTrackFromHtml,
  extractYoutubeVideoId,
  parseYoutubeCaptionPayload,
} from '@learning-hub/core'
import { createSource } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'
import { boundedFetchText, BoundedFetchError } from '@/server/bounded-fetch'

/** Article HTML cap: real pages are well under 5 MB; larger bodies are refused, not truncated. */
const MAX_ARTICLE_BYTES = 5 * 1024 * 1024
/** EPUB base64 payload cap, matching the 50 MB apkg import contract. */
const MAX_EPUB_BASE64 = 50 * 1024 * 1024
import { htmlLimitError } from '@/lib/html-limit'

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
    base64: z.string().min(16).max(MAX_EPUB_BASE64, 'EPUB payload exceeds the 50MB base64 limit'),
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

const MAX_YOUTUBE_PAGE_BYTES = 5 * 1024 * 1024
const MAX_YOUTUBE_CAPTION_BYTES = 2 * 1024 * 1024

/** Fixed, generic failure for a refused or failed YouTube fetch: never echoes a URL or message. */
function youtubeFetchFailure(err: unknown, what: 'page' | 'captions'): Response {
  const subject = what === 'page' ? 'the YouTube page' : 'the caption track'
  if (err instanceof BoundedFetchError && err.code === 'too-large') {
    return Response.json({ ok: false, error: `${subject} is too large to import` }, { status: 413 })
  }
  if (err instanceof BoundedFetchError && err.code === 'blocked') {
    return Response.json(
      { ok: false, error: `Fetching ${subject} was refused for safety` },
      { status: 502 },
    )
  }
  return Response.json({ ok: false, error: `Could not fetch ${subject}` }, { status: 502 })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, ingestSchema)
  const priority = body.priority ?? 50

  if (body.mode === 'url') {
    let html: string
    try {
      const res = await boundedFetchText(body.url, {
        allowHttp: true,
        maxBytes: MAX_ARTICLE_BYTES,
        timeoutMs: 20_000,
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
      html = res.text
    } catch (err) {
      if (err instanceof BoundedFetchError && err.code === 'blocked') {
        throw new ApiError(400, err.message)
      }
      if (err instanceof BoundedFetchError && err.code === 'too-large') {
        throw new ApiError(413, 'The page is too large to import (5MB limit)')
      }
      return Response.json(
        {
          ok: false,
          error: `Network error fetching URL: ${err instanceof Error ? err.message : 'failed'}`,
        },
        { status: 502 },
      )
    }

    let extracted: ReturnType<typeof extractArticleFromHtml>
    try {
      extracted = extractArticleFromHtml(html, body.url)
    } catch (err) {
      throw htmlLimitError(err) ?? err
    }
    if (!extracted.content || extracted.content.length < 40) {
      throw new ApiError(
        422,
        'Page returned too little readable article text (JavaScript-gated or paywalled) — paste the article text in the Markdown tab instead.',
      )
    }

    const source = createSource({
      kind: 'article',
      title: body.title || extracted.title,
      url: body.url,
      content: extracted.content,
      priority,
    })
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

    // Both requests are bounded (https, public destination, pinned on Node, manual redirects,
    // byte cap). The caption URL comes from the fetched page, so it gets no extra trust. No
    // host allowlist: caption URL hosts are undocumented and vary, so one would risk breaking
    // valid captions without a source to check it against.
    let watchHtml: string
    try {
      const watchRes = await boundedFetchText(`${canonicalUrl}&hl=en`, {
        maxBytes: MAX_YOUTUBE_PAGE_BYTES,
        timeoutMs: 20_000,
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
      watchHtml = watchRes.text
    } catch (err) {
      return youtubeFetchFailure(err, 'page')
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

    let captionText: string
    try {
      const capRes = await boundedFetchText(captionUrl, {
        maxBytes: MAX_YOUTUBE_CAPTION_BYTES,
        timeoutMs: 20_000,
      })
      if (!capRes.ok) {
        return Response.json(
          { ok: false, error: `Caption track download failed (HTTP ${capRes.status})` },
          { status: 502 },
        )
      }
      captionText = capRes.text
    } catch (err) {
      return youtubeFetchFailure(err, 'captions')
    }
    const transcript = parseYoutubeCaptionPayload(captionText)
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

    const source = createSource({
      kind: 'youtube',
      title: body.title || pageTitle,
      url: canonicalUrl,
      content: transcript,
      priority,
    })
    return Response.json({ ok: true, source, characters: transcript.length })
  }

  if (body.mode === 'epub') {
    const bytes = base64ToBytes(body.base64)
    let extracted: ReturnType<typeof extractEpubBytes>
    try {
      extracted = extractEpubBytes(bytes)
    } catch (err) {
      throw (
        htmlLimitError(err) ??
        new ApiError(400, err instanceof Error ? err.message : 'Invalid EPUB')
      )
    }
    const source = createSource({
      kind: 'epub',
      title: body.title || extracted.title,
      content: extracted.content,
      priority,
    })
    return Response.json({
      ok: true,
      source,
      chapters: extracted.chapters.length,
      characters: extracted.content.length,
    })
  }

  const source = createSource({
    kind: 'markdown',
    title: body.title,
    url: body.url || null,
    content: body.content,
    priority,
  })
  return Response.json({ ok: true, source, characters: body.content.length })
})
