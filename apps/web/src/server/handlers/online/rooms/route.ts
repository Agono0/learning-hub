/**
 * /api/online/rooms — Study Room proxy and room code generator.
 */
import { z } from 'zod'
import { makeRoomCode } from '@learning-hub/core/online'
import { getDefaultOnlineServer, getOnlineIdentity } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createRoomSchema = z.object({
  title: z.string().min(1).max(80),
  topic: z.string().max(80).optional(),
  pomodoroWorkMinutes: z.number().int().positive().default(25),
  pomodoroBreakMinutes: z.number().int().positive().default(5),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')?.toUpperCase()
  const server = getDefaultOnlineServer()

  if (!code) {
    return Response.json({ ok: true, server })
  }

  try {
    const res = await fetch(`${server}/api/v1/rooms/${code}/info`, {
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const data = await res.json()
      return Response.json({ ok: true, ...data, server })
    }
  } catch {
    // Worker offline fallback
  }

  // Graceful offline fallback room
  return Response.json({
    ok: true,
    server,
    room: {
      code,
      title: 'Study Room',
      timerMode: 'pomodoro',
      pomodoroWorkMinutes: 25,
      pomodoroBreakMinutes: 5,
      isBreak: false,
      participants: [],
    },
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createRoomSchema)
  const server = getDefaultOnlineServer()
  const identity = getOnlineIdentity()

  try {
    const res = await fetch(`${server}/api/v1/rooms/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })

    if (res.ok) {
      const data = (await res.json()) as any
      const wsUrl = `${server.replace(/^http/, 'ws')}/api/v1/rooms/${data.code}/ws`
      return Response.json({
        ok: true,
        code: data.code,
        room: data.room,
        wsUrl,
        userAlias: identity.alias,
      })
    }
  } catch {
    // Fallback to local room code if worker unreachable
  }

  const localCode = makeRoomCode()
  return Response.json({
    ok: true,
    code: localCode,
    room: {
      code: localCode,
      title: body.title,
      topic: body.topic,
      timerMode: 'pomodoro',
      pomodoroWorkMinutes: body.pomodoroWorkMinutes,
      pomodoroBreakMinutes: body.pomodoroBreakMinutes,
      isBreak: false,
      participants: [
        {
          id: identity.userId,
          alias: identity.alias,
          status: 'studying',
          streak: 1,
          cardsReviewed: 0,
          joinedAt: new Date().toISOString(),
        },
      ],
    },
    wsUrl: `${server.replace(/^http/, 'ws')}/api/v1/rooms/${localCode}/ws`,
    userAlias: identity.alias,
  })
})
