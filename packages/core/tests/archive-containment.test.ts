import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  ArchiveLimitError,
  INFLATE_PUSH_CHUNK,
  MAX_DEFLATE_RATIO,
  openBoundedZip,
  type ArchiveLimits,
} from '../src/archive-limits'
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

  it('refuses over-limit input and entry count at open; output caps apply to reads only', () => {
    expectCode(() => openBoundedZip(small, { ...BIG, maxInputBytes: 10 }), 'limit')
    expectCode(() => openBoundedZip(small, { ...BIG, maxEntries: 1 }), 'limit')
    // entry cap: a.txt (23 bytes) is refused when read, b.txt (5) is fine, nothing at open
    const z = openBoundedZip(small, { ...BIG, maxEntryBytes: 10 })
    expectCode(() => z.read('a.txt'), 'limit')
    expect(z.read('b.txt')).toHaveLength(5)
    // total cap: second read would push accepted bytes past 25
    const t = openBoundedZip(small, { ...BIG, maxTotalBytes: 25 })
    t.read('a.txt')
    expectCode(() => t.read('b.txt'), 'limit')
  })

  it('refuses a real deflate bomb at the entry limit and never inflates it', () => {
    const bomb = zipSync({ 'z.bin': new Uint8Array(3 * MiB) }) // ~3 KiB on disk
    expect(bomb.length).toBeLessThan(10_000)
    expectCode(() => openBoundedZip(bomb, { ...BIG, maxEntryBytes: MiB }).read('z.bin'), 'limit')
  })

  it('aborts when the header lies small about a bomb (no silent truncation)', () => {
    const bomb = zipSync({ 'z.bin': new Uint8Array(3 * MiB) })
    const lie = patched(bomb, (dv) => dv.setUint32(cenOffsets(bomb)[0]! + 24, 1000, true))
    const z = openBoundedZip(lie, BIG)
    expectCode(() => z.read('z.bin'), 'corrupt')
  })

  it('measures the inflate overshoot: abort happens within one push chunk of expansion', () => {
    const bomb = zipSync({ 'z.bin': new Uint8Array(8 * MiB) }) // ~8 KiB compressed
    const declared = 1000
    const lie = patched(bomb, (dv) => dv.setUint32(cenOffsets(bomb)[0]! + 24, declared, true))
    let peak = 0
    const z = openBoundedZip(lie, BIG, (n) => (peak = Math.max(peak, n)))
    expectCode(() => z.read('z.bin'), 'corrupt')
    // never more than one 4 KiB push worth of maximum-ratio expansion past the declared size
    expect(peak).toBeGreaterThan(declared)
    expect(peak).toBeLessThanOrEqual(declared + INFLATE_PUSH_CHUNK * MAX_DEFLATE_RATIO)
    expect(peak).toBeLessThan(8 * MiB) // and the bomb was not fully inflated
  })

  it('refuses overlapping entries and overflow-sized fields', () => {
    const z = zipSync({ 'a.txt': strToU8('hello hello hello'), 'b.txt': strToU8('world world') })
    const [c0, c1] = cenOffsets(z)
    const dv0 = new DataView(z.buffer, z.byteOffset)
    const overlap = patched(z, (dv) => dv.setUint32(c1! + 42, dv0.getUint32(c0! + 42, true), true))
    expectCode(() => openBoundedZip(overlap, BIG), 'corrupt')
    // csize near 2^32 - 2 must not wrap: the data range is past the central directory
    const huge = patched(z, (dv) => dv.setUint32(c0! + 20, 0xfffffffe, true))
    expectCode(() => openBoundedZip(huge, BIG), 'corrupt')
    // local offset near 2^32 - 2 points outside the body
    const off = patched(z, (dv) => dv.setUint32(c0! + 42, 0xfffffffe, true))
    expectCode(() => openBoundedZip(off, BIG), 'corrupt')
  })

  it('refuses bytes trailing the deflate stream inside the declared compressed size', () => {
    const z = zipSync({ 'a.txt': strToU8('hello hello hello hello') }, { level: 6 })
    const dv = new DataView(z.buffer, z.byteOffset)
    const c = cenOffsets(z)[0]!
    const csize = dv.getUint32(c + 20, true)
    const nameLen = dv.getUint16(c + 28, true)
    const dataEnd = 30 + nameLen + dv.getUint16(28, true) + csize
    // rebuild: local+data+8 junk bytes+central dir+eocd, with csize bumped by 8 in both headers
    const body = z.subarray(0, dataEnd)
    const rest = z.subarray(dataEnd)
    const out = new Uint8Array(z.length + 8)
    out.set(body, 0)
    out.set([1, 2, 3, 4, 5, 6, 7, 8], dataEnd)
    out.set(rest, dataEnd + 8)
    const odv = new DataView(out.buffer)
    odv.setUint32(18, csize + 8, true) // local csize
    const nc = c + 8
    odv.setUint32(nc + 20, csize + 8, true)
    const eocd = out.length - 22
    odv.setUint32(eocd + 16, dv.getUint32(z.length - 22 + 16, true) + 8, true)
    const zz = openBoundedZip(out, BIG)
    expectCode(() => zz.read('a.txt'), 'corrupt')
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

  it('refuses when both collection.anki2 and collection.anki21 are present', async () => {
    const z = zipSync({
      'collection.anki2': new Uint8Array([1, 2, 3]),
      'collection.anki21': new Uint8Array([9, 9, 9]),
    })
    const seen: Uint8Array[] = []
    await expect(parseApkg(z, { openDatabase: opener(seen) as never })).rejects.toThrow(
      /both collection\.anki2 and collection\.anki21/,
    )
    expect(seen).toHaveLength(0)
  })

  it('accepts either single collection and never inflates unused media', async () => {
    for (const key of ['collection.anki2', 'collection.anki21']) {
      const z = zipSync({ [key]: new Uint8Array([1, 2, 3]), '0': new Uint8Array([7, 7]) })
      // media entry '0' sorts first in the object (integer key): corrupt its CRC; if inflated, parseApkg would throw
      const bad = patched(z, (dv) => dv.setUint32(cenOffsets(z)[0]! + 16, 123, true))
      const seen: Uint8Array[] = []
      await parseApkg(bad, { openDatabase: opener(seen) as never })
      expect([...seen[0]!]).toEqual([1, 2, 3])
    }
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

  it('does not refuse an oversized UNUSED entry (never allocated), but refuses an oversized chapter', () => {
    const base = zipSync(files({ 'OEBPS/big.bin': new Uint8Array(4) }))
    const unused = patched(base, (dv) => dv.setUint32(cenOffsets(base)[3]! + 24, 17 * MiB, true))
    // the unused entry's header lies large: structurally valid, never read, nothing allocated
    expect(extractEpubBytes(unused).chapters).toHaveLength(1)
    const chap = patched(base, (dv) => dv.setUint32(cenOffsets(base)[2]! + 24, 17 * MiB, true))
    expect(() => extractEpubBytes(chap)).toThrow(/Invalid EPUB file .*entry limit/)
  })

  it('refuses a chapter listed in the OPF but missing from the archive', () => {
    const f = files()
    delete (f as Record<string, unknown>)['OEBPS/c1.xhtml']
    expect(() => extractEpubBytes(zipSync(f))).toThrow(/chapter "c1.xhtml".*missing/)
  })

  it('keeps multi-chapter spine order and resolves container-relative paths', () => {
    const ch = (t: string) =>
      `<html><body><h1>${t}</h1><p>${'Body text for chapter. '.repeat(4)}</p></body></html>`
    const z = zipSync({
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="book/OPS/p.opf"/></rootfiles></container>',
      ),
      'book/OPS/p.opf': strToU8(
        `<package><metadata><dc:title>Multi</dc:title></metadata><manifest>
        <item id="b" href="../text/b.xhtml" media-type="application/xhtml+xml"/>
        <item id="a" href="a%20one.xhtml" media-type="application/xhtml+xml"/>
        <item id="c" href="sub/c.xhtml" media-type="application/xhtml+xml"/></manifest>
        <spine><itemref idref="c"/><itemref idref="a"/><itemref idref="b"/></spine></package>`,
      ),
      'book/text/b.xhtml': strToU8(ch('Bee')),
      'book/OPS/a one.xhtml': strToU8(ch('Ay')),
      'book/OPS/sub/c.xhtml': strToU8(ch('Sea')),
    })
    expect(extractEpubBytes(z).chapters.map((c) => c.title)).toEqual(['Sea', 'Ay', 'Bee'])
  })

  it('refuses malformed edges: no OPF, unreadable OPF path', () => {
    expect(() => extractEpubBytes(zipSync({ 'x.txt': strToU8('hi') }))).toThrow(
      /missing OPF package manifest/,
    )
    expect(() =>
      extractEpubBytes(
        zipSync({
          'META-INF/container.xml': strToU8('<rootfile full-path="nope.opf"/>'),
        }),
      ),
    ).toThrow(/could not read "nope.opf"/)
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
