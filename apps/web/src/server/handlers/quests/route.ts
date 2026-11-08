import { z } from 'zod'
import { ensurePluginsLoaded } from '@/lib/plugins'
import { completeQuestItem, getOrCreateDailyQuests } from '@learning-hub/db'
import { eventBus } from '@learning-hub/core'
import { readJson, tzOffsetFromQuery, tzOffsetSchema, withRoute } from '@/lib/api'

/** GET /api/quests?tzOffset=N — today's quests with live progress from real data. */
export async function GET(req: Request) {
  const tz = tzOffsetFromQuery(req)
  const result = getOrCreateDailyQuests({ tzOffset: tz })

  return Response.json({
    date: result.date,
    items: result.items,
    allDone: result.allDone,
    completed: result.completed,
    xpReward: result.xpReward,
  })
}

const questPostSchema = z.object({
  index: z.number().int().min(0, 'Invalid quest index'),
  tzOffset: tzOffsetSchema,
})

/** POST /api/quests { index, tzOffset? } — mark quest item done; completing ALL pays the quest XP once. */
export const POST = withRoute(async (req: Request) => {
  await ensurePluginsLoaded() // plugins must be registered before events can fire
  const body = await readJson(req, questPostSchema)

  const result = completeQuestItem({
    index: body.index,
    tzOffset: body.tzOffset,
  })

  if (!result.success) {
    return Response.json(
      { error: result.error === 'invalid_index' ? 'Invalid quest index' : 'No quests for today' },
      { status: result.error === 'invalid_index' ? 400 : 404 },
    )
  }

  // This request flipped the guarded `completed` flag (XP paid once) —
  // publish quest.completed after the commit. The quest's date is its stable id.
  if (result.xpAwarded > 0) {
    eventBus.emit('quest.completed', { questId: result.date })
  }

  return Response.json({
    ok: true,
    items: result.items,
    allDone: result.allDone,
    xpAwarded: result.xpAwarded,
  })
})
