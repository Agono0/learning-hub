/**
 * Runtime-portability guard for src/anki.ts.
 *
 * better-sqlite3 is a Node-native addon — unusable in a browser/webview
 * worker. This file mocks it to THROW on import, then proves that:
 * 1. the anki module loads fine with better-sqlite3 entirely unavailable;
 * 2. the ZIP/plain-text layers of parseApkg never touch the driver;
 * 3. the driver is resolved ONLY by the default opener (a valid collection
 *    parsed without a custom opener is what triggers the load — and it fails
 *    loudly here because the driver is "absent").
 *
 * Lives in its own file because `vi.mock` is module-graph-wide per test file
 * (anki-io.test.ts exercises the real Node default opener).
 */
import { describe, expect, it, vi } from 'vitest'
import { zipSync } from 'fflate'

vi.mock('better-sqlite3', () => {
  throw new Error('better-sqlite3 is not available in this runtime')
})

import { parseApkg } from '../src/anki'

describe('anki module portability (better-sqlite3 absent)', () => {
  it('the module loads without better-sqlite3 present (this import is the proof)', () => {
    expect(parseApkg).toBeTypeOf('function')
  })

  it('the zip layer runs untouched: no-collection ZIPs fail before any driver load', async () => {
    const bytes = zipSync({ 'collection.anki21b': new Uint8Array([1, 2, 3]) })
    // rejects with the collection error — NOT the better-sqlite3 mock error
    await expect(parseApkg(bytes)).rejects.toThrow(/no legacy collection/)
  })

  it('invalid ZIP input fails before any driver load', async () => {
    await expect(parseApkg(new TextEncoder().encode('not a zip'))).rejects.toThrow()
  })

  it('the DEFAULT opener is the only better-sqlite3 trigger: parsing a valid collection without a custom opener tries to load it', async () => {
    const bytes = zipSync({ 'collection.anki2': new Uint8Array([1, 2, 3]) })
    // the mocked driver throws at import time — exactly what the default opener
    // triggers. Vitest wraps factory errors, hence the "mocking a module" text.
    await expect(parseApkg(bytes)).rejects.toThrow(/mocking a module/)
  })
})
