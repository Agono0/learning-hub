/**
 * /api/world/avatar — Equip and customize the 3D low-poly character avatar.
 */
import { z } from 'zod'
import { getUserAvatar, updateUserAvatar } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const avatarUpdateSchema = z.object({
  characterId: z.string().optional(),
  equippedHead: z.string().nullable().optional(),
  equippedHand: z.string().nullable().optional(),
  equippedCompanion: z.string().nullable().optional(),
  equippedSkin: z.string().optional(),
})

export const GET = withRoute(async () => {
  const avatar = getUserAvatar('default')
  return Response.json({
    ok: true,
    avatar,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, avatarUpdateSchema)
  const current = getUserAvatar('default')

  // Validation: Ensure equipped items are actually unlocked
  if (body.characterId && !current.unlockedCharacters.includes(body.characterId)) {
    return Response.json(
      { ok: false, error: `Character ${body.characterId} is not unlocked` },
      { status: 400 },
    )
  }

  if (body.equippedHead && !current.unlockedItems.includes(body.equippedHead)) {
    return Response.json(
      { ok: false, error: `Accessory ${body.equippedHead} is not unlocked` },
      { status: 400 },
    )
  }

  if (body.equippedHand && !current.unlockedItems.includes(body.equippedHand)) {
    return Response.json(
      { ok: false, error: `Accessory ${body.equippedHand} is not unlocked` },
      { status: 400 },
    )
  }

  if (body.equippedCompanion && !current.unlockedItems.includes(body.equippedCompanion)) {
    return Response.json(
      { ok: false, error: `Companion ${body.equippedCompanion} is not unlocked` },
      { status: 400 },
    )
  }

  const updated = updateUserAvatar('default', {
    ...(body.characterId ? { characterId: body.characterId } : {}),
    ...(body.equippedHead !== undefined ? { equippedHead: body.equippedHead } : {}),
    ...(body.equippedHand !== undefined ? { equippedHand: body.equippedHand } : {}),
    ...(body.equippedCompanion !== undefined ? { equippedCompanion: body.equippedCompanion } : {}),
    ...(body.equippedSkin ? { equippedSkin: body.equippedSkin } : {}),
  })

  return Response.json({
    ok: true,
    avatar: updated,
  })
})
