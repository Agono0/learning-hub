# Search — FTS5 surfaces, palette actions and recents

One index, one query, honest results. Search answers "what did I write?" from
the user's own data only — the AI never answers here (see
[ai-providers.md](ai-providers.md) for the nl-search planner boundary).

## Surfaces (what is searchable)

`/api/search` (`apps/web/src/server/handlers/search/route.ts` →
`packages/db/src/repos/search.ts`) searches **17 kinds** of knowledge across
two migration-maintained FTS5 shadow-table generations:

- Migration 003: notes, cards, lessons, highlights, ideas.
- Migration 018: journal entries, quotes, reading sources, projects, mindmaps,
  canvases, memory palaces, WOOP goals, habits, quick captures, SQ3R sessions,
  tutor/feynman chats.

Every kind has a `SearchHit` contract `{ kind, id, title, snippet, href }` and
a label in `apps/web/src/lib/search-kinds.ts` (single source of truth for the
command palette chips and the /search kind chips). Per kind up to 8 hits,
24 overall.

## The card corpus

Cards are indexed (`fts_cards`, kept current by insert/update/delete triggers)
over: **tags**, `basic.front`, `basic.back`, `cloze.text`, `mcq.question`,
`typein.question` and `grammar.sentence` — i.e. every format's
question/answer text, not just the front.

Because hits can land on any indexed field, the rendered card **title**
coalesces in the same order as the corpus:
`$.basic.front → $.cloze.text → $.mcq.question → $.typein.question →
$.grammar.sentence → 'Card'`, truncated to 80 chars. A hit on a typein
question or a cloze answer therefore shows the text that matched, never an
empty or wrong title.

## LIKE fallback — honesty, not silence

If the FTS5 shadow tables are missing (e.g. a wasm build compiled without
FTS5, or a database mid-migration), search falls back to a substring `LIKE`
scan over the same surfaces. Which engine answered is never hidden: the API
returns `mode: 'fts5' | 'like'` and both UI faces surface it ("full-text" vs
"substring" in the palette result-group heading; the same honesty on
/search).

## Command palette actions and recents

The ⌘K palette (`apps/web/src/components/CommandPalette.tsx`) offers, when the
query is empty:

- **Quick actions** — review, focus, quick-capture HUD, commute audio, sleep
  TMR, 3D palace, constellation, voice tutor, mock exam, weakness radar,
  **Notification Center** (/notifications), **Permission Center**
  (/permissions), **Browse all decks** (/decks), plus any plugin-contributed
  actions.
- **Recent searches** — the last executed queries, from
  `apps/web/src/lib/recent-searches.ts`. Device-local (localStorage only,
  window-guarded: no `window` → `[]` / no-op, so SSR and node never crash),
  capped at **5**, duplicates move to the front case-insensitively, with a
  "Clear recents" affordance. Recents load only after mount — localStorage is
  never read during the first render pass.
- **Recording** — a query is remembered when it is _executed_: selecting
  "Search everything for …" or a search hit calls `rememberSearch(query)`.
  Typing alone records nothing.

Empty recents render nothing extra; the honest empty state for no matches is
unchanged.
