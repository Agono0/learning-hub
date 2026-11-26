/**
 * /api/social/guilds — Study Guild clans, member rosters & pooled XP.
 */
import { queryLimit } from '@/lib/query-params'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import {
  contributeGuildXp,
  createGuild,
  db,
  getGuild,
  guilds,
  joinGuild,
  listGuildMembers,
  listGuilds,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const guildActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(2).max(30),
    tag: z.string().trim().min(2).max(6),
    description: z.string().max(200).optional(),
    leaderAlias: z.string().trim().min(1).max(60),
    avatarEmoji: z.string().max(16).optional(),
  }),
  z.object({
    action: z.literal('join'),
    guildId: z.number().int().positive(),
    alias: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal('contribute'),
    guildId: z.number().int().positive(),
    alias: z.string().trim().min(1).max(60),
    xp: z.number().int().positive().max(100_000),
  }),
])

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (id) {
    const guild = getGuild(Number(id))
    if (!guild) {
      return Response.json({ ok: false, error: 'Guild not found' }, { status: 404 })
    }
    const members = listGuildMembers(guild.id)
    return Response.json({
      ok: true,
      guild,
      members,
    })
  }

  const limit = queryLimit(url.searchParams, 20, 50)
  const guildsList = listGuilds(limit)
  return Response.json({
    ok: true,
    guilds: guildsList,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, guildActionSchema)

  if (body.action === 'create') {
    const taken = db.select({ id: guilds.id }).from(guilds).where(eq(guilds.name, body.name)).get()
    if (taken) {
      return Response.json({ ok: false, error: 'A guild with that name exists' }, { status: 409 })
    }
    const guild = createGuild(body)
    return Response.json({ ok: true, guild })
  }

  if (body.action === 'join') {
    if (!joinGuild(body.guildId, body.alias)) {
      return Response.json({ ok: false, error: 'Guild not found' }, { status: 404 })
    }
    return Response.json({ ok: true })
  }

  if (body.action === 'contribute') {
    if (!getGuild(body.guildId)) {
      return Response.json({ ok: false, error: 'Guild not found' }, { status: 404 })
    }
    if (!contributeGuildXp(body.guildId, body.alias, body.xp)) {
      return Response.json(
        { ok: false, error: `${body.alias} is not a member of this guild` },
        { status: 403 },
      )
    }
    return Response.json({ ok: true, guild: getGuild(body.guildId) })
  }

  return Response.json({ ok: false, error: 'Invalid action' }, { status: 400 })
})
