/**
 * card-linter — first-party plugin (core-only).
 *
 * MCP tool `lint_card`: runs the Wozniak 20-rules linter over a pasted
 * question/answer pair so an agent can self-check cards it writes. CLI twin:
 * `lint-card "<front>" "<back>"`.
 */
import { definePlugin } from '@learning-hub/core'
import { lintCard } from '@learning-hub/core'
import type { McpToolContribution } from '@learning-hub/core'
import { z } from 'zod'

export default definePlugin({
  name: 'card-linter',
  version: '1.0.0',
  description: 'MCP + CLI: run the 20-rules card linter on a question/answer pair.',
  setup(ctx) {
    const tool: McpToolContribution = {
      name: 'lint_card',
      description:
        'Lint a flashcard (front/question text + back/answer text) against the 20 rules of card formulation. Returns issues with rule names and severity.',
      inputSchema: {
        front: z.string().min(1),
        back: z.string().min(1),
      },
      handler: async (args: { front: string; back: string }) => {
        const issues = lintCard(args.front, args.back)
        const text =
          issues.length === 0
            ? 'Clean — no rule violations found.'
            : issues.map((i) => `[${i.severity}] rule ${i.rule}: ${i.message}`).join('\n')
        return { content: [{ type: 'text', text }] }
      },
    }
    ctx.mcpTools.push(tool)

    ctx.cliCommands.push({
      name: 'lint-card',
      description: 'lint a card: `lint-card "<front>" "<back>"`',
      run: (args) => {
        const [front, back] = args
        if (!front || !back) {
          console.log('usage: lint-card "<front>" "<back>"')
          return
        }
        const issues = lintCard({ front, back })
        if (issues.length === 0) {
          console.log('Clean — no rule violations found.')
        } else {
          for (const i of issues) console.log(`[${i.severity}] ${i.ruleId}: ${i.message}`)
        }
      },
    })
  },
})
