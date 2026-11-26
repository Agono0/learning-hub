import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  InputTooLargeError,
  readBoundedJson,
  readBoundedText,
} from '../../../apps/cli/src/bounded-input'

const dir = mkdtempSync(path.join(tmpdir(), 'lh-bounded-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('CLI bounded input', () => {
  it('reads a small file and parses JSON', () => {
    const f = path.join(dir, 'a.json')
    writeFileSync(f, '{"ok":true}')
    expect(readBoundedText(f)).toBe('{"ok":true}')
    expect(readBoundedJson(f)).toEqual({ ok: true })
  })
  it('accepts a file exactly at the limit and refuses one byte over', () => {
    const f = path.join(dir, 'edge.txt')
    writeFileSync(f, 'x'.repeat(100))
    expect(readBoundedText(f, 100)).toHaveLength(100)
    expect(() => readBoundedText(f, 99)).toThrow(InputTooLargeError)
  })
  it('refuses directories and device files', () => {
    expect(() => readBoundedText(dir)).toThrow(/not a regular file/)
    expect(() => readBoundedText('/dev/zero', 1024)).toThrow(/not a regular file/)
  })
  it('names the source when JSON is invalid', () => {
    const f = path.join(dir, 'bad.json')
    writeFileSync(f, '{nope')
    expect(() => readBoundedJson(f)).toThrow(/bad\.json" is not valid JSON/)
  })
  it('reports a missing file with the filesystem error', () => {
    expect(() => readBoundedText(path.join(dir, 'missing.json'))).toThrow(/ENOENT/)
  })
})
