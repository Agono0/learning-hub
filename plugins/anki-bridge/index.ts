/**
 * anki-bridge — first-party plugin (core-only by the dependency rule).
 *
 * MCP tool `anki_format_tsv`: the agent supplies a deck name + card list and
 * gets back Anki-importable TSV (cloze syntax restored) via core's
 * `formatAnkiTxt`. Pair it with the app's own export for full-deck dumps.
 */
import { definePlugin } from '@learning-hub/core'
import { formatAnkiTxt, type DeckExportInput } from '@learning-hub/core'
import type { McpToolContribution } from '@learning-hub/core'
import { z } from 'zod'

const cardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()).optional(),
})

export default definePlugin({
  name: 'anki-bridge',
  version: '1.0.0',
  description: 'MCP tool: format a card list as Anki-importable TSV (cloze restored).',
  setup(ctx) {
    const tool: McpToolContribution = {
      name: 'anki_format_tsv',
      description:
        'Format a list of {front, back, tags?} cards plus a deck name into Anki-importable TSV text (cloze {{c1::…}} syntax preserved).',
      inputSchema: {
        deckName: z.string().min(1),
        cards: z.array(cardSchema).min(1).max(500),
      },
      handler: async (args: {
        deckName: string
        cards: Array<{ front: string; back: string; tags?: string[] }>
      }) => {
        const deck: DeckExportInput = {
          name: args.deckName,
          cards: args.cards.map((c) => ({
            front: c.front,
            back: c.back,
            tags: c.tags,
          })),
        }
        return { content: [{ type: 'text', text: formatAnkiTxt(deck) }] }
      },
    }
    ctx.mcpTools.push(tool)
  },
})
