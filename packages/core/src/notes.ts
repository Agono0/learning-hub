/**
 * Learning HUB — notes layer.
 * Tana-style supertag templates, Zettelkasten backlinks, RemNote-style
 * bullet↔card sync planning, and [[wikilink]] parsing.
 * Pure logic — DB layer applies the plans.
 */

// ─── Supertag templates ─────────────────────────────────────────────────────

export type SupertagKey = 'BIBLIDEF' | 'DEFINITION' | 'THEOREM' | 'PERSON' | 'BOOK' | 'CORNELL'

/** Tana-style typed note template: fields with placeholder hints. */
export interface SupertagTemplate {
  key: SupertagKey
  name: string
  emoji: string
  /** field name → placeholder/expected content */
  fields: Record<string, string>
}

/** The five built-in supertag templates (bibliodef/definition/theorem/person/book). */
export const SUPERTAG_TEMPLATES: Record<SupertagKey, SupertagTemplate> = {
  BIBLIDEF: {
    key: 'BIBLIDEF',
    name: 'Biblio definition',
    emoji: '📑',
    fields: {
      author: 'Author(s) of the work',
      year: 'Year of publication',
      venue: 'Journal / conference / publisher',
      url: 'DOI or link',
      coreClaim: 'The one-sentence claim of the work',
    },
  },
  DEFINITION: {
    key: 'DEFINITION',
    name: 'Definition',
    emoji: '📘',
    fields: {
      term: 'The term being defined',
      domain: 'Field / subject area',
      definition: 'Precise definition in one sentence',
      contrast: 'What it is NOT (closest confusable concept)',
    },
  },
  THEOREM: {
    key: 'THEOREM',
    name: 'Theorem',
    emoji: '🧮',
    fields: {
      statement: 'Formal statement',
      assumptions: 'Hypotheses / givens',
      proofIdea: 'Key idea of the proof (one line)',
      corollaries: 'Immediate consequences',
    },
  },
  PERSON: {
    key: 'PERSON',
    name: 'Person',
    emoji: '🧑‍🔬',
    fields: {
      role: 'Who they are',
      knownFor: 'Main contribution(s)',
      era: 'Active period',
      url: 'Homepage / profile',
    },
  },
  BOOK: {
    key: 'BOOK',
    name: 'Book',
    emoji: '📚',
    fields: {
      author: 'Author',
      year: 'Year',
      thesis: 'Central thesis in one sentence',
      status: 'queued | reading | done',
      rating: '1-5 (after finishing)',
    },
  },
  CORNELL: {
    key: 'CORNELL',
    name: 'Cornell notes',
    emoji: '🗒️',
    // Walter Pauk's page layout: cues on the left drive later self-testing,
    // the summary line forces compression at the bottom.
    fields: {
      topic: 'Lecture / chapter / source this page covers',
      cues: 'Questions and key terms (written AFTER the notes — they drive recall)',
      summary: 'The page in 2–3 sentences, in your own words',
    },
  },
}

/**
 * The Cornell page as markdown: a notes area, a cue column rendered as
 * questions to self-test against, and a summary block (Pauk, *How to Study
 * in College*). Inserted as the note's content when the supertag is applied.
 */
export function cornellLayout(topic = ''): string {
  return [
    topic ? `## ${topic}` : '## Topic',
    '',
    '### Notes',
    '',
    '- ',
    '',
    '### Cues (cover the notes, answer these)',
    '',
    '- ?',
    '',
    '### Summary',
    '',
    '> ',
    '',
  ].join('\n')
}

// ─── Backlinks (Zettelkasten) ───────────────────────────────────────────────

export interface NoteRef {
  id: number
  title: string
}

/** Raw note_links row shape used for backlink extraction. */
export interface NoteLinkRef {
  fromNoteId: number
  toNoteId: number
  type?: string | null
  context?: string | null
}

/** Resolved incoming link: source note title + relation + context. */
export interface Backlink {
  fromNoteId: number
  fromTitle: string
  type: string
  context: string | null
}

/** Incoming links for one note, resolved to the source note's title. */
export function extractBacklinks(
  notes: NoteRef[],
  links: NoteLinkRef[],
  noteId: number,
): Backlink[] {
  const titleById = new Map(notes.map((n) => [n.id, n.title]))
  return links
    .filter((l) => l.toNoteId === noteId)
    .map((l) => ({
      fromNoteId: l.fromNoteId,
      fromTitle: titleById.get(l.fromNoteId) ?? `#${l.fromNoteId}`,
      type: l.type ?? 'related',
      context: l.context ?? null,
    }))
}

// ─── Bullets (RemNote pattern: any bullet can BE a card) ────────────────────

export interface BulletRow {
  id: number
  content: string
  position?: number
  cardId?: number | null
}

/** One markdown bullet parsed out of note content. */
export interface ParsedBullet {
  content: string
  position: number
}

/** Parse markdown bullets ("- ", "* ", "+ ", "1. ") from note content. */
export function parseBullets(noteContent: string): ParsedBullet[] {
  const out: ParsedBullet[] = []
  const lines = noteContent.split(/\r?\n/)
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)
    if (m) {
      const content = (m[1] ?? '').trim()
      if (content) out.push({ content, position: out.length })
    }
  }
  return out
}

/** Create/update/remove diff the DB layer applies to note_bullets. */
export interface BulletSyncPlan {
  /** New bullets found in content → create rows (cards sync after creation). */
  create: ParsedBullet[]
  /** Existing rows whose content changed in the note. */
  update: { id: number; content: string }[]
  /** Rows no longer present in the note (delete rows; card linkage dies with them). */
  remove: { id: number; content: string; cardId?: number | null }[]
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * Diff stored note bullets against the note's current markdown content.
 * Matching is by normalized content: changed bullets (same position intent,
 * different text) surface as update/remove+create pairs for the caller —
 * only bullets whose text changed need card sync (their card front must move).
 */
export function bulletSyncPlan(bulletRows: BulletRow[], noteContent: string): BulletSyncPlan {
  const parsed = parseBullets(noteContent)
  const parsedNorm = parsed.map((p) => norm(p.content))
  const rowNorm = new Map(bulletRows.map((r) => [r.id, norm(r.content)]))
  const rowByContent = new Map(bulletRows.map((r) => [norm(r.content), r]))

  const plan: BulletSyncPlan = { create: [], update: [], remove: [] }

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]!
    const text = parsedNorm[i] ?? ''
    const existing = rowByContent.get(text)
    if (existing) {
      // unchanged content — nothing to sync even if position drifted
      rowNorm.delete(existing.id)
      continue
    }
    // No exact match: is this a reworded version of a row near the same position?
    const nearRow = bulletRows.find(
      (r) => Math.abs((r.position ?? 0) - i) <= 1 && rowNorm.has(r.id),
    )
    if (nearRow) {
      plan.update.push({ id: nearRow.id, content: p.content })
      rowNorm.delete(nearRow.id)
    } else {
      plan.create.push(p)
    }
  }

  for (const r of bulletRows) {
    if (rowNorm.has(r.id))
      plan.remove.push({ id: r.id, content: r.content, cardId: r.cardId ?? null })
  }
  return plan
}

// ─── Wikilinks ──────────────────────────────────────────────────────────────

/**
 * Extract [[wikilink]] targets from markdown. Supports aliases [[title|alias]].
 * Returns unique, order-preserving, trimmed target titles — the caller resolves
 * each to a note id on save (creating note_links for found targets).
 */
export function wikilinkParse(content: string): string[] {
  const targets: string[] = []
  const re = /\[\[([^\[\]|]+)(?:\|[^\[\]]*)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const target = (m[1] ?? '').trim()
    if (target && !targets.includes(target)) targets.push(target)
  }
  return targets
}
