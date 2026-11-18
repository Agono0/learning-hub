/**
 * Search result kinds and their display labels — the single source of truth
 * for every face of /api/search (command palette, /search page, tests).
 *
 * Mirrors `SearchKind` in packages/db/src/repos/search.ts (17 surfaces) as a
 * literal union plus a complete label map; apps/web never imports the db
 * package at runtime (it pulls better-sqlite3), so the union is restated here
 * and kept honest by apps/web/tests/search-palette.test.ts.
 */
export type SearchHitKind =
  | 'note'
  | 'card'
  | 'lesson'
  | 'highlight'
  | 'idea'
  | 'journal'
  | 'quote'
  | 'source'
  | 'project'
  | 'mindmap'
  | 'canvas'
  | 'palace'
  | 'goal'
  | 'habit'
  | 'capture'
  | 'sq3r'
  | 'chat'

/** Kind → label shown next to each hit (palette chips, /search kind chips). */
export const SEARCH_KIND_LABELS: Record<string, string> = {
  note: 'Notes',
  card: 'Cards',
  lesson: 'Lessons',
  highlight: 'Highlights',
  idea: 'Ideas',
  journal: 'Journal',
  quote: 'Quotes',
  source: 'Reading',
  project: 'Projects',
  mindmap: 'Mind Maps',
  canvas: 'Canvases',
  palace: 'Palaces',
  goal: 'Goals',
  habit: 'Habits',
  capture: 'Captures',
  sq3r: 'SQ3R',
  chat: 'Tutor chats',
}
