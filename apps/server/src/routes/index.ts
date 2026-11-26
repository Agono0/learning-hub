/**
 * Learning HUB headless server — route composition + dispatcher.
 *
 * Split from the former routes.ts monolith (TD-11). Area modules each own
 * their handlers and a Route[] table; this file concatenates them in the
 * original registration order and exposes the node:http dispatch entry.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { jsonError, sendError } from '../http'
import { systemRoutes } from './system'
import { reviewRoutes } from './review'
import { interleavingRoutes } from './interleaving'
import { cognitiveRoutes } from './cognitive'
import { advancedRoutes } from './advanced'
import { studiosRoutes } from './studios'
import { curriculumRoutes } from './curriculum'
import { ideasRoutes } from './ideas'
import { focusRoutes } from './focus'
import { habitsRoutes } from './habits'
import { notesRoutes } from './notes'
import { embodiedLearningRoutes } from './embodied-learning'
import { implementationIntentionRoutes } from './implementation-intentions'
import { leaguesRoutes } from './leagues'
import { feedbackRoutes } from './feedback'
import { shareChannelRoutes } from './share-channels'
import { tasksRoutes } from './tasks'
import { type Route } from './shared'

/**
 * All REST routes served by the headless server. The first six groups
 * reproduce the original routes.ts registration order (TD-11 split); the
 * domain groups below close the parity gaps — these domains were previously
 * served only by the web app, MCP and CLI.
 */
export type { Route } from './shared'

export const routes: Route[] = [
  ...systemRoutes,
  ...reviewRoutes,
  ...interleavingRoutes,
  ...cognitiveRoutes,
  ...advancedRoutes,
  ...studiosRoutes,
  ...curriculumRoutes,
  ...ideasRoutes,
  ...focusRoutes,
  ...habitsRoutes,
  ...notesRoutes,
  ...embodiedLearningRoutes,
  ...implementationIntentionRoutes,
  ...leaguesRoutes,
  ...feedbackRoutes,
  ...shareChannelRoutes,
  ...tasksRoutes,
]

export async function prototypeExemplarRouteJson(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const stream = Readable.from(body !== undefined ? [Buffer.from(JSON.stringify(body))] : [])
  const req = stream as unknown as IncomingMessage
  req.method = method
  req.url = path
  req.headers = { 'content-type': 'application/json' }
  let status = 200
  let responseData = ''
  const res = {
    statusCode: 200,
    setHeader: () => {},
    writeHead: (code: number) => {
      status = code
      return res
    },
    end: (chunk?: string | Buffer) => {
      if (chunk) responseData += chunk.toString()
    },
  } as unknown as ServerResponse
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route) {
    jsonError(res, 404, `Not found: ${method} ${path}`)
  } else {
    await route.handler(req, res, new URL(path, 'http://localhost'))
  }
  return {
    status: (res as unknown as { statusCode: number }).statusCode ?? status,
    data: responseData ? (JSON.parse(responseData) as Record<string, unknown>) : {},
  }
}

/**
 * Match the incoming request against the route table and run the handler with
 * error mapping (400/404/500 envelope). Unknown method+path → 404.
 */

export async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const method = (req.method ?? 'GET').toUpperCase()
    const route = routes.find((r) => r.method === method && r.path === url.pathname)
    if (!route) {
      jsonError(res, 404, `Not found: ${method} ${url.pathname}`)
      return
    }
    await route.handler(req, res, url)
  } catch (err) {
    sendError(res, err)
  }
}
