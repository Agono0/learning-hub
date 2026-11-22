/**
 * Helpers shared by the tasks handlers (S3-16) — not a route (no HTTP
 * method exports; the hub-registry walker only picks up `route.ts`).
 *
 * The repos own referential integrity (SQLite FKs are off) and the core
 * domain throws {@link TaskDomainError} for illegal transitions — this
 * module maps both onto HTTP statuses once, for every tasks route:
 *
 * - `TaskDomainError` → 400 with the stable domain `code`;
 * - repo `"<kind> #<id> not found"` → 404;
 * - `Tag "x" already exists` → 409;
 * - `Unknown tag ids: …` → 400;
 * - anything else rethrows (withRoute sanitizes to a 500).
 */
import { TaskDomainError } from '@learning-hub/core'

/** Route context for `[id]` handlers (Next passes params as a Promise). */
export type IdContext = { params: Promise<{ id: string }> }

/** The positive integer `:id` of a route, or null when it is not one. */
export async function routeId(ctx: IdContext): Promise<number | null> {
  const id = Number((await ctx.params).id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Map a tasks-domain/repository error onto a JSON response, or rethrow it
 * for `withRoute`'s generic handling (ApiError passes through, unknown → 500).
 */
export function taskErrorResponse(err: unknown): Response {
  if (err instanceof TaskDomainError) {
    return Response.json({ error: err.message, code: err.code }, { status: 400 })
  }
  if (err instanceof Error) {
    if (/not found$/i.test(err.message)) {
      return Response.json({ error: err.message }, { status: 404 })
    }
    if (/already exists/i.test(err.message)) {
      return Response.json({ error: err.message }, { status: 409 })
    }
    if (/Unknown tag ids/i.test(err.message)) {
      return Response.json({ error: err.message }, { status: 400 })
    }
  }
  throw err
}

/** Standard 404 body for tasks resources. */
export const taskNotFound = () => Response.json({ error: 'Task not found' }, { status: 404 })
