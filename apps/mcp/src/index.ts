/**
 * Learning HUB — MCP server (stdio transport). Implemented by Agent C.
 *
 * Tools: idea_create, idea_search, idea_connect, idea_evolve, idea_list_inbox,
 *        note_create, note_search, review_log, review_stats, goal_woop,
 *        goal_list, focus_summary, quote_random, card_generate,
 *        curriculum_prompt, curriculum_import, curriculum_list, curriculum_course,
 *        curriculum_next, curriculum_export (./tools/curriculum)
 * Resources: idea://{id}, note://{id}, graph://overview
 *
 * Windows client config (claude_desktop_config.json / .mcp.json):
 *   { "mcpServers": { "learning-hub": { "command": "node",
 *       "args": ["--import", "tsx", "C:\\abs\\path\\apps\\mcp\\src\\index.ts"] } } }
 * (never bare `npx` on Windows — spawn ENOENT)
 */
import { and, desc, eq, like, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { json, tool, type RegisteredTool } from './tool-kit'
import { curriculumTools } from './tools/curriculum'
import { cognitiveTools } from './tools/cognitive'
import {
  CardNotFoundError,
  cards,
  db,
  decks,
  executeCloudSync,
  executeReview,
  focusSessions,
  frictionEvents,
  getFsrsStatus,
  getRandomQuote,
  getStarterCatalogStatus,
  getSyncConfig,
  goals,
  ideas,
  ideaLinks,
  installStarterPack,
  notes,
  noteLinks,
  optimizeAndPersistFsrs,
  searchAll,
} from '@learning-hub/db'
import {
  evolveIdeas,
  getActiveAIClientFromDb,
  getPluginContributions,
  loadPlugins,
  manualHybrid,
  SUPERTAG_TEMPLATES,
  wikilinkParse,
  type AIClient,
  type Grade,
} from '@learning-hub/core'
// registers the built-in AI providers (anthropic/openai/google/openai-compatible/
// ollama/custom-endpoint) into core's registry — without this only 'none'
// exists and idea_evolve always runs its manual merge
import { networkFetch } from '@learning-hub/ai-adapters'

/** Registry-backed client from settings; null on 'none' or registration/usage errors (manual fallback). */
async function aiClientOrNull(): Promise<AIClient | null> {
  try {
    return await getActiveAIClientFromDb()
  } catch (e) {
    console.error('[mcp] AI client unavailable, falling back to manual mode:', e)
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findOrCreateDeck(name: string): Promise<number> {
  const [existing] = await db.select().from(decks).where(eq(decks.name, name)).limit(1)
  if (existing) return existing.id
  const [created] = await db.insert(decks).values({ name }).returning()
  return created!.id
}

/** Basic card split — no AI needed: "Q:/A:" pairs, "front :: back", or "front | back". */
function parseBasicCards(text: string): { front: string; back: string }[] {
  const out: { front: string; back: string }[] = []
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let pendingQ: string | null = null
  for (const line of lines) {
    const qMatch = line.match(/^(?:Q|question)\d*\s*[:.)]\s*(.+)$/i)
    const aMatch = line.match(/^(?:A|answer)\d*\s*[:.)]\s*(.+)$/i)
    if (qMatch) {
      if (pendingQ) out.push({ front: pendingQ, back: '' })
      pendingQ = qMatch[1]!
    } else if (aMatch && pendingQ) {
      out.push({ front: pendingQ, back: aMatch[1]! })
      pendingQ = null
    } else {
      const sep = line.includes('::') ? '::' : line.includes(' | ') ? ' | ' : null
      if (sep) {
        const idx = line.indexOf(sep)
        out.push({ front: line.slice(0, idx).trim(), back: line.slice(idx + sep.length).trim() })
        pendingQ = null
      } else if (pendingQ) {
        pendingQ += ` ${line}`
      } else {
        pendingQ = line
      }
    }
  }
  if (pendingQ) out.push({ front: pendingQ, back: '' })
  return out
}

// ─── Internal tool registry ─────────────────────────────────────────────────
//
// Every tool the server exposes is declared here as data, then registered in
// one loop inside main(). Plugin contributions (ctx.mcpTools) join the same
// registry at boot, so the loop — not this array — is the single registration
// path. With zero plugins installed the server behaves exactly as before.

const builtinTools: RegisteredTool[] = [
  // ── Ideas ──
  tool(
    'idea_create',
    'Capture a new idea into the inbox (stage: seed).',
    {
      title: z.string().describe('One-line idea title'),
      content: z.string().optional().describe('Longer description'),
      tags: z.array(z.string()).optional(),
    },
    async ({ title, content, tags }) => {
      const [idea] = await db
        .insert(ideas)
        .values({ title, content: content ?? '', tags: tags ?? [] })
        .returning()
      return json({ ok: true, idea })
    },
  ),
  tool(
    'idea_search',
    'Search ideas by keyword (LIKE on title and content).',
    { query: z.string().min(1) },
    async ({ query }) => {
      const pattern = `%${query}%`
      const rows = await db
        .select()
        .from(ideas)
        .where(or(like(ideas.title, pattern), like(ideas.content, pattern)))
        .orderBy(desc(ideas.updatedAt))
        .limit(25)
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
    async ({ fromId, toId, type, context }) => {
      const [link] = await db
        .insert(ideaLinks)
        .values({ fromIdeaId: fromId, toIdeaId: toId, type, context })
        .returning()
      return json({ ok: true, link })
    },
  ),
  tool(
    'idea_evolve',
    'Evolve two ideas into a combinatorial hybrid: creates the offspring idea + parent-of links. Uses AI when configured, else deterministic manual merge.',
    { aId: z.number().int(), bId: z.number().int() },
    async ({ aId, bId }) => {
      const [a] = await db.select().from(ideas).where(eq(ideas.id, aId)).limit(1)
      const [b] = await db.select().from(ideas).where(eq(ideas.id, bId)).limit(1)
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
      const [offspring] = await db
        .insert(ideas)
        .values({
          title: offspringTitle,
          content: offspringContent,
          stage: 'seed',
          tags: ['hybrid'],
        })
        .returning()
      await db.insert(ideaLinks).values([
        {
          fromIdeaId: a.id,
          toIdeaId: offspring!.id,
          type: 'parent-of',
          context: 'evolution parent A',
        },
        {
          fromIdeaId: b.id,
          toIdeaId: offspring!.id,
          type: 'parent-of',
          context: 'evolution parent B',
        },
      ])
      return json({ ok: true, mode, offspring, parents: [a.id, b.id] })
    },
  ),
  tool('idea_list_inbox', 'List ideas still in the inbox (stage: seed).', {}, async () => {
    const rows = await db
      .select()
      .from(ideas)
      .where(eq(ideas.stage, 'seed'))
      .orderBy(desc(ideas.createdAt))
      .limit(50)
    return json({ count: rows.length, ideas: rows })
  }),

  // ── Notes ──
  tool(
    'note_create',
    'Create a note; [[wikilinks]] to existing notes become note_links. Optional supertag: ' +
      Object.keys(SUPERTAG_TEMPLATES).join(', '),
    {
      title: z.string().min(1),
      content: z.string().default(''),
      supertag: z.enum(['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK']).optional(),
      fields: z.record(z.string(), z.string()).optional(),
    },
    async ({ title, content, supertag, fields }) => {
      const [note] = await db.insert(notes).values({ title, content, supertag, fields }).returning()
      const targets = wikilinkParse(content)
      const linked: { target: string; noteId: number }[] = []
      const unresolved: string[] = []
      for (const target of targets) {
        const [hit] = await db.select().from(notes).where(eq(notes.title, target)).limit(1)
        if (hit && hit.id !== note!.id) {
          await db
            .insert(noteLinks)
            .values({ fromNoteId: note!.id, toNoteId: hit.id, type: 'related' })
          linked.push({ target, noteId: hit.id })
        } else {
          unresolved.push(target)
        }
      }
      return json({ ok: true, note, wikilinksResolved: linked, wikilinksUnresolved: unresolved })
    },
  ),
  tool(
    'note_search',
    'Search notes by keyword (LIKE on title and content).',
    { query: z.string().min(1) },
    async ({ query }) => {
      const pattern = `%${query}%`
      const rows = await db
        .select()
        .from(notes)
        .where(or(like(notes.title, pattern), like(notes.content, pattern)))
        .orderBy(desc(notes.updatedAt))
        .limit(25)
      return json({ count: rows.length, notes: rows })
    },
  ),

  // ── Review ──
  tool(
    'review_log',
    'Log a review for a card: runs the canonical executeReview engine (FSRS-6 scheduling + revlog + XP + streak + Elo/BKT mastery) atomically.',
    {
      cardId: z.number().int(),
      rating: z.number().int().min(1).max(4).describe('1 Again, 2 Hard, 3 Good, 4 Easy'),
      confidence: z.number().int().min(0).max(1).default(1).describe('0 unsure, 1 sure'),
      timeMs: z.number().int().min(0).default(5000),
    },
    async ({ cardId, rating, confidence, timeMs }) => {
      const now = new Date()
      try {
        const result = await executeReview({
          cardId,
          grade: rating as Grade,
          confidence: confidence as 0 | 1,
          timeMs,
        })
        const intervalDays = Math.max(
          0,
          Math.round((Date.parse(result.card.due) - now.getTime()) / 86_400_000),
        )
        return json({
          ok: true,
          cardId,
          rating,
          due: result.card.due,
          intervalDays,
          xpEarned: result.xpEarned,
          streak: { current: result.streak.current, best: result.streak.best },
        })
      } catch (err) {
        if (err instanceof CardNotFoundError) {
          return json({ ok: false, error: `Card ${cardId} not found` })
        }
        throw err
      }
    },
  ),
  tool(
    'review_stats',
    'Review statistics: true retention (from v_true_retention) and the current due count.',
    {},
    async () => {
      const retention = await db.all<{ total: number; retained: number; retention_pct: number }>(
        sql`SELECT total, retained, retention_pct FROM v_true_retention`,
      )
      const [{ dueCount }] = await db
        .select({ dueCount: sql<number>`count(*)` })
        .from(cards)
        .where(and(lte(cards.due, new Date().toISOString()), eq(cards.suspended, false)))
      return json({
        trueRetention: retention[0] ?? { total: 0, retained: 0, retention_pct: null },
        dueCount: Number(dueCount ?? 0),
      })
    },
  ),

  // ── Goals ──
  tool(
    'goal_woop',
    'Create a WOOP goal: Wish, Outcome, Obstacle, if-then Plan.',
    {
      wish: z.string().min(1),
      outcome: z.string().optional(),
      obstacle: z.string().optional(),
      ifThenPlan: z.string().optional().describe('If <obstacle>, then I will <action>'),
    },
    async ({ wish, outcome, obstacle, ifThenPlan }) => {
      const [goal] = await db
        .insert(goals)
        .values({ wish, outcome, obstacle, ifThenPlan })
        .returning()
      return json({ ok: true, goal })
    },
  ),
  tool('goal_list', 'List goals with status and progress.', {}, async () => {
    const rows = await db.select().from(goals).orderBy(desc(goals.createdAt)).limit(50)
    return json({ count: rows.length, goals: rows })
  }),

  // ── Focus ──
  tool(
    'focus_summary',
    'Recent focus sessions plus friction (distraction) stats.',
    {},
    async () => {
      const sessions = await db
        .select()
        .from(focusSessions)
        .orderBy(desc(focusSessions.startedAt))
        .limit(10)
      const completed = sessions.filter((s) => s.completed)
      const friction = await db
        .select({
          trigger: frictionEvents.trigger,
          count: sql<number>`count(*)`,
          proceeded: sql<number>`sum(CASE WHEN proceeded THEN 1 ELSE 0 END)`,
        })
        .from(frictionEvents)
        .groupBy(frictionEvents.trigger)
      const totalLeakMinutes = sessions.reduce((acc, s) => acc + (s.leaks ?? 0), 0)
      return json({
        recentSessions: sessions.map((s) => ({
          id: s.id,
          startedAt: s.startedAt,
          plannedMinutes: s.plannedMinutes,
          actualMinutes: s.actualMinutes,
          completed: s.completed,
          task: s.task,
          leaks: s.leaks,
        })),
        completedRate: sessions.length ? completed.length / sessions.length : null,
        totalLeaks: totalLeakMinutes,
        frictionByTrigger: friction.map((f) => ({
          trigger: f.trigger,
          count: Number(f.count),
          proceeded: Number(f.proceeded ?? 0),
        })),
      })
    },
  ),

  // ── Quotes ──
  tool('quote_random', 'A random motivational quote (with its context).', {}, async () => {
    const quote = getRandomQuote()
    return json({ quote: quote ?? null })
  }),

  // ── Cards ──
  tool(
    'card_generate',
    'Create basic Q&A cards from text without AI. Supports "Q:/A:" line pairs, "front :: back" and "front | back" per line.',
    {
      text: z.string().min(1),
      deckName: z.string().default('Inbox'),
    },
    async ({ text, deckName }) => {
      const parsed = parseBasicCards(text)
      const withBack = parsed.filter((c) => c.back)
      const skipped = parsed.length - withBack.length
      const deckId = await findOrCreateDeck(deckName)
      const now = new Date()
      const created: number[] = []
      for (const c of withBack) {
        const [card] = await db
          .insert(cards)
          .values({
            deckId,
            type: 'basic',
            content: { basic: c },
            due: now.toISOString(),
            source: 'mcp',
          })
          .returning()
        created.push(card!.id)
      }
      return json({ ok: true, deckId, created: created.length, skipped: skipped, cardIds: created })
    },
  ),

  // ── Search, FSRS-6 Optimizer, Starter Library & Cloud Sync ──
  tool(
    'search',
    'Full-text search (FTS5 with LIKE fallback) across notes, cards, lessons, highlights, and ideas.',
    {
      query: z.string().min(1).describe('Search query'),
      limit: z.number().int().min(1).max(100).default(24),
    },
    async ({ query, limit }) => {
      const result = searchAll(db, query, limit)
      return json({ ok: true, count: result.hits.length, ...result })
    },
  ),
  tool(
    'fsrs_optimize',
    'Inspect FSRS-6 Log-Loss/RMSE calibration or optimize/reset personalized 21-parameter FSRS-6 weights globally or per deck.',
    {
      mode: z.enum(['status', 'optimize', 'reset']).default('status'),
      deckId: z.number().int().positive().optional(),
      reschedule: z.boolean().default(false),
    },
    async ({ mode, deckId, reschedule }) => {
      if (mode === 'status') {
        return json({ ok: true, ...getFsrsStatus({ deckId }) })
      }
      const res = await optimizeAndPersistFsrs({ mode, deckId, reschedule })
      return json({ ok: true, ...res })
    },
  ),
  tool(
    'starter_install',
    'List or install built-in offline starter courses (learning-how-to-learn, javascript-functions, sql-essentials) and curated quotes/mnemonics.',
    {
      action: z.enum(['list', 'install']).default('list'),
      courseSlugs: z.array(z.string()).optional(),
      seedCore: z.boolean().default(true),
    },
    async ({ action, courseSlugs, seedCore }) => {
      if (action === 'list') {
        return json({ ok: true, ...getStarterCatalogStatus() })
      }
      const res = installStarterPack({ courseSlugs, seedCore })
      return json({ ok: true, ...res })
    },
  ),
  tool(
    'cloud_sync',
    'Inspect masked Cloud Sync status or run non-destructive Smart Merge sync (Dropbox, GitHub, Google Drive, WebDAV).',
    {
      action: z.enum(['status', 'test', 'pull', 'push', 'sync']).default('status'),
    },
    async ({ action }) => {
      if (action === 'status') {
        return json({ ok: true, sync: getSyncConfig({ maskSecrets: true }) })
      }
      try {
        const res = await executeCloudSync({ action, fetchFn: networkFetch })
        return json({ ...res, sync: getSyncConfig({ maskSecrets: true }) })
      } catch (err) {
        return json({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  ),
]

// ─── Server ─────────────────────────────────────────────────────────────────

async function main() {
  const { McpServer, ResourceTemplate } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')

  const server = new McpServer({ name: 'learning-hub', version: '0.1.0' })

  // Load plugins before registering anything: their tools join the registry.
  const plugins = await loadPlugins(['plugins'])
  const { mcpTools: pluginTools } = getPluginContributions()
  if (plugins.length > 0) {
    console.error(
      `[mcp] loaded ${plugins.length} plugin(s): ${plugins.map((p) => `${p.plugin.name}@${p.plugin.version}`).join(', ')}`,
    )
  }

  for (const registered of [...builtinTools, ...curriculumTools, ...cognitiveTools]) {
    server.registerTool(
      registered.name,
      { description: registered.description, inputSchema: registered.inputSchema },
      registered.handler,
    )
  }

  // Plugin tools are isolated: a throwing handler returns an MCP error result
  // instead of tearing down the connection.
  for (const contributed of pluginTools) {
    server.registerTool(
      contributed.name,
      { description: contributed.description, inputSchema: contributed.inputSchema },
      async (args) => {
        try {
          return await contributed.handler(args)
        } catch (err) {
          console.error(`[mcp] plugin tool "${contributed.name}" failed:`, err)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
            isError: true,
          }
        }
      },
    )
  }

  // ── Resources ──
  server.registerResource(
    'idea',
    new ResourceTemplate('idea://{id}', { list: undefined }),
    { title: 'Idea', description: 'A single idea with its links' },
    async (uri, { id }) => {
      const ideaId = Number(id)
      const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
      if (!idea) return { contents: [{ uri: uri.href, text: `Idea ${ideaId} not found` }] }
      const links = await db
        .select()
        .from(ideaLinks)
        .where(or(eq(ideaLinks.fromIdeaId, ideaId), eq(ideaLinks.toIdeaId, ideaId)))
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ idea, links }, null, 2),
          },
        ],
      }
    },
  )

  server.registerResource(
    'note',
    new ResourceTemplate('note://{id}', { list: undefined }),
    { title: 'Note', description: 'A single note with its links' },
    async (uri, { id }) => {
      const noteId = Number(id)
      const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1)
      if (!note) return { contents: [{ uri: uri.href, text: `Note ${noteId} not found` }] }
      const links = await db
        .select()
        .from(noteLinks)
        .where(or(eq(noteLinks.fromNoteId, noteId), eq(noteLinks.toNoteId, noteId)))
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ note, links }, null, 2),
          },
        ],
      }
    },
  )

  server.registerResource(
    'graph-overview',
    'graph://overview',
    {
      title: 'Graph overview',
      description: 'Counts per node type and the most connected notes/ideas',
    },
    async (uri) => {
      const [noteCount] = await db.select({ n: sql<number>`count(*)` }).from(notes)
      const [ideaCount] = await db.select({ n: sql<number>`count(*)` }).from(ideas)
      const [cardCount] = await db.select({ n: sql<number>`count(*)` }).from(cards)
      const [noteLinkCount] = await db.select({ n: sql<number>`count(*)` }).from(noteLinks)
      const [ideaLinkCount] = await db.select({ n: sql<number>`count(*)` }).from(ideaLinks)
      const topNotes = await db
        .select({ id: notes.id, title: notes.title, links: sql<number>`count(note_links.id)` })
        .from(notes)
        .leftJoin(
          noteLinks,
          or(eq(noteLinks.fromNoteId, notes.id), eq(noteLinks.toNoteId, notes.id)),
        )
        .groupBy(notes.id, notes.title)
        .orderBy(desc(sql`count(note_links.id)`))
        .limit(5)
      const topIdeas = await db
        .select({ id: ideas.id, title: ideas.title, links: sql<number>`count(idea_links.id)` })
        .from(ideas)
        .leftJoin(
          ideaLinks,
          or(eq(ideaLinks.fromIdeaId, ideas.id), eq(ideaLinks.toIdeaId, ideas.id)),
        )
        .groupBy(ideas.id, ideas.title)
        .orderBy(desc(sql`count(idea_links.id)`))
        .limit(5)
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                counts: {
                  notes: Number(noteCount?.n ?? 0),
                  ideas: Number(ideaCount?.n ?? 0),
                  cards: Number(cardCount?.n ?? 0),
                  noteLinks: Number(noteLinkCount?.n ?? 0),
                  ideaLinks: Number(ideaLinkCount?.n ?? 0),
                },
                topNotes: topNotes.map((r) => ({
                  id: r.id,
                  title: r.title,
                  links: Number(r.links),
                })),
                topIdeas: topIdeas.map((r) => ({
                  id: r.id,
                  title: r.title,
                  links: Number(r.links),
                })),
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  console.error('MCP server failed:', err)
  process.exit(1)
})
