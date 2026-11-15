/**
 * GET /api/insights/untested — the "Read but never tested" panel (fluency
 * illusion): reading sources and notes that were consumed but produced zero
 * retrieval practice (no cards mined from them), most-recently-opened first,
 * capped at 20.
 *
 * Lives under insights (not analytics) because it is a study-behavior
 * diagnosis — "what to change about your studying" — rather than a performance
 * chart: analytics answers "how well did you recall", this answers "what did
 * you never test at all". The SQL filter and cap live in the db repo
 * (listUntestedMaterial), the ranking policy in core (rankUntestedMaterial);
 * the whole response is zod-validated at the boundary before returning, the
 * same contract as /api/weekly.
 */
import { untestedMaterialResponseSchema } from '@learning-hub/core'
import { listUntestedMaterial } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

/** GET /api/insights/untested — the zod-validated untested-material list. */
export const GET = withRoute(async () => {
  const items = listUntestedMaterial()
  const response = untestedMaterialResponseSchema.parse({ items })
  return Response.json(response)
})
