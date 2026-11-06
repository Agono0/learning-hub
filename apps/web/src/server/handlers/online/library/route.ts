/**
 * /api/online/library — Community Deck & Course Library proxy.
 */
import { z } from 'zod'
import { communityItemSchema } from '@learning-hub/core/online'
import { getDefaultOnlineServer, getOnlineIdentity } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const publishSchema = z.object({
  type: z.enum(['deck', 'course']),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).default([]),
  shareString: z.string().min(1),
})

const FEATURED_ITEMS = [
  {
    id: 'feat-1',
    type: 'deck',
    title: 'Cognitive Science & Memory Biases',
    description: '30 key heuristics and biases (Kahneman, Tversky) with retrieval questions.',
    author: 'Curator',
    downloads: 142,
    rating: 4.9,
    tags: ['psychology', 'biases'],
    shareString: 'LH1_featured_cognitive_deck',
    publishedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'feat-2',
    type: 'course',
    title: 'SQL Essentials & Relational Algebra',
    description: 'Interactive course covering joins, subqueries, and window functions.',
    author: 'Curator',
    downloads: 98,
    rating: 4.8,
    tags: ['sql', 'database'],
    shareString: 'LH1_featured_sql_course',
    publishedAt: '2026-01-01T00:00:00.000Z',
  },
]

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const type = url.searchParams.get('type') ?? ''
  const server = getDefaultOnlineServer()

  try {
    const targetUrl = new URL(`${server}/api/v1/library/search`)
    if (q) targetUrl.searchParams.set('q', q)
    if (type) targetUrl.searchParams.set('type', type)

    const res = await fetch(targetUrl.toString(), {
      signal: AbortSignal.timeout(4000),
    })

    if (res.ok) {
      const data = await res.json()
      return Response.json(data)
    }
  } catch {
    // Worker offline fallback
  }

  // Filter featured items locally if offline
  const filtered = FEATURED_ITEMS.filter((item) => {
    if (type && item.type !== type) return false
    if (q && !item.title.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return Response.json({ ok: true, items: filtered, offlineFallback: true })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, publishSchema)
  const server = getDefaultOnlineServer()
  const identity = getOnlineIdentity()

  const payload = {
    ...body,
    author: identity.alias,
  }

  try {
    const res = await fetch(`${server}/api/v1/library/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })

    if (res.ok) {
      const data = await res.json()
      return Response.json(data)
    }
  } catch {
    // Offline simulated publish
  }

  const simulated = communityItemSchema.parse({
    id: `item_local_${Date.now()}`,
    ...payload,
    downloads: 0,
    rating: 5.0,
    publishedAt: new Date().toISOString(),
  })

  return Response.json({ ok: true, item: simulated, localOnly: true })
})
