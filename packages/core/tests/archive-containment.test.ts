import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { ArchiveLimitError, openBoundedZip, type ArchiveLimits } from '../src/archive-limits'
import { parseApkg } from '../src/anki'
import { extractEpubBytes } from '../src/ingest'

const MiB = 1024 * 1024
const BIG: ArchiveLimits = {
  maxInputBytes: 100 * MiB,
  maxEntryBytes: 64 * MiB,
  maxEntries: 100_000,
  maxTotalBytes: 128 * MiB,
}

/** Offsets of every central-directory header (signature 0x02014b50). */
function cenOffsets(z: Uint8Array): number[] {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const out: number[] = []
  for (let i = 0; i + 4 <= z.length; i++) if (dv.getUint32(i, true) === 0x02014b50) out.push(i)
  return out
}
function patched(z: Uint8Array, fn: (dv: DataView, u8: Uint8Array) => void): Uint8Array {
  const c = z.slice()
  fn(new DataView(c.buffer), c)
  return c
}
function expectCode(fn: () => unknown, code: ArchiveLimitError['code']): void {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ArchiveLimitError)
    expect((e as ArchiveLimitError).code).toBe(code)
    return
  }
  throw new Error('expected ArchiveLimitError')
}

const small = zipSync({ 'a.txt': strToU8('hello hello hello hello'), 'b.txt': strToU8('world') })

describe('openBoundedZip', () => {
  it('reads a normal archive and verifies size and CRC', () => {
    const z = openBoundedZip(small, BIG)
    expect(z.names).toEqual(['a.txt', 'b.txt'])
    expect(new TextDecoder().decode(z.read('a.txt'))).toBe('hello hello hello hello')
  })

  it('refuses over-limit input, entry count, entry size and declared total before inflating', () => {
    expectCode(() => openBoundedZip(small, { ...BIG, maxInputBytes: 10 }), 'limit')
    expectCode(() => openBoundedZip(small, { ...BIG, maxEntries: 1 }), 'limit')
    expectCode(() => openBoundedZip(small, { ...BIG, maxEntryBytes: 10 }), 'limit')
    expectCode(() => openBoundedZip(small, { ...BIG, maxTotalBytes: 25 }), 'limit')
  })

  it('refuses a real deflate bomb at the entry limit and never inflates it', () => {
    const bomb = zipSync({ 'z.bin': new Uint8Array(3 * MiB) }) // ~3 KiB on disk
    expect(bomb.length).toBeLessThan(10_000)
    expectCode(() => openBoundedZip(bomb, { ...BIG, maxEntryBytes: MiB }), 'limit')
  })

  it('aborts when the header lies small about a bomb (no silent truncation)', () => {
    const bomb = zipSync({ 'z.bin': new Uint8Array(3 * MiB) })
    const lie = patched(bomb, (dv) => dv.setUint32(cenOffsets(bomb)[0]! + 24, 1000, true))
    const z = openBoundedZip(lie, BIG)
    expectCode(() => z.read('z.bin'), 'corrupt')
  })

  it('refuses a header that lies large (declared more than actual)', () => {
    const lie = patched(small, (dv) => dv.setUint32(cenOffsets(small)[0]! + 24, 500, true))
    const z = openBoundedZip(lie, BIG)
    expectCode(() => z.read('a.txt'), 'corrupt')
  })

  it('refuses a CRC mismatch', () => {
    const lie = patched(small, (dv) => dv.setUint32(cenOffsets(small)[1]! + 16, 1, true))
    expectCode(() => openBoundedZip(lie, BIG).read('b.txt'), 'corrupt')
  })

  it('refuses ZIP64 markers, unsupported methods and encrypted entries', () => {
    const eocd = small.length - 22
    const z64 = patched(small, (dv) => dv.setUint16(eocd + 10, 0xffff, true))
    expectCode(() => openBoundedZip(z64, BIG), 'unsupported')
    const meth = patched(small, (dv) => dv.setUint16(cenOffsets(small)[0]! + 10, 12, true))
    expectCode(() => openBoundedZip(meth, BIG), 'unsupported')
    const enc = patched(small, (dv) => dv.setUint16(cenOffsets(small)[0]! + 8, 1, true))
    expectCode(() => openBoundedZip(enc, BIG), 'unsupported')
  })

  it('refuses duplicate names, including case-only duplicates', () => {
    const dup = zipSync({ 'a.txt': strToU8('x'), 'b.txt': strToU8('y') })
    const same = patched(dup, (_dv, u8) => {
      const second = cenOffsets(dup)[1]!
      u8[second + 46] = 'a'.charCodeAt(0)
    })
    expectCode(() => openBoundedZip(same, BIG), 'duplicate')
    const cased = patched(dup, (_dv, u8) => {
      u8[cenOffsets(dup)[1]! + 46] = 'A'.charCodeAt(0)
    })
    expectCode(() => openBoundedZip(cased, BIG), 'duplicate')
  })

  it('refuses a local header that disagrees with the central directory', () => {
    const bad = patched(small, (_dv, u8) => {
      u8[30] = 'q'.charCodeAt(0) // first local header name byte
    })
    expectCode(() => openBoundedZip(bad, BIG).read('a.txt'), 'corrupt')
  })

  it('refuses truncated and non-ZIP input', () => {
    expectCode(() => openBoundedZip(small.subarray(0, small.length - 10), BIG), 'not-zip')
    expectCode(() => openBoundedZip(new Uint8Array(100), BIG), 'not-zip')
  })
})

describe('parseApkg containment', () => {
  const opener = (seen: Uint8Array[]) => (bytes: Uint8Array) => {
    seen.push(bytes)
    return {
      prepare: (sql: string) => ({
        get: () => (sql.includes('FROM col') ? { models: '{}', decks: '{}' } : undefined),
        all: () => [],
      }),
      close() {},
    }
  }

  it('inflates only the chosen collection and never the unused one', async () => {
    const z = zipSync({
      'collection.anki2': new Uint8Array([1, 2, 3]),
      'collection.anki21': new Uint8Array([9, 9, 9]),
    })
    // corrupt the CRC of the unused collection: if it were read, parseApkg would throw
    const second = cenOffsets(z)[1]!
    const bad = patched(z, (dv) => dv.setUint32(second + 16, 123, true))
    const seen: Uint8Array[] = []
    await parseApkg(bad, { openDatabase: opener(seen) as never })
    expect(seen).toHaveLength(1)
    expect([...seen[0]!]).toEqual([1, 2, 3])
  })

  it('rejects a lying collection header instead of importing a truncated database', async () => {
    const z = zipSync({ 'collection.anki2': strToU8('x'.repeat(2000)) })
    const lie = patched(z, (dv) => dv.setUint32(cenOffsets(z)[0]! + 24, 10, true))
    await expect(parseApkg(lie, { openDatabase: opener([]) as never })).rejects.toThrow(
      /invalid \.apkg/,
    )
  })

  it('rejects an over-limit entry and non-ZIP input with a clear error', async () => {
    const tiny = zipSync({ 'collection.anki2': new Uint8Array([1, 2, 3]) })
    // header-only lie: declares 70 MiB; refused at open, nothing is allocated or inflated
    const bomb = patched(tiny, (dv) => dv.setUint32(cenOffsets(tiny)[0]! + 24, 70 * MiB, true))
    await expect(parseApkg(bomb, { openDatabase: opener([]) as never })).rejects.toThrow(
      /entry limit/,
    )
    await expect(parseApkg(new Uint8Array(50))).rejects.toThrow(/invalid \.apkg/)
  })
})

describe('extractEpubBytes containment', () => {
  const container = `<container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>`
  const opf = `<package><metadata><dc:title>T</dc:title></metadata><manifest>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
    <spine><itemref idref="c1"/></spine></package>`
  const chapter = `<html><body><h1>One</h1><p>${'Readable text here. '.repeat(5)}</p></body></html>`
  const files = (extra: Record<string, Uint8Array> = {}) => ({
    'META-INF/container.xml': strToU8(container),
    'OEBPS/c.opf': strToU8(opf),
    'OEBPS/c1.xhtml': strToU8(chapter),
    ...extra,
  })

  it('still extracts a normal EPUB', () => {
    expect(extractEpubBytes(zipSync(files())).chapters).toHaveLength(1)
  })

  it('never inflates resources the parser does not read (images, css)', () => {
    const z = zipSync(files({ 'OEBPS/cover.jpg': new Uint8Array([1, 2, 3, 4]) }))
    const names = cenOffsets(z).length
    expect(names).toBe(4)
    const bad = patched(z, (dv) => dv.setUint32(cenOffsets(z)[3]! + 16, 77, true)) // wrong CRC
    expect(extractEpubBytes(bad).chapters).toHaveLength(1)
  })

  it('refuses an oversized declared entry (even an unread image) instead of skipping it', () => {
    const base = zipSync(files({ 'OEBPS/big.bin': new Uint8Array(4) }))
    const z = patched(base, (dv) => dv.setUint32(cenOffsets(base)[3]! + 24, 17 * MiB, true))
    expect(() => extractEpubBytes(z)).toThrow(/Invalid EPUB file .*entry limit/)
  })

  it('refuses a chapter whose header lies small (no silently truncated chapter)', () => {
    const z = zipSync(files())
    const idx = 2 // OEBPS/c1.xhtml
    const lie = patched(z, (dv) => dv.setUint32(cenOffsets(z)[idx]! + 24, 30, true))
    expect(() => extractEpubBytes(lie)).toThrow(/Invalid EPUB file/)
  })

  it('keeps the existing message for non-ZIP input', () => {
    expect(() => extractEpubBytes(new Uint8Array(40))).toThrow(/could not unpack ZIP archive/)
  })
})
