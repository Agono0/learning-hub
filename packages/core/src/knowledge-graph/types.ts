/**
 * Learning HUB — Knowledge Graph node/edge types and Zod schemas.
 *
 * Leaf module: only depends on zod, never on the barrel. The traversal engine
 * (`./traversal`) and `./index` both import from here so no module
 * self-barrels through `./index` (load-order fragile).
 */
import { z } from 'zod'

export const conceptNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().optional(),
  mastery: z.number().min(0).max(1).default(0),
  lapses: z.number().int().nonnegative().default(0),
})
export type ConceptNode = z.infer<typeof conceptNodeSchema>

export const prerequisiteEdgeSchema = z.object({
  from: z.string().min(1), // prerequisite concept
  to: z.string().min(1), // dependent concept
  strength: z.number().min(0).max(1).default(1.0),
})
export type PrerequisiteEdge = z.infer<typeof prerequisiteEdgeSchema>
