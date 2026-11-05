/**
 * Helpers shared by the curriculum handlers (not a route — no HTTP exports).
 */

/** Route context for `[id]` handlers (Next passes params as a Promise). */
export type IdContext = { params: Promise<{ id: string }> }

/** The positive integer `:id` of a route, or null when it is not one. */
export async function routeId(ctx: IdContext): Promise<number | null> {
  const id = Number((await ctx.params).id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Standard 404 body for curriculum resources. */
export const notFound = (what: string) =>
  Response.json({ error: `${what} not found` }, { status: 404 })
