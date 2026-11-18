/**
 * Learning HUB — MCP server (stdio transport). Implemented by Agent C.
 *
 * Built-in tools live in ./tools/{ideas,notes,review,goals,focus,cards,system}
 * (one array per file, concatenated in main() below) alongside the other
 * ./tools/* groups. Every inline drizzle block that used to live here moved to
 * the shared repositories in packages/db/src/repos — the same queries the web
 * handlers, CLI and headless server run (host parity, no host carries its own
 * SQL).
 *
 * Tools: idea_create, idea_search, idea_connect, idea_evolve, idea_list_inbox
 *        (./tools/ideas) · note_create, note_search (./tools/notes) ·
 *        review_log, review_stats (./tools/review) · goal_woop, goal_list
 *        (./tools/goals) · focus_summary (./tools/focus) · card_generate
 *        (./tools/cards) · search, fsrs_optimize, starter_install,
 *        cloud_sync, quote_random (./tools/system) · curriculum_*, cognitive,
 *        lifestyle, learning-path, community, telemetry-audio and
 *        advanced-learning groups (./tools/*)
 * Resources: idea://{id}, note://{id}, graph://overview
 *
 * Windows client config (claude_desktop_config.json / .mcp.json):
 *   { "mcpServers": { "learning-hub": { "command": "node",
 *       "args": ["--import", "tsx", "C:\\abs\\path\\apps\\mcp\\src\\index.ts"] } } }
 * (never bare `npx` on Windows — spawn ENOENT)
 */
import { getIdeaDetail, getNoteDetail, graphOverview } from '@learning-hub/db'
import { getPluginContributions, loadPlugins } from '@learning-hub/core'
import { cardTools } from './tools/cards'
import { cognitiveTools } from './tools/cognitive'
import { focusTools } from './tools/focus'
import { goalTools } from './tools/goals'
import { ideaTools } from './tools/ideas'
import { noteTools } from './tools/notes'
import { reviewTools } from './tools/review'
import { systemTools } from './tools/system'
import { curriculumTools } from './tools/curriculum'
import { lifestyleTools } from './tools/lifestyle'
import { learningPathTools } from './tools/learning-path'
import { communityTools } from './tools/community'
import { telemetryAudioTools } from './tools/telemetry-audio'
import { advancedLearningTools } from './tools/advanced-learning'
import type { RegisteredTool } from './tool-kit'

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

  for (const registered of [
    ...ideaTools,
    ...noteTools,
    ...reviewTools,
    ...goalTools,
    ...focusTools,
    ...cardTools,
    ...systemTools,
    ...curriculumTools,
    ...cognitiveTools,
    ...lifestyleTools,
    ...learningPathTools,
    ...communityTools,
    ...telemetryAudioTools,
    ...advancedLearningTools,
  ] as RegisteredTool[]) {
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

  // ── Resources (repo detail fns — shared with the web handlers) ──
  server.registerResource(
    'idea',
    new ResourceTemplate('idea://{id}', { list: undefined }),
    { title: 'Idea', description: 'A single idea with its links and decay score' },
    async (uri, { id }) => {
      const ideaId = Number(id)
      const detail = getIdeaDetail(ideaId)
      if (!detail) return { contents: [{ uri: uri.href, text: `Idea ${ideaId} not found` }] }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(detail, null, 2),
          },
        ],
      }
    },
  )

  server.registerResource(
    'note',
    new ResourceTemplate('note://{id}', { list: undefined }),
    { title: 'Note', description: 'A single note with its bullets, links and backlinks' },
    async (uri, { id }) => {
      const noteId = Number(id)
      const detail = getNoteDetail(noteId)
      if (!detail) return { contents: [{ uri: uri.href, text: `Note ${noteId} not found` }] }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(detail, null, 2),
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
      const overview = graphOverview()
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(overview, null, 2),
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
