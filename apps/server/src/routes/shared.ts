/**
 * Learning HUB headless server — shared contracts routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** One registered route: exact method + path match, query parsing left to the handler. */
export interface Route {
  method: 'GET' | 'POST'
  path: string
  summary: string
  handler: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void
}

/** Schemas shared by more than one route area. */
