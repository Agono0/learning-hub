/**
 * `leagues-remote` CLI command: local bookkeeping for the signed remote
 * league authority. INACTIVE GROUNDWORK, and offline by design: nothing here
 * signs or sends. It links a remote league, queues mutations and shows the
 * queue. Delivery happens through the app's /api/leagues/remote sync action,
 * which only works when the owner has enabled remote leagues.
 *
 *   leagues-remote link <serverUrl> <remoteLeagueId>
 *   leagues-remote list
 *   leagues-remote enqueue <serverUrl> <remoteLeagueId> <mutation…>
 *   leagues-remote queue <serverUrl> <remoteLeagueId>
 *
 * Mutations: join <alias> | duel-open <id> <opponent> --prompt "id::q::a|b"
 *            | duel-start <id> | duel-answer <id> <promptId> <answer> | close-round
 *
 * Remote leagues are local/friendly practice. The authority orders and
 * verifies activity; this command never reports a score or a rank.
 */
import {
  LeagueRemoteInputError,
  enqueueLeagueMutation,
  getRemoteLink,
  linkRemoteLeague,
  listRemoteLinks,
  loadLeagueQueue,
} from '@learning-hub/db'
import { SyncQueueFullError, parseMutationArgs, summarizeQueue } from '@learning-hub/core'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

const USAGE =
  'Usage: learning-hub leagues-remote [list | link <serverUrl> <leagueId> | enqueue <serverUrl> <leagueId> <mutation…> | queue <serverUrl> <leagueId>]'

function fail(msg: string): void {
  console.error(msg)
  process.exitCode = 1
}

function listCommand(): void {
  const links = listRemoteLinks()
  if (links.length === 0) {
    console.log('No remote leagues linked. Remote leagues are optional practice groundwork.')
    return
  }
  console.log(
    panel(
      'REMOTE LEAGUE LINKS',
      links.map((l) => {
        const q = summarizeQueue(loadLeagueQueue(l.id).queue)
        return `${l.remoteLeagueId}  ${l.serverUrl}  · next seq ${l.nextSeq} · queue ${q.pending} pending · last ${l.lastStatus ?? 'never synced'}`
      }),
    ),
  )
}

function linkCommand(args: string[]): void {
  const [serverUrl, remoteLeagueId] = args
  if (!serverUrl || !remoteLeagueId) return fail(USAGE)
  try {
    const link = linkRemoteLeague({ serverUrl, remoteLeagueId })
    console.log(`Linked ${link.remoteLeagueId} at ${link.serverUrl}`)
  } catch (err) {
    if (err instanceof LeagueRemoteInputError) return fail(err.message)
    throw err
  }
}

function enqueueCommand(args: string[]): void {
  const [serverUrl, remoteLeagueId, ...mutationArgs] = args
  if (!serverUrl || !remoteLeagueId || mutationArgs.length === 0) return fail(USAGE)
  const parsed = parseMutationArgs(mutationArgs)
  if (!parsed.ok) return fail(parsed.error)
  try {
    const link = linkRemoteLeague({ serverUrl, remoteLeagueId })
    const { itemId, queue } = enqueueLeagueMutation(link.id, parsed.mutation)
    const s = summarizeQueue(queue)
    console.log(`Queued ${parsed.mutation.type} as ${itemId} (${s.pending} pending). Not sent yet.`)
  } catch (err) {
    if (err instanceof LeagueRemoteInputError || err instanceof SyncQueueFullError) {
      return fail(err.message)
    }
    throw err
  }
}

function queueCommand(args: string[]): void {
  const [serverUrl, remoteLeagueId] = args
  if (!serverUrl || !remoteLeagueId) return fail(USAGE)
  let link
  try {
    link = getRemoteLink(serverUrl, remoteLeagueId)
  } catch (err) {
    if (err instanceof LeagueRemoteInputError) return fail(err.message)
    throw err
  }
  if (!link) return fail('No such link. Run `leagues-remote link` first.')
  const { queue, recovered } = loadLeagueQueue(link.id)
  const lines = queue.items.map(
    (i) =>
      `${i.id}  ${i.mutation.type}  ${i.status}${i.lastCode ? ` (${i.lastCode})` : ''}  tries ${i.attempts}`,
  )
  if (recovered) lines.unshift('The stored queue was unreadable and has been reset.')
  console.log(panel(`QUEUE ${remoteLeagueId}`, lines.length > 0 ? lines : ['Queue is empty.']))
}

function run(args: string[]): void {
  const sub = args[0] || 'list'
  if (sub === 'list') return listCommand()
  if (sub === 'link') return linkCommand(args.slice(1))
  if (sub === 'enqueue') return enqueueCommand(args.slice(1))
  if (sub === 'queue') return queueCommand(args.slice(1))
  fail(USAGE)
}

export const leaguesRemoteCommands: RegisteredCommand[] = [
  {
    name: 'leagues-remote',
    description: 'Link and queue signed remote league mutations (offline, inactive groundwork)',
    usage: '[list|link|enqueue|queue]',
    run: (runArgs) => run(runArgs),
  },
]
