/**
 * System MCP tools — cross-cutting, already-shared capabilities that needed no
 * SQL migration: full-text search (repos/search), FSRS-6 status/optimizer
 * (repos/fsrs), the starter library, cloud sync, and the random quote
 * (repos/quotes).
 */
import { z } from 'zod'
import {
  db,
  executeCloudSync,
  getFsrsStatus,
  getRandomQuote,
  getStarterCatalogStatus,
  getSyncConfig,
  installStarterPack,
  optimizeAndPersistFsrs,
  searchAll,
} from '@learning-hub/db'
import { networkFetch } from '@learning-hub/ai-adapters'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const systemTools: RegisteredTool[] = [
  tool(
    'search',
    'Full-text search (FTS5 with LIKE fallback) across notes, cards, lessons, highlights, and ideas.',
    {
      query: z.string().min(1).describe('Search query'),
      limit: z.number().int().min(1).max(100).default(24),
    },
    ({ query, limit }) => {
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
    ({ action, courseSlugs, seedCore }) => {
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
  tool('quote_random', 'A random motivational quote (with its context).', {}, () => {
    const quote = getRandomQuote()
    return json({ quote: quote ?? null })
  }),
]
