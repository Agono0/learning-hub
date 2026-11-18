/**
 * Ideas MCP tools — Zettelkasten inbox capture, keyword search, linking,
 * evolutionary hybrids, and the inbox listing. All persistence goes through
 * the shared ideas repository (packages/db repos/ideas) so MCP, web handlers
 * and the CLI share one set of queries and one XP semantics.
 *
 * Behavior fix (host parity): idea_evolve previously inserted the offspring
 * + parent-of links inline, which bypassed the transactional
 * `createHybridIdea` path and awarded no XP; it now goes through the repo.
 * idea_list_inbox uses the repo's ordering (most recently updated first)
 * instead of a private createdAt ordering.
 */
import { z } from 'zod'
import {
  createHybridIdea,
  createIdea,
  createIdeaLink,
  getIdea,
  ideaSearch,
  listIdeas,
} from '@learning-hub/db'
import {
  evolveIdeas,
  getActiveAIClientFromDb,
  manualHybrid,
  type AIClient,
} from '@learning-hub/core'
import { json, tool, type RegisteredTool } from '../tool-kit'

/** Registry-backed client from settings; null on 'none' or registration/usage errors (manual fallback). */
async function aiClientOrNull(): Promise<AIClient | null> {
  try {
    return await getActiveAIClientFromDb()
  } catch (e) {
    console.error('[mcp] AI client unavailable, falling back to manual mode:', e)
    return null
  }
}

export const ideaTools: RegisteredTool[] = [
  tool(
    'idea_create',
    'Capture a new idea into the inbox (stage: seed).',
    {
      title: z.string().describe('One-line idea title'),
      content: z.string().optional().describe('Longer description'),
      tags: z.array(z.string()).optional(),
    },
    ({ title, content, tags }) => {
      const idea = createIdea({ title, content: content ?? '', tags: tags ?? [] })
      return json({ ok: true, idea })
    },
  ),
  tool(
    'idea_search',
    'Search ideas by keyword (LIKE on title and content).',
    { query: z.string().min(1) },
    ({ query }) => {
      const rows = ideaSearch(query)
      return json({ count: rows.length, ideas: rows })
    },
  ),
  tool(
    'idea_connect',
    'Link two ideas (related | supports | contradicts | refines | parent-of) with optional context.',
    {
      fromId: z.number().int(),
      toId: z.number().int(),
      type: z
        .enum(['related', 'supports', 'contradicts', 'refines', 'parent-of'])
        .default('related'),
      context: z.string().optional().describe('WHY they are connected'),
    },
    ({ fromId, toId, type, context }) => {
      const link = createIdeaLink({ fromIdeaId: fromId, toIdeaId: toId, type, context })
      return json({ ok: true, link })
    },
  ),
  tool(
    'idea_evolve',
    'Evolve two ideas into a combinatorial hybrid: creates the offspring idea + parent-of links. Uses AI when configured, else deterministic manual merge.',
    { aId: z.number().int(), bId: z.number().int() },
    async ({ aId, bId }) => {
      const a = getIdea(aId)
      const b = getIdea(bId)
      if (!a || !b) return json({ ok: false, error: `Idea not found: ${!a ? aId : bId}` })
      const { system, prompt, guidance } = evolveIdeas(a, b)
      let offspringTitle: string
      let offspringContent: string
      let mode: 'ai' | 'manual'
      const client = await aiClientOrNull()
      if (client) {
        try {
          const hybrid = await client.generateJSON({
            schema: z.object({ title: z.string().min(1), content: z.string().min(1) }),
            system,
            prompt,
          })
          offspringTitle = hybrid.title
          offspringContent = hybrid.content
          mode = 'ai'
        } catch {
          const fallback = manualHybrid(a, b)
          offspringTitle = fallback.title
          offspringContent = fallback.content
          mode = 'manual'
        }
      } else {
        const fallback = manualHybrid(a, b)
        offspringTitle = fallback.title
        offspringContent = `${fallback.content}\n\nGuidance: ${guidance}`
        mode = 'manual'
      }
      // Transactional repo path: offspring + parent-of links + canonical idea XP.
      const result = createHybridIdea({
        aId: a.id,
        bId: b.id,
        title: offspringTitle,
        content: offspringContent,
        mode,
      })
      return json({ ok: true, mode, offspring: result.offspring, parents: result.parents })
    },
  ),
  tool('idea_list_inbox', 'List ideas still in the inbox (stage: seed).', {}, () => {
    // Repo ordering (most recently updated first) — shared with the web inbox.
    const rows = listIdeas({ stage: 'seed', limit: 50 }).ideas
    return json({ count: rows.length, ideas: rows })
  }),
]
