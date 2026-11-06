/**
 * /api/social/guilds — Study Guild clans, member rosters & pooled XP.
 */
import { z } from 'zod'
import {
  contributeGuildXp,
  createGuild,
  getGuild,
  joinGuild,
  listGuildMembers,
  listGuilds,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const guildActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().min(2).max(30),
    tag: z.string().min(2).max(6),
    description: z.string().max(200).optional(),
    leaderAlias: z.string().min(1),
    avatarEmoji: z.string().optional(),
  }),
  z.object({
    action: z.literal('join'),
    guildId: z.number().int().positive(),
    alias: z.string().min(1),
  }),
  z.object({
    action: z.literal('contribute'),
    guildId: z.number().int().positive(),
    alias: z.string().min(1),
    xp: z.number().int().positive(),
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

  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)))
  const guildsList = listGuilds(limit)
  return Response.json({
    ok: true,
    guilds: guildsList,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, guildActionSchema)

  if (body.action === 'create') {
    const guild = createGuild(body)
    return Response.json({ ok: true, guild })
  }

  if (body.action === 'join') {
    const joined = joinGuild(body.guildId, body.alias)
    return Response.json({ ok: joined })
  }

  if (body.action === 'contribute') {
    contributeGuildXp(body.guildId, body.alias, body.xp)
    const updated = getGuild(body.guildId)
    return Response.json({ ok: true, guild: updated })
  }

  return Response.json({ ok: false, error: 'Invalid action' }, { status: 400 })
})
