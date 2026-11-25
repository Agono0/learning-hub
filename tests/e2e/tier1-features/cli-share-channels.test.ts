import { describe, it, expect } from 'vitest'
import { runCli } from '../helpers/cli-runner'
import { getActiveDbPath } from '../helpers/setup'
import { createChannel } from '../../../packages/core/src/share-channels'

/**
 * CLI parity for the share-channels stateful subcommands: host a manifest,
 * list hosted channels, publish a new version, propose + decide, collections.
 */

const manifest = createChannel({
  channelId: 'ch-cli-e2e',
  type: 'deck',
  title: 'CLI Hosted Deck',
  authorHandle: 'cli-owner',
  visibility: 'link',
  items: [
    { id: 'k1', content: { front: 'Q1?', back: 'A1' } },
    { id: 'k2', content: { front: 'Q2?', back: 'A2' } },
  ],
  now: '2026-01-01T00:00:00Z',
})

function withChecksum(m: typeof manifest): typeof manifest {
  return m
}

describe('Tier 1: share-channels CLI', () => {
  it('hosts, lists, publishes and unhosts a channel from the CLI', async () => {
    const dbPath = getActiveDbPath()

    const host = await runCli(
      ['share-channels', 'host', '--data', JSON.stringify(withChecksum(manifest)), '--json'],
      dbPath,
    )
    expect(host.exitCode).toBe(0)

    const dup = await runCli(
      ['share-channels', 'host', '--data', JSON.stringify(withChecksum(manifest))],
      dbPath,
    )
    expect(dup.exitCode).toBe(1)

    const list = await runCli(['share-channels', 'host-list', '--json'], dbPath)
    expect(list.exitCode).toBe(0)
    expect(list.stdout).toContain('ch-cli-e2e')

    const got = await runCli(['share-channels', 'host-get', '--channel', 'ch-cli-e2e'], dbPath)
    expect(got.exitCode).toBe(0)
    expect(got.stdout).toContain('CLI Hosted Deck')

    const publish = await runCli(
      [
        'share-channels',
        'host-publish',
        '--channel',
        'ch-cli-e2e',
        '--data',
        JSON.stringify([
          { id: 'k1', content: { front: 'Q1?', back: 'A1' } },
          { id: 'k2', content: { front: 'Q2 edited?', back: 'A2' } },
          { id: 'k3', content: { front: 'Q3?', back: 'A3' } },
        ]),
        '--changelog',
        'v2 from cli',
        '--json',
      ],
      dbPath,
    )
    expect(publish.exitCode).toBe(0)
    expect(publish.stdout).toContain('"version":2')
  }, 90000)

  it('runs the proposal flow from the CLI', async () => {
    const dbPath = getActiveDbPath()

    const propose = await runCli(
      [
        'share-channels',
        'propose',
        '--channel',
        'ch-cli-e2e',
        '--author',
        'cli-learner',
        '--title',
        'tweak k2',
        '--data',
        JSON.stringify([
          { kind: 'upsert', item: { id: 'k2', content: { front: 'Q2 fixed?', back: 'A2' } } },
        ]),
        '--json',
      ],
      dbPath,
    )
    expect(propose.exitCode).toBe(0)
    const proposalId = JSON.parse(propose.stdout.slice(propose.stdout.indexOf('{'))).proposal
      .id as string

    const list = await runCli(
      ['share-channels', 'proposals', '--channel', 'ch-cli-e2e', '--status', 'open', '--json'],
      dbPath,
    )
    expect(list.exitCode).toBe(0)
    expect(list.stdout).toContain(proposalId)

    const decide = await runCli(
      [
        'share-channels',
        'proposal-decide',
        '--proposal',
        proposalId,
        '--decision',
        'accept',
        '--json',
      ],
      dbPath,
    )
    expect(decide.exitCode).toBe(0)
    expect(decide.stdout).toContain('"status":"accepted"')

    const got = await runCli(
      ['share-channels', 'host-get', '--channel', 'ch-cli-e2e', '--json'],
      dbPath,
    )
    expect(got.stdout).toContain('"currentVersion":3')

    const unhost = await runCli(
      ['share-channels', 'host-unhost', '--channel', 'ch-cli-e2e'],
      dbPath,
    )
    expect(unhost.exitCode).toBe(0)
  }, 90000)

  it('saves, lists and deletes a collection from the CLI', async () => {
    const dbPath = getActiveDbPath()
    const collection = {
      schema: 'lh-share-collection/v1',
      id: 'col-cli-e2e',
      title: 'CLI pack',
      description: '',
      ownerHandle: 'cli-owner',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      channels: [withChecksum(manifest)],
    }
    const save = await runCli(
      ['share-channels', 'collection-save', '--data', JSON.stringify(collection)],
      dbPath,
    )
    expect(save.exitCode).toBe(0)

    const list = await runCli(['share-channels', 'collections', '--json'], dbPath)
    expect(list.exitCode).toBe(0)
    expect(list.stdout).toContain('col-cli-e2e')

    const got = await runCli(['share-channels', 'collection-get', '--id', 'col-cli-e2e'], dbPath)
    expect(got.exitCode).toBe(0)
    expect(got.stdout).toContain('CLI pack')

    const del = await runCli(['share-channels', 'collection-delete', '--id', 'col-cli-e2e'], dbPath)
    expect(del.exitCode).toBe(0)
    const gone = await runCli(['share-channels', 'collection-get', '--id', 'col-cli-e2e'], dbPath)
    expect(gone.exitCode).toBe(1)
  }, 90000)
})
