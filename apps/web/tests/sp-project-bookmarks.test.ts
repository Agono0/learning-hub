/**
 * Unit tests for the device-local project bookmark store (S3-74): roundtrip
 * per project, isolation between projects, removal, and corrupted-storage
 * degradation (reads as empty, never crashes).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addBookmark, loadBookmarks, removeBookmark } from '../src/lib/project-bookmarks'

function stubStorage(): void {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('project bookmarks store (S3-74)', () => {
  it('roundtrips rows per project, oldest first', () => {
    stubStorage()
    addBookmark({ projectId: 7, type: 'url', value: 'https://docs.example.com', title: 'Docs' })
    addBookmark({ projectId: 7, type: 'command', value: 'npm test' })
    const rows = loadBookmarks(7)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ projectId: 7, type: 'url', title: 'Docs' })
    expect(rows[1]!.type).toBe('command')
  })

  it('isolates projects', () => {
    stubStorage()
    addBookmark({ projectId: 7, type: 'url', value: 'a' })
    addBookmark({ projectId: 8, type: 'file', value: '/tmp/spec.md' })
    expect(loadBookmarks(7)).toHaveLength(1)
    expect(loadBookmarks(8)).toHaveLength(1)
    expect(loadBookmarks(8)[0]!.value).toBe('/tmp/spec.md')
  })

  it('removes one row and keeps the rest', () => {
    stubStorage()
    addBookmark({ projectId: 7, type: 'url', value: 'a' })
    const b = addBookmark({ projectId: 7, type: 'url', value: 'b' })
    const remaining = removeBookmark(7, b.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.value).toBe('a')
    expect(loadBookmarks(7)).toHaveLength(1)
  })

  it('degrades corrupted storage to empty (never crashes)', () => {
    stubStorage()
    window.localStorage.setItem('lh-project-bookmarks', 'not-json{')
    expect(loadBookmarks(7)).toEqual([])
    // Wrong shapes inside the array are dropped row-wise.
    window.localStorage.setItem(
      'lh-project-bookmarks',
      JSON.stringify({
        7: [
          { id: 'x' },
          null,
          { id: 'y', projectId: 7, type: 'url', value: 'ok', title: null, createdAt: '2026-01-01' },
        ],
      }),
    )
    expect(loadBookmarks(7)).toEqual([expect.objectContaining({ id: 'y', value: 'ok' })])
  })

  it('reads empty without any storage (SSR/private mode)', () => {
    vi.stubGlobal('window', {})
    expect(loadBookmarks(7)).toEqual([])
  })
})
