/**
 * ImageStore tests (apps/web/src/server/storage.ts): the DB-backed default
 * store (base64 bytes in images.data) plus the legacy fs fallback for
 * pre-DB-storage rows (data = NULL, bytes on disk under the images dir).
 *
 * Runs against an isolated temp SQLite DB (LEARNING_HUB_DB) seeded with the
 * real repo DDL — the same pattern tests/routes-smoke.test.ts uses; no dev
 * data is touched and no file is written outside the temp dir. Run from
 * apps/web: `npx vitest run`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, images, initDb, resolveImagesDir } from '@learning-hub/db'
import { getImageStore } from '@/server/storage'

// find the workspace root the same way packages/db/src/paths.ts resolveDbPath does
function findRepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, 'package.json')
    if (fs.existsSync(pkg)) {
      try {
        if (fs.readFileSync(pkg, 'utf8').includes('"workspaces"')) return dir
      } catch {
        /* fall through */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('workspace root not found')
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-storage-'))
const tempDbFile = path.join(tempDir, 'storage-test.db')

// Seed the temp DB with the real repo DDL (the ensureSchema data-column ALTER
// applies idempotently on initDb if the source schema predates it).
{
  const source = new Database(path.join(findRepoRoot(), 'data', 'learning-hub.db'), {
    readonly: true,
    fileMustExist: true,
  })
  const ddl = source
    .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'")
    .all() as { sql: string }[]
  source.close()
  const target = new Database(tempDbFile)
  target.pragma('journal_mode = WAL')
  for (const { sql } of ddl) target.exec(sql)
  target.close()
}

// Point the db package at the temp file BEFORE the first db touch: explicit
// initDb paths short-circuit resolveDbPath, and resolveImagesDir() (used by the
// legacy fs fallback) derives from this env var.
process.env.LEARNING_HUB_DB = tempDbFile

let instance: Awaited<ReturnType<typeof initDb>>

beforeAll(async () => {
  instance = await initDb({ driver: 'better-sqlite3', path: tempDbFile })
})

afterAll(() => {
  try {
    instance?.$client.close()
  } catch {
    /* already closed */
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {
    /* best-effort cleanup on Windows (a handle may linger) */
  }
})

describe('DbImageStore (default getImageStore)', () => {
  it('put → get round-trip preserves bytes and content type, storing base64 in images.data', async () => {
    const bytes = new Uint8Array(2048)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + (i % 3) * 251) % 256
    const store = getImageStore()

    const { id, rowId } = await store.put(bytes, 'png', 'image/png')
    expect(id.endsWith('.png')).toBe(true)
    expect(Number.isInteger(rowId)).toBe(true)

    const out = await store.get(id)
    expect(out).not.toBeNull()
    expect(out!.contentType).toBe('image/png')
    expect(Buffer.from(out!.bytes).equals(Buffer.from(bytes))).toBe(true)

    // the registry row carries the base64 payload itself
    const [row] = await db.select().from(images).where(eq(images.id, rowId)).limit(1)
    expect(row?.data).toBeTypeOf('string')
    expect(Buffer.from(row!.data!, 'base64').equals(Buffer.from(bytes))).toBe(true)

    // DB-backed upload: no file was written to the images dir
    expect(fs.existsSync(path.join(resolveImagesDir(), id))).toBe(false)
  })

  it('stores the validated mime verbatim (not an ext-derived guess)', async () => {
    const store = getImageStore()
    const { id } = await store.put(new Uint8Array([1, 2, 3]), 'jpg', 'image/jpeg')
    expect((await store.get(id))!.contentType).toBe('image/jpeg')
  })

  it('falls back to the fs store for a legacy row with data = NULL (file on disk)', async () => {
    const dir = resolveImagesDir()
    fs.mkdirSync(dir, { recursive: true })
    const legacyBytes = new Uint8Array([9, 8, 7, 0, 255, 128])
    const filename = `legacy-${globalThis.crypto.randomUUID()}.png`
    fs.writeFileSync(path.join(dir, filename), legacyBytes)

    await db.insert(images).values({ filename, mime: 'image/png' }).run()

    const out = await getImageStore().get(filename)
    expect(out).not.toBeNull()
    expect(out!.contentType).toBe('image/png')
    expect(Buffer.from(out!.bytes).equals(Buffer.from(legacyBytes))).toBe(true)
  })

  it('returns null for an unknown storage id (404 case)', async () => {
    expect(await getImageStore().get(`nope-${globalThis.crypto.randomUUID()}.png`)).toBeNull()
  })

  it('returns null when a legacy row has neither data nor a file on disk', async () => {
    const filename = `ghost-${globalThis.crypto.randomUUID()}.png`
    await db.insert(images).values({ filename, mime: 'image/png' }).run()
    expect(await getImageStore().get(filename)).toBeNull()
  })
})
