/**
 * Mutation vocabulary for the signed league authority. Kept separate from
 * signed.ts so the reducer and the envelope verifier share one definition.
 *
 * No mutation carries a client timestamp, elapsed time, score or handle:
 * the authority derives the actor from the signing key and stamps all timing
 * itself. Duel prompts and accepted answers are the only content a client
 * supplies, and prompt content is bounded.
 */
import { z } from 'zod'

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)

export const DuelPromptInputSchema = z.object({
  id,
  question: z.string().min(1).max(400),
  answers: z.array(z.string().min(1).max(200)).min(1).max(8),
})

export const LeagueMutationSchema = z.discriminatedUnion('type', [
  /** Join the league as the signing key. Alias is display-only. */
  z.object({ type: z.literal('join'), alias: z.string().min(1).max(40) }),
  /** Challenge another joined member to a duel the challenger authors. */
  z.object({
    type: z.literal('duel-open'),
    duelId: id,
    opponent: z.string().min(1).max(64),
    prompts: z.array(DuelPromptInputSchema).min(1).max(20),
  }),
  /** Start my side of a duel: the authority starts my clock now. */
  z.object({ type: z.literal('duel-start'), duelId: id }),
  /** Answer the next prompt of my side. No elapsed time is accepted. */
  z.object({
    type: z.literal('duel-answer'),
    duelId: id,
    promptId: id,
    answer: z.string().max(400),
  }),
  /** Ask the authority to close the round; it only does so when due. */
  z.object({ type: z.literal('close-round') }),
])
export type LeagueMutation = z.infer<typeof LeagueMutationSchema>
