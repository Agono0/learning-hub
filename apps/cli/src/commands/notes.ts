/**
 * `notes` CLI command — Zettelkasten note CRUD over the shared notes
 * repository (repos/notes), the same functions the web /api/notes handlers
 * run ([[wikilinks]] become note_links, bullet outlines are parsed).
 *
 *   notes list [--limit 20]
 *   notes search "<query>" [--limit 20]
 *   notes show <id>
 *   notes create "<title>" [--content s] [--supertag DEFINITION]
 *   notes update <id> [--title s] [--content s] [--status inbox|project|area|resource|archive]
 *   notes delete <id>
 */
import { limitFlag } from '../flags'
import { createNote, deleteNote, getNoteDetail, listNotes, updateNote } from '@learning-hub/db'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

const SUPERTAGS = ['BIBLIDEF', 'DEFINITION', 'THEOREM', 'PERSON', 'BOOK', 'CORNELL'] as const
const NOTE_STATUSES = ['inbox', 'project', 'area', 'resource', 'archive'] as const

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

function notesListCommand(args: string[]): void {
  const limit = limitFlag(parseFlag(args, '--limit'), 20)
  const notes = listNotes({ limit })
  if (notes.length === 0) {
    console.log('No notes yet — try `learning-hub notes create "Zettelkasten"`.')
    return
  }
  console.log(
    panel(
      `NOTES (${notes.length})`,
      notes.map((n) => `#${n.id} [${n.status}] ${n.title}`),
    ),
  )
}

function notesSearchCommand(args: string[]): void {
  const query = args[1]
  if (!query || !query.trim()) {
    console.error('Usage: learning-hub notes search "<query>" [--limit 20]')
    process.exitCode = 1
    return
  }
  const limit = limitFlag(parseFlag(args, '--limit'), 20)
  const notes = listNotes({ query, limit })
  if (notes.length === 0) {
    console.log(`No notes matching "${query}".`)
    return
  }
  console.log(
    panel(
      `NOTES · ${notes.length} hits for "${query}"`,
      notes.map((n) => `#${n.id} [${n.status}] ${n.title}`),
    ),
  )
}

function notesShowCommand(args: string[]): void {
  const id = Number(args[1])
  if (!Number.isInteger(id) || id <= 0) {
    console.error('Usage: learning-hub notes show <id>')
    return
  }
  const detail = getNoteDetail(id)
  if (!detail) {
    console.error(`✖ Note #${id} not found.`)
    return
  }
  console.log(`--- #${detail.note.id} [${detail.note.status}] ${detail.note.title} ---`)
  if (detail.note.content) console.log(detail.note.content)
  if (detail.links.length > 0) {
    console.log(`\n  links: ${detail.links.map((l) => `#${l.toNoteId}`).join(', ')}`)
  }
  if (detail.backlinks.length > 0) {
    console.log(`  backlinks: ${detail.backlinks.map((b) => b.fromTitle).join(', ')}`)
  }
}

function notesCreateCommand(args: string[]): void {
  const title = args[1]
  if (!title || !title.trim()) {
    console.error('Usage: learning-hub notes create "<title>" [--content s] [--supertag T]')
    process.exitCode = 1
    return
  }
  const supertag = parseFlag(args, '--supertag')
  if (supertag !== undefined && !SUPERTAGS.includes(supertag as (typeof SUPERTAGS)[number])) {
    console.error(`✖ Unknown supertag "${supertag}". Available: ${SUPERTAGS.join(', ')}`)
    return
  }
  const res = createNote({
    title,
    content: parseFlag(args, '--content') ?? '',
    ...(supertag !== undefined ? { supertag: supertag as (typeof SUPERTAGS)[number] } : {}),
  })
  const resolved = res.links.map((l) => `#${l.noteId} (${l.target})`).join(', ')
  console.log(
    `✔ Created note #${res.note.id}: ${res.note.title}` +
      `\n   wikilinks resolved: ${resolved || 'none'} · bullets: ${res.bulletsCount}`,
  )
}

function notesUpdateCommand(args: string[]): void {
  const id = Number(args[1])
  if (!Number.isInteger(id) || id <= 0) {
    console.error(
      'Usage: learning-hub notes update <id> [--title s] [--content s] [--status inbox|project|area|resource|archive]',
    )
    return
  }
  const status = parseFlag(args, '--status')
  if (status !== undefined && !NOTE_STATUSES.includes(status as (typeof NOTE_STATUSES)[number])) {
    console.error(`✖ Unknown status "${status}". Available: ${NOTE_STATUSES.join(', ')}`)
    return
  }
  const supertag = parseFlag(args, '--supertag')
  const res = updateNote(id, {
    title: parseFlag(args, '--title'),
    content: parseFlag(args, '--content'),
    status: status as (typeof NOTE_STATUSES)[number] | undefined,
    ...(supertag !== undefined ? { supertag: supertag as (typeof SUPERTAGS)[number] } : {}),
  })
  if (!res.note) {
    console.error(`✖ Note #${id} not found.`)
    return
  }
  console.log(
    `✔ Note #${id} updated — bullets +${res.bulletsPlan.created}/~${res.bulletsPlan.updated}/-${res.bulletsPlan.removed}, links +${res.linksCreated.length}`,
  )
}

function notesDeleteCommand(args: string[]): void {
  const id = Number(args[1])
  if (!Number.isInteger(id) || id <= 0) {
    console.error('Usage: learning-hub notes delete <id>')
    return
  }
  if (deleteNote(id)) console.log(`✔ Deleted note #${id} (bullets and links cascaded).`)
  else console.error(`✖ Note #${id} not found.`)
}

export function notesCommand(args: string[]): void {
  const sub = args[0] || 'list'

  if (sub === 'list') return notesListCommand(args)
  if (sub === 'search') return notesSearchCommand(args)
  if (sub === 'show') return notesShowCommand(args)
  if (sub === 'create') return notesCreateCommand(args)
  if (sub === 'update') return notesUpdateCommand(args)
  if (sub === 'delete') return notesDeleteCommand(args)

  console.error(
    'Usage: learning-hub notes [list [--limit N] | search "<q>" | show <id> | create "<title>" […] | update <id> […] | delete <id>]',
  )
}

export const notesCommands: RegisteredCommand[] = [
  {
    name: 'notes',
    description: 'Zettelkasten notes: wikilinks, search, and PAR status',
    usage: '[list|search|show|create|update|delete]',
    run: (runArgs) => notesCommand(runArgs),
  },
]
