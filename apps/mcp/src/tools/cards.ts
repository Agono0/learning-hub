/**
 * Cards MCP tools — AI-free basic card generation ("Q:/A:" line pairs,
 * "front :: back" and "front | back" per line) through the shared cards
 * repository, which owns the parser and the deck upsert.
 */
import { z } from 'zod'
import { createBasicCards, findOrCreateDeck } from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const cardTools: RegisteredTool[] = [
  tool(
    'card_generate',
    'Create basic Q&A cards from text without AI. Supports "Q:/A:" line pairs, "front :: back" and "front | back" per line.',
    {
      text: z.string().min(1),
      deckName: z.string().default('Inbox'),
    },
    ({ text, deckName }) => {
      const deck = findOrCreateDeck(deckName)
      const { cardIds, skipped } = createBasicCards(deck.id, text, { source: 'mcp' })
      return json({ ok: true, deckId: deck.id, created: cardIds.length, skipped, cardIds })
    },
  ),
]
