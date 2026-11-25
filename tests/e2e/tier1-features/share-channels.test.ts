/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers pass JSON payloads around */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dispatch } from '../../../apps/server/src/routes'
import {
  applyChannelUpdate,
  createChannel,
  publishUpdate,
  type LocalItem,
} from '../../../packages/core/src/share-channels'
import { runCli } from '../helpers/cli-runner'

/**
 * Share-channels host-parity suite: the headless REST routes, the CLI and
 * the pure engine must agree on channel creation, publishing, merging and
 * verification. Mirrors the MCP tool shapes by construction (all hosts call
 * the same engine).
 */

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: String(err) }))
      }
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

async function post(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

const createBody = {
  channelId: 'ch-parity',
  type: 'deck' as const,
  title: 'Parity Deck',
  authorHandle: 'parity-owl',
  visibility: 'link' as const,
  items: [
    { id: 'c1', content: { front: 'Q1', back: 'A1' } },
    { id: 'c2', content: { front: 'Q2', back: 'A2' } },
  ],
}

describe('share-channels REST routes', () => {
  it('create -> publish -> verify -> describe -> status round-trip', async () => {
    const created = await post('/share/channels/create', createBody)
    expect(created.status).toBe(200)
    expect(created.data.ok).toBe(true)
    expect(created.data.manifest.schema).toBe('lh-share/v2')

    const published = await post('/share/channels/publish', {
      manifest: created.data.manifest,
      items: [
        { id: 'c1', content: { front: 'Q1', back: 'A1 improved' } },
        { id: 'c2', content: { front: 'Q2', back: 'A2' } },
        { id: 'c3', content: { front: 'Q3', back: 'A3' } },
      ],
      changelog: 'Improved c1, added c3',
    })
    expect(published.data.manifest.currentVersion).toBe(2)

    const verified = await post('/share/channels/verify', { manifest: published.data.manifest })
    expect(verified.data.report.ok).toBe(true)

    const described = await post('/share/channels/describe', { manifest: published.data.manifest })
    expect(described.data.summary.latestItemCount).toBe(3)
    expect(described.data.summary.versions).toHaveLength(2)

    const status = await post('/share/channels/status', {
      channelId: 'ch-parity',
      localVersion: 1,
      manifest: published.data.manifest,
    })
    expect(status.data.pending).toBe(true)
  })

  it('apply merges a version into local items and matches the engine', async () => {
    const manifest = createChannel({ ...createBody, channelId: 'ch-apply' })
    const v2manifest = publishUpdate(
      manifest,
      [
        { id: 'c1', content: { front: 'Q1', back: 'A1 improved' } },
        { id: 'c2', content: { front: 'Q2', back: 'A2' } },
      ],
      'v2',
    )
    const version = v2manifest.versions[1]
    const localItems: LocalItem[] = manifest.versions[0].items.map((i) => ({
      channelItemId: i.id,
      channelContent: i.content,
      channelRevision: i.revision,
      localContent: i.content,
      learnerState: { note: 'keep me' },
    }))

    const viaRoute = await post('/share/channels/apply', { localItems, version })
    expect(viaRoute.status).toBe(200)
    const viaEngine = applyChannelUpdate(localItems, version)
    expect(viaRoute.data.result).toEqual(viaEngine.result)
    expect(viaRoute.data.items).toEqual(viaEngine.items)
    expect(viaRoute.data.items[0].learnerState).toEqual({ note: 'keep me' })
  })

  it('rejects invalid bodies with a 4xx, not a 500', async () => {
    const res = await post('/share/channels/create', { channelId: '' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

describe('share-channels CLI', () => {
  it('create emits the same manifest shape as the engine', async () => {
    const result = await runCli([
      'share-channels',
      'create',
      '--json',
      '--data',
      JSON.stringify(createBody),
    ])
    expect(result.exitCode).toBe(0)
    const out = JSON.parse(result.stdout)
    expect(out.ok).toBe(true)
    expect(out.manifest.schema).toBe('lh-share/v2')
    expect(out.manifest.currentVersion).toBe(1)
  })

  it('verify flags a tampered manifest', async () => {
    const manifest = createChannel({ ...createBody, channelId: 'ch-cli-verify' })
    const tampered = { ...manifest, versions: [{ ...manifest.versions[0], checksum: 'deadbeef' }] }
    const result = await runCli([
      'share-channels',
      'verify',
      '--json',
      '--data',
      JSON.stringify({ manifest: tampered }),
    ])
    expect(result.exitCode).toBe(0)
    const out = JSON.parse(result.stdout)
    expect(out.report.ok).toBe(false)
    expect(out.report.badVersions).toEqual([1])
  })
})
