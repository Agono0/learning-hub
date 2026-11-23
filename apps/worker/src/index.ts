/**
 * Learning HUB Cloudflare Worker — Live Study Rooms, Boss Raids,
 * Community Deck/Course Library, and Global Opt-in Engagement.
 */
import { communityItemSchema, filterContentSafety, makeRoomCode } from '@learning-hub/core/online'
import { BOSS_ROSTER } from '@learning-hub/core/boss'
import { BossRaid } from './boss-raid'
import { StudyRoom } from './study-room'
import { handleCrashTelemetry } from './telemetry'

export { StudyRoom, BossRaid }

export interface Env {
  DB: D1Database
  STUDY_ROOM: DurableObjectNamespace
  BOSS_RAID: DurableObjectNamespace
  GITHUB_ISSUE_TOKEN?: string
  GITHUB_REPO?: string
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  }
}

/** A community_library row as stored in D1 (tags is a JSON array string). */
interface LibraryRow {
  id: string
  type: string
  title: string
  description: string | null
  author: string
  downloads: number
  rating: number
  tags: string | null
  share_string: string
  published_at: string
}

/** Tags column → string[]; a corrupt value yields [] instead of failing the search. */
function parseTags(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // ── Health ──────────────────────────────────────────────────────────
      if (path === '/health' || path === '/') {
        return jsonResponse({
          ok: true,
          worker: 'learning-hub-engagement',
          version: '1.0.0',
        })
      }

      // ── Auth: Register Device Key ────────────────────────────────────────
      if (path === '/api/v1/auth/register-key' && request.method === 'POST') {
        const body = (await request.json()) as {
          pubkey: string
          alias: string
          challenge?: string
          signature?: string
        }
        if (!body.pubkey || !body.alias) {
          return jsonResponse({ error: 'pubkey and alias are required' }, 400)
        }

        // Signature verification (ECDSA P-256 / SHA-256 over the challenge).
        // A signed challenge binds the alias to a key only its owner controls.
        if (!body.challenge || !body.signature) {
          return jsonResponse({ error: 'challenge and signature are required' }, 400)
        }
        if (!body.challenge.startsWith('lh-identity:v1:')) {
          return jsonResponse({ error: 'invalid challenge format' }, 400)
        }
        try {
          const pubRaw = Uint8Array.from(atob(body.pubkey), (c) => c.charCodeAt(0))
          const sigRaw = Uint8Array.from(atob(body.signature), (c) => c.charCodeAt(0))
          const cryptoKey = await crypto.subtle.importKey(
            'spki',
            pubRaw.buffer,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          )
          // The signed payload binds challenge + alias: a signature is only
          // valid for exactly this alias (no replay under another name).
          const signingPayload = `${body.challenge}|${body.alias}`
          const ok = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            cryptoKey,
            sigRaw.buffer,
            new TextEncoder().encode(signingPayload),
          )
          if (!ok) return jsonResponse({ error: 'signature verification failed' }, 401)
        } catch {
          return jsonResponse({ error: 'malformed key or signature' }, 400)
        }

        const userId = `usr_${body.pubkey.slice(0, 16)}`
        const nowIso = new Date().toISOString()
        const { clean: cleanAlias } = filterContentSafety(body.alias.slice(0, 40))

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO users (id, pubkey, alias, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(pubkey) DO UPDATE SET alias = excluded.alias`,
          )
            .bind(userId, body.pubkey, cleanAlias, nowIso)
            .run()
        }

        return jsonResponse({ ok: true, userId, alias: cleanAlias })
      }

      // ── Live Study Rooms ─────────────────────────────────────────────────
      if (path === '/api/v1/rooms/create' && request.method === 'POST') {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          title?: string
          topic?: string
          pomodoroWorkMinutes?: number
          pomodoroBreakMinutes?: number
        }

        const code = makeRoomCode()
        const id = env.STUDY_ROOM.idFromName(code)
        const roomObj = env.STUDY_ROOM.get(id)

        const title = body.title?.trim() || 'Focus Session'
        const { clean: cleanTitle } = filterContentSafety(title)

        const initRes = await roomObj.fetch('http://do/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            title: cleanTitle,
            topic: body.topic,
            pomodoroWorkMinutes: body.pomodoroWorkMinutes ?? 25,
            pomodoroBreakMinutes: body.pomodoroBreakMinutes ?? 5,
          }),
        })
        const data = await initRes.json()
        return jsonResponse({ ok: true, code, ...data })
      }

      // WebSocket Upgrade: /api/v1/rooms/:code/ws
      const roomWsMatch = path.match(/^\/api\/v1\/rooms\/([A-Z0-9]{6})\/ws$/)
      if (roomWsMatch) {
        const code = roomWsMatch[1]!
        const id = env.STUDY_ROOM.idFromName(code)
        const roomObj = env.STUDY_ROOM.get(id)
        return roomObj.fetch(request)
      }

      // Room Info: /api/v1/rooms/:code/info
      const roomInfoMatch = path.match(/^\/api\/v1\/rooms\/([A-Z0-9]{6})\/info$/)
      if (roomInfoMatch) {
        const code = roomInfoMatch[1]!
        const id = env.STUDY_ROOM.idFromName(code)
        const roomObj = env.STUDY_ROOM.get(id)
        const res = await roomObj.fetch('http://do/info')
        const data = await res.json()
        return jsonResponse(data)
      }

      // ── Party Boss Raids ─────────────────────────────────────────────────
      if (path === '/api/v1/raids/create' && request.method === 'POST') {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          bossKey?: string
        }
        const bossKey = body.bossKey ?? 'chronos'
        const boss = BOSS_ROSTER[bossKey] ?? BOSS_ROSTER['chronos']!
        const raidId = `raid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

        const id = env.BOSS_RAID.idFromName(raidId)
        const raidObj = env.BOSS_RAID.get(id)

        const initRes = await raidObj.fetch('http://do/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: raidId,
            bossKey: boss.key,
            bossName: boss.name,
            bossHp: boss.maxHp * 2, // scaled for party raid
            bossMaxHp: boss.maxHp * 2,
            partyHp: 500,
            partyMaxHp: 500,
            status: 'waiting',
          }),
        })
        const data = await initRes.json()
        return jsonResponse({ ok: true, raidId, ...data })
      }

      // WebSocket Upgrade: /api/v1/raids/:id/ws
      const raidWsMatch = path.match(/^\/api\/v1\/raids\/([a-zA-Z0-9_-]+)\/ws$/)
      if (raidWsMatch) {
        const raidId = raidWsMatch[1]!
        const id = env.BOSS_RAID.idFromName(raidId)
        const raidObj = env.BOSS_RAID.get(id)
        return raidObj.fetch(request)
      }

      // ── Community Library ────────────────────────────────────────────────
      if (path === '/api/v1/library/search' && request.method === 'GET') {
        const q = url.searchParams.get('q')?.toLowerCase() ?? ''
        const type = url.searchParams.get('type')

        if (!env.DB) {
          return jsonResponse({ ok: true, items: [] })
        }

        let query = 'SELECT * FROM community_library WHERE 1=1'
        const params: D1Value[] = []

        if (type) {
          query += ' AND type = ?'
          params.push(type)
        }
        if (q) {
          // Escape LIKE wildcards so a search for "100%" or "a_b" is literal.
          const needle = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
          query += " AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')"
          params.push(needle, needle)
        }
        query += ' ORDER BY downloads DESC LIMIT 50'

        const results = await env.DB.prepare(query)
          .bind(...params)
          .all<LibraryRow>()
        const items = results.results.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          description: r.description,
          author: r.author,
          downloads: r.downloads,
          rating: r.rating,
          tags: parseTags(r.tags),
          shareString: r.share_string,
          publishedAt: r.published_at,
        }))

        return jsonResponse({ ok: true, items })
      }

      if (path === '/api/v1/library/publish' && request.method === 'POST') {
        const body = await request.json()
        const parsed = communityItemSchema.parse({
          id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          downloads: 0,
          rating: 5.0,
          publishedAt: new Date().toISOString(),
          ...body,
        })

        const { clean: cleanTitle } = filterContentSafety(parsed.title)
        const { clean: cleanDesc } = filterContentSafety(parsed.description ?? '')

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO community_library (id, type, title, description, author, downloads, rating, tags, share_string, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              parsed.id,
              parsed.type,
              cleanTitle,
              cleanDesc,
              parsed.author,
              0,
              5.0,
              JSON.stringify(parsed.tags),
              parsed.shareString,
              parsed.publishedAt,
            )
            .run()
        }

        return jsonResponse({ ok: true, item: parsed })
      }

      if (path === '/api/v1/library/download' && request.method === 'POST') {
        const raw: unknown = await request.json().catch(() => null)
        const id = (raw as { id?: unknown } | null)?.id
        if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
          return jsonResponse({ error: 'id required' }, 400)
        }
        const body = { id }

        if (env.DB) {
          await env.DB.prepare(
            'UPDATE community_library SET downloads = downloads + 1 WHERE id = ?',
          )
            .bind(body.id)
            .run()

          const item = await env.DB.prepare(
            'SELECT share_string FROM community_library WHERE id = ?',
          )
            .bind(body.id)
            .first<{ share_string: string }>()

          if (!item) return jsonResponse({ error: 'Item not found' }, 404)
          return jsonResponse({ ok: true, shareString: item.share_string })
        }

        return jsonResponse({ ok: true, shareString: '' })
      }

      // ── Global Opt-in Leaderboard ────────────────────────────────────────
      if (path === '/api/v1/leaderboard' && request.method === 'GET') {
        if (!env.DB) {
          return jsonResponse({ ok: true, leaderboard: [] })
        }

        const rows = await env.DB.prepare(
          'SELECT user_id, alias, weekly_xp, streak, level, updated_at FROM public_stats ORDER BY weekly_xp DESC LIMIT 50',
        ).all()

        return jsonResponse({ ok: true, leaderboard: rows.results })
      }

      if (path === '/api/v1/stats/sync' && request.method === 'POST') {
        const body = (await request.json()) as {
          userId: string
          alias: string
          weeklyXp: number
          streak: number
          level: number
        }

        if (!body.userId || !body.alias) {
          return jsonResponse({ error: 'userId and alias required' }, 400)
        }

        const nowIso = new Date().toISOString()
        const { clean: cleanAlias } = filterContentSafety(body.alias.slice(0, 40))

        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO public_stats (user_id, alias, weekly_xp, streak, level, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               alias = excluded.alias,
               weekly_xp = excluded.weekly_xp,
               streak = excluded.streak,
               level = excluded.level,
               updated_at = excluded.updated_at`,
          )
            .bind(
              body.userId,
              cleanAlias,
              Math.max(0, Number(body.weeklyXp) || 0),
              Math.max(0, Number(body.streak) || 0),
              Math.max(1, Number(body.level) || 1),
              nowIso,
            )
            .run()
        }

        return jsonResponse({ ok: true })
      }

      // ── Crash Telemetry ──────────────────────────────────────────────────
      if (path === '/api/v1/telemetry/crash' && request.method === 'POST') {
        return handleCrashTelemetry(request, env)
      }

      return jsonResponse({ error: 'Not found' }, 404)
    } catch (err: unknown) {
      return jsonResponse({ error: (err instanceof Error && err.message) || 'Internal error' }, 500)
    }
  },
}
