/**
 * Interference MCP tools. Same repository functions as the web handler and the
 * CLI `interf` command. Basis: similar items compete at recall (McGeoch 1942;
 * Underwood 1957; fan effect, Anderson 1974). The audit reads card wording and
 * review history; present it as suspects, not proof.
 *
 * Tools:
 * 1. interf_audit - lookalike pairs with severity, evidence and advice
 * 2. interf_pair  - confirm, dismiss or clear a pair
 * 3. interf_drill - build a discrimination drill or log its answers
 * 4. interf_order - spread a queue so lookalikes are not close together
 */
import { z } from 'zod'
import {
  InterferenceLimitError,
  InterferenceValidationError,
  getPairDrill,
  logPairDrill,
  planSeparatedSession,
  runInterferenceAuditDb,
  setPairStatus,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

function guard(fn: () => Record<string, unknown>) {
  try {
    return json({ ok: true, ...fn() })
  } catch (e) {
    if (e instanceof InterferenceValidationError || e instanceof InterferenceLimitError)
      return json({ ok: false, error: e.message })
    throw e
  }
}

const id = z.number().int().positive()

export const interferenceTools: RegisteredTool[] = [
  tool(
    'interf_audit',
    'Find lookalike cards that compete at recall: similar questions with different answers, different questions with one answer, and near duplicates. Returns severity, review evidence and advice per pair. Observational.',
    {
      deckId: id.optional().describe('Limit to one deck'),
      windowDays: z.number().int().min(7).max(365).default(90),
    },
    ({ deckId, windowDays = 90 }) =>
      json({ ok: true, ...runInterferenceAuditDb({ deckId, windowDays }) }),
  ),
  tool(
    'interf_pair',
    "Record the learner's decision about a pair: confirm a real confusion, dismiss a harmless pair, or clear the decision.",
    { a: id, b: id, status: z.enum(['confirmed', 'dismissed', 'cleared']) },
    ({ a, b, status }) =>
      guard(() => {
        if (!setPairStatus(a, b, status === 'cleared' ? null : status))
          throw new InterferenceValidationError('Card not found.')
        return {}
      }),
  ),
  tool(
    'interf_drill',
    'Build a four-item discrimination drill for a pair (omit correct and total), or log drill answers (give both).',
    {
      a: id,
      b: id,
      correct: z.number().int().min(0).max(50).optional(),
      total: z.number().int().min(1).max(50).optional(),
    },
    ({ a, b, correct, total }) =>
      guard(() => {
        if (correct !== undefined && total !== undefined) {
          const r = logPairDrill({ a, b, correct, total })
          if (!r) throw new InterferenceValidationError('Card not found.')
          return { ...r }
        }
        const drill = getPairDrill(a, b)
        if (!drill)
          throw new InterferenceValidationError(
            'Both cards must exist and have a question and an answer.',
          )
        return { drill }
      }),
  ),
  tool(
    'interf_order',
    'Reorder a list of card ids so flagged lookalikes are at least gap positions apart. Every id appears once.',
    {
      ids: z.array(id).min(1).max(2000),
      gap: z.number().int().min(1).max(20).default(5),
      deckId: id.optional(),
    },
    ({ ids, gap = 5, deckId }) =>
      json({ ok: true, ids: planSeparatedSession([...new Set(ids)], { gap, deckId }) }),
  ),
]
