/**
 * Retrieval-induced forgetting guard MCP tools. Same repository functions as
 * the web handler and the CLI `rif` command. Basis: Anderson, Bjork & Bjork
 * (1994): practising some items under a shared cue suppresses similar
 * unpractised ones. Risk is a heuristic from card wording and review history;
 * agents should present it as a prompt to check, not a measurement. Cards,
 * schedules and reviews are never written (only audit summaries and dismissals).
 *
 * 1. rif_audit   - clusters of competing cards with per-card risk
 * 2. rif_rescue  - the rescue queue with reverse probes
 * 3. rif_dismiss - leave a card out of the guard, or put it back
 * 4. rif_plan    - add suppressed siblings to a list of due cards, interleaved
 */
import { z } from 'zod'
import {
  dismissRifCard,
  planBalancedSession,
  restoreRifCard,
  runRifAudit,
  saveRifAudit,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

const deckId = z.number().int().positive().optional().describe('Limit to one deck')

export const retrievalForgettingTools: RegisteredTool[] = [
  tool(
    'rif_audit',
    'Finds groups of cards that share a cue but have different answers and estimates, per card, the risk that practising its siblings crowded it out (retrieval-induced forgetting). Read-only unless save is true, which stores a summary for the trend line.',
    {
      deckId,
      windowDays: z
        .number()
        .int()
        .min(3)
        .max(120)
        .optional()
        .describe('Look-back window, default 21'),
      save: z.boolean().optional().describe('Store a summary of this audit'),
    },
    async ({ deckId: d, windowDays, save }) => {
      const run = runRifAudit({ deckId: d, windowDays })
      const savedId = save ? saveRifAudit(run.audit, d ?? null) : null
      return json({ ok: true, ...run, savedId })
    },
  ),
  tool(
    'rif_rescue',
    'Lists the cards most likely crowded out by practised siblings, riskiest first, each with a reason and a reverse probe (show the answer, ask for the cue), which avoids the suppression.',
    { deckId, limit: z.number().int().min(1).max(200).optional() },
    async ({ deckId: d, limit }) => {
      const run = runRifAudit({ deckId: d })
      return json({ ok: true, rescue: run.rescue.slice(0, limit ?? 20) })
    },
  ),
  tool(
    'rif_dismiss',
    'Leaves a card out of the guard (restore: true puts it back). Idempotent.',
    {
      cardId: z.number().int().positive(),
      restore: z.boolean().optional(),
      reason: z.string().max(200).optional(),
    },
    async ({ cardId, restore, reason }) => {
      const ok = restore ? restoreRifCard(cardId) : dismissRifCard(cardId, reason)
      return json({ ok })
    },
  ),
  tool(
    'rif_plan',
    'Given the card ids due for review, adds up to `budget` suppressed siblings from the same competing groups and orders the list so competitors are not retrieved back to back.',
    {
      dueIds: z.array(z.number().int().positive()).min(1).max(500),
      budget: z.number().int().min(0).max(50).optional(),
      deckId,
    },
    async ({ dueIds, budget, deckId: d }) =>
      json({ ok: true, ...planBalancedSession(dueIds, { deckId: d, budget }) }),
  ),
]
