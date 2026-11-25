/**
 * `leagues-remote` CLI command for the signed remote league authority.
 * INACTIVE GROUNDWORK. Linking, queueing and showing the queue are offline.
 * `sync` and `state` reach the network, so they refuse to run unless the owner
 * set LH_REMOTE_LEAGUES=1, the same gate the app's route uses. `sync` signs
 * with the stored device key and sends the queue; the authority decides what
 * counts.
 *
 *   leagues-remote link <serverUrl> <remoteLeagueId>
 *   leagues-remote list
 *   leagues-remote enqueue <serverUrl> <remoteLeagueId> <mutation…>
 *   leagues-remote queue <serverUrl> <remoteLeagueId>
 *   leagues-remote sync <serverUrl> <remoteLeagueId>     (needs LH_REMOTE_LEAGUES=1)
 *   leagues-remote state <serverUrl> <remoteLeagueId>    (needs LH_REMOTE_LEAGUES=1)
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
  fetchRemoteState,
  syncRemoteLeague,
  getRemoteLink,
  linkRemoteLeague,
  listRemoteLinks,
  loadLeagueQueue,
} from '@learning-hub/db'
import {
  SyncQueueFullError,
  describeRosterLines,
  digestInviteCode,
  generateInviteCode,
  parseMutationArgs,
  parseRemoteRoster,
  summarizeQueue,
} from '@learning-hub/core'
import { panel } from './ui'
import type { RegisteredCommand } from './registry'

const USAGE =
  'Usage: learning-hub leagues-remote [list | link <serverUrl> <leagueId> | enqueue <serverUrl> <leagueId> <mutation…> | queue <serverUrl> <leagueId> | invite-new <serverUrl> <leagueId> [--uses N] [--hours H] | sync <serverUrl> <leagueId> | state <serverUrl> <leagueId>]'

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

/**
 * Make a fresh invite code, queue only its digest, and show the code once.
 * The code is a bearer secret: the room never stores it, and neither does
 * this command, so a lost code means making a new one.
 */
async function inviteNewCommand(args: string[]): Promise<void> {
  const [serverUrl, remoteLeagueId, ...flags] = args
  if (!serverUrl || !remoteLeagueId) return fail(USAGE)
  const code = generateInviteCode()
  const digest = await digestInviteCode(code)
  const parsed = parseMutationArgs(['invite-create', digest, ...flags])
  if (!parsed.ok) return fail(parsed.error)
  try {
    const link = linkRemoteLeague({ serverUrl, remoteLeagueId })
    const { itemId } = enqueueLeagueMutation(link.id, parsed.mutation)
    console.log(`Queued invite-create as ${itemId}. Not sent yet.`)
    console.log('Share this code only with the person you are inviting. It is shown once:')
    console.log(code)
    console.log('Anyone holding it can join until it expires, is used up or is revoked.')
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

const NOT_ENABLED =
  'Remote leagues are not enabled. Set LH_REMOTE_LEAGUES=1 to let this command reach a league server.'

/** Resolve a linked league for a network command, or print why not. */
function linkedForNetwork(args: string[]) {
  if (process.env.LH_REMOTE_LEAGUES !== '1') {
    fail(NOT_ENABLED)
    return null
  }
  const [serverUrl, remoteLeagueId] = args
  if (!serverUrl || !remoteLeagueId) {
    fail(USAGE)
    return null
  }
  try {
    const link = getRemoteLink(serverUrl, remoteLeagueId)
    if (!link) {
      fail('No such link. Run `leagues-remote link` first.')
      return null
    }
    return link
  } catch (err) {
    if (err instanceof LeagueRemoteInputError) {
      fail(err.message)
      return null
    }
    throw err
  }
}

const netFetch = (url: string, init?: RequestInit) => fetch(url, init)

async function syncCommand(args: string[]): Promise<void> {
  const link = linkedForNetwork(args)
  if (!link) return
  const outcome = await syncRemoteLeague(link, { fetch: netFetch })
  if (!outcome.ok) return fail(outcome.message)
  const q = outcome.queue
  console.log(
    `Sent ${outcome.attempted} item${outcome.attempted === 1 ? '' : 's'}. ` +
      `${q.pending} pending, ${q.rejected} refused by the league.`,
  )
  if (outcome.recovered) console.log('The stored queue was unreadable and has been reset.')
  if (q.pending > 0) console.log('Run sync again to send the rest. Items are sent in order.')
  if (q.rejected > 0) console.log('Run `leagues-remote queue` to see which were refused and why.')
}

async function stateCommand(args: string[]): Promise<void> {
  const link = linkedForNetwork(args)
  if (!link) return
  let res
  try {
    res = await fetchRemoteState(link, { fetch: netFetch })
  } catch {
    return fail('Could not reach the league server.')
  }
  if (!res.ok) return fail(`The league server answered ${res.status}.`)
  const roster = parseRemoteRoster(res.remote)
  if (!roster) return fail('The league did not return a readable roster.')
  console.log(panel(`LEAGUE ${link.remoteLeagueId}`, describeRosterLines(roster)))
}

async function run(args: string[]): Promise<void> {
  const sub = args[0] || 'list'
  if (sub === 'list') return listCommand()
  if (sub === 'link') return linkCommand(args.slice(1))
  if (sub === 'enqueue') return enqueueCommand(args.slice(1))
  if (sub === 'queue') return queueCommand(args.slice(1))
  if (sub === 'invite-new') return inviteNewCommand(args.slice(1))
  if (sub === 'sync') return syncCommand(args.slice(1))
  if (sub === 'state') return stateCommand(args.slice(1))
  fail(USAGE)
}

export const leaguesRemoteCommands: RegisteredCommand[] = [
  {
    name: 'leagues-remote',
    description: 'Link and queue signed remote league mutations (offline, inactive groundwork)',
    usage: '[list|link|enqueue|queue|invite-new|sync|state]',
    run: (runArgs) => run(runArgs),
  },
]
