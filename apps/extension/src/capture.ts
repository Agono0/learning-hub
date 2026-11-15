/**
 * Context-menu capture — pure request builders + a transport-agnostic sender.
 *
 * Kept free of `chrome.*` so it can be unit-tested in Node. The service worker
 * supplies `fetch` and the candidate base URLs (native loopback bridge first,
 * then the local web dev server).
 */

/** Max characters of a selection we turn into a card front (avoid giant cards). */
export const MAX_CARD_FRONT = 1000

export interface CaptureRequest {
  path: string
  body: unknown
}

/** Candidate backends, in priority order: native loopback, then web dev server. */
export function captureEndpoints(loopbackPort: number): string[] {
  return [`http://127.0.0.1:${loopbackPort}`, 'http://localhost:3000']
}

/**
 * Builds the `/api/reading/ingest` request for "Save to Reader".
 * Returns null for non-http(s) targets (chrome://, file://…), which the
 * ingest handler would reject anyway.
 */
export function buildReaderIngest(
  targetUrl: string | undefined,
  title: string | undefined,
): CaptureRequest | null {
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) return null
  const cleanTitle = title?.trim().slice(0, 300)
  return {
    path: '/api/reading/ingest',
    body: { mode: 'url', url: targetUrl, ...(cleanTitle ? { title: cleanTitle } : {}) },
  }
}

/**
 * Builds the `/api/cards` request for "Create Flashcard from selection".
 * Returns null when the selection is blank.
 */
export function buildCardCreate(
  selection: string | undefined,
  deckId: number,
  sourceUrl: string | undefined,
): CaptureRequest | null {
  const front = selection?.replace(/\s+/g, ' ').trim().slice(0, MAX_CARD_FRONT)
  if (!front) return null
  const source = sourceUrl ?? null
  return {
    path: '/api/cards',
    body: {
      deckId,
      type: 'basic',
      content: { basic: { front, back: source ? `Source: ${source}` : 'Captured from the web' } },
      tags: ['browser-captured'],
      source,
    },
  }
}

/** Picks the deck for captured cards: the first deck the backend lists. */
export function pickDeckId(payload: unknown): number | null {
  const decks = (payload as { decks?: Array<{ id?: unknown }> } | null)?.decks
  if (!Array.isArray(decks)) return null
  for (const d of decks) {
    if (typeof d?.id === 'number' && d.id > 0) return d.id
  }
  return null
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Tries each base URL until one answers 2xx. Returns the base that succeeded
 * (so follow-up calls hit the same backend) or null if none did.
 */
export async function sendToFirst(
  fetchFn: FetchLike,
  bases: string[],
  req: CaptureRequest,
): Promise<{ base: string; res: Response } | null> {
  for (const base of bases) {
    try {
      const res = await fetchFn(`${base}${req.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      })
      if (res.ok) return { base, res }
    } catch {
      // backend not reachable — try the next one
    }
  }
  return null
}

/** Finds the first reachable backend that has at least one deck. */
export async function resolveDeck(
  fetchFn: FetchLike,
  bases: string[],
): Promise<{ base: string; deckId: number } | null> {
  for (const base of bases) {
    try {
      const res = await fetchFn(`${base}/api/decks`)
      if (!res.ok) continue
      const deckId = pickDeckId(await res.json())
      if (deckId) return { base, deckId }
    } catch {
      // try next
    }
  }
  return null
}
