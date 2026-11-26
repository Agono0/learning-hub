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
  z.object({
    type: z.literal('join'),
    alias: z.string().min(1).max(40),
    /** Secret invite code. Required only while the league is invite-only. */
    invite: z.string().min(16).max(128).optional(),
  }),
  /** Change my display alias. Display only, never an identity. */
  z.object({ type: z.literal('rename'), alias: z.string().min(1).max(40) }),
  /** Leave the league. Open duels of mine are cancelled; history stays. */
  z.object({ type: z.literal('leave') }),
  /** Publish the digest of an invite code I generated. The code is never sent. */
  z.object({
    type: z.literal('invite-create'),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    maxUses: z.number().int().min(1).max(20),
    ttlMs: z
      .number()
      .int()
      .min(60_000)
      .max(7 * 24 * 60 * 60_000),
  }),
  /** Revoke an invite I created (the founder may revoke any). */
  z.object({ type: z.literal('invite-revoke'), digest: z.string().regex(/^[0-9a-f]{64}$/) }),
  /** Founder only: remove a member and block them from rejoining. */
  z.object({ type: z.literal('remove-member'), target: z.string().min(1).max(64) }),
  /** Founder only: lift a block so the handle may join again. */
  z.object({ type: z.literal('unblock-member'), target: z.string().min(1).max(64) }),
  z.object({ type: z.literal('transfer-founder'), target: z.string().min(1).max(64) }),
  /** Founder only: require an invite to join. */
  z.object({ type: z.literal('invite-policy'), required: z.boolean() }),
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
