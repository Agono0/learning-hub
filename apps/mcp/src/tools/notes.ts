/**
 * Notes MCP tools — wiki-style note creation ([[wikilinks]] become
 * note_links via the shared notes repository) and keyword search.
 */
import { z } from 'zod'
import { SUPERTAG_TEMPLATES, wikilinkParse } from '@learning-hub/core'
import { createNote, listNotes } from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

export const noteTools: RegisteredTool[] = [
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
    ({ title, content, supertag, fields }) => {
      // The repo resolves wikilinks (and parses bullet outlines) for every
      // host; unresolved targets are computed here for the tool report.
      const targets = wikilinkParse(content)
      const { note, links } = createNote({ title, content, supertag, fields })
      const resolved = new Set(links.map((l) => l.target))
      const unresolved = targets.filter((t) => !resolved.has(t))
      return json({ ok: true, note, wikilinksResolved: links, wikilinksUnresolved: unresolved })
    },
  ),
  tool(
    'note_search',
    'Search notes by keyword (LIKE on title and content).',
    { query: z.string().min(1) },
    ({ query }) => {
      const rows = listNotes({ query, limit: 25 })
      return json({ count: rows.length, notes: rows })
    },
  ),
]
