/**
 * Bounded ZIP reader for untrusted archives (.apkg, .epub).
 *
 * Why not `unzipSync(bytes, { filter })`: the filter only sees central-directory
 * metadata. fflate then allocates `originalSize` bytes for each accepted entry, so a
 * lying header forces a big allocation (or silently truncates when it lies small).
 *
 * Mechanism here:
 *  1. Parse the central directory ourselves, with input, entry-count, per-entry and
 *     declared-total limits enforced BEFORE any inflation or output allocation.
 *  2. Inflate only the entries a caller asks for, through fflate's streaming `Inflate`,
 *     counting output bytes per chunk and aborting as soon as the declared size is
 *     exceeded. Input is pushed in small chunks, so the overshoot before an abort is
 *     bounded by `PUSH_CHUNK * 1032` (deflate's maximum expansion ratio), about 4 MiB.
 *  3. Require actual size == declared size and CRC-32 match, and count actual accepted
 *     bytes against the total limit. Nothing is truncated silently.
 *
 * Fail closed: ZIP64, encrypted entries, methods other than stored/deflate, duplicate
 * names (case-insensitive), lying or inconsistent headers, trailing central-directory
 * bytes. Pure JS, no `node:*` imports.
 */
import { Inflate } from 'fflate'

export interface ArchiveLimits {
  /** Max size of the whole archive in bytes. */
  maxInputBytes: number
  /** Max declared (and actual) uncompressed bytes of any one entry. */
  maxEntryBytes: number
  /** Max number of central-directory entries, counting every entry. */
  maxEntries: number
  /** Max declared uncompressed bytes over ALL entries, and max actual bytes inflated. */
  maxTotalBytes: number
}

const MiB = 1024 * 1024

export const APKG_LIMITS: ArchiveLimits = {
  maxInputBytes: 100 * MiB,
  maxEntryBytes: 64 * MiB,
  maxEntries: 100_000,
  maxTotalBytes: 128 * MiB,
}

export const EPUB_LIMITS: ArchiveLimits = {
  maxInputBytes: 100 * MiB,
  maxEntryBytes: 16 * MiB,
  maxEntries: 50_000,
  maxTotalBytes: 128 * MiB,
}

export class ArchiveLimitError extends Error {
  constructor(
    message: string,
    readonly code: 'not-zip' | 'limit' | 'unsupported' | 'corrupt' | 'duplicate',
  ) {
    super(message)
    this.name = 'ArchiveLimitError'
  }
}

export interface BoundedZip {
  /** Normalized entry names in central-directory order (directories included). */
  names: string[]
  has(name: string): boolean
  /** Inflate one entry (cached). Throws ArchiveLimitError on any violation. */
  read(name: string): Uint8Array
}

interface Entry {
  name: string
  rawName: Uint8Array
  method: number
  crc: number
  csize: number
  usize: number
  localOffset: number
  isDir: boolean
}

const PUSH_CHUNK = 4096
const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50
const ZIP64_LOCATOR_SIG = 0x07064b50

let crcTable: Uint32Array | null = null
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function normalizeName(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\/+/, '')
}

export function openBoundedZip(bytes: Uint8Array, limits: ArchiveLimits): BoundedZip {
  if (bytes.length > limits.maxInputBytes) {
    throw new ArchiveLimitError(
      `archive is ${bytes.length} bytes, over the ${limits.maxInputBytes} byte input limit`,
      'limit',
    )
  }
  if (bytes.length < 22) throw new ArchiveLimitError('not a ZIP archive', 'not-zip')
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // End of central directory: last signature whose comment length reaches the end.
  let eocd = -1
  const lowest = Math.max(0, bytes.length - 22 - 0xffff)
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (
      dv.getUint32(i, true) === EOCD_SIG &&
      i + 22 + dv.getUint16(i + 20, true) === bytes.length
    ) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ArchiveLimitError('not a ZIP archive', 'not-zip')

  if (eocd >= 20 && dv.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIG) {
    throw new ArchiveLimitError('ZIP64 archives are not supported', 'unsupported')
  }
  const diskNo = dv.getUint16(eocd + 4, true)
  const cdDisk = dv.getUint16(eocd + 6, true)
  const entriesHere = dv.getUint16(eocd + 8, true)
  const entryCount = dv.getUint16(eocd + 10, true)
  const cdSize = dv.getUint32(eocd + 12, true)
  const cdOffset = dv.getUint32(eocd + 16, true)
  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ArchiveLimitError('ZIP64 archives are not supported', 'unsupported')
  }
  if (diskNo !== 0 || cdDisk !== 0 || entriesHere !== entryCount) {
    throw new ArchiveLimitError('multi-disk ZIP archives are not supported', 'unsupported')
  }
  if (entryCount > limits.maxEntries) {
    throw new ArchiveLimitError(
      `archive has ${entryCount} entries, over the ${limits.maxEntries} entry limit`,
      'limit',
    )
  }
  if (cdOffset + cdSize !== eocd) {
    throw new ArchiveLimitError('inconsistent central directory bounds', 'corrupt')
  }

  const entries = new Map<string, Entry>()
  const lowerSeen = new Set<string>()
  const names: string[] = []
  const utf8 = new TextDecoder('utf-8', { fatal: true })
  let p = cdOffset
  let declaredTotal = 0
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > eocd || dv.getUint32(p, true) !== CEN_SIG) {
      throw new ArchiveLimitError('corrupt central directory', 'corrupt')
    }
    const flags = dv.getUint16(p + 8, true)
    const method = dv.getUint16(p + 10, true)
    const crc = dv.getUint32(p + 16, true)
    const csize = dv.getUint32(p + 20, true)
    const usize = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOffset = dv.getUint32(p + 42, true)
    const next = p + 46 + nameLen + extraLen + commentLen
    if (next > eocd) throw new ArchiveLimitError('corrupt central directory', 'corrupt')

    if (flags & 0x2041) {
      throw new ArchiveLimitError('encrypted ZIP entries are not supported', 'unsupported')
    }
    if (method !== 0 && method !== 8) {
      throw new ArchiveLimitError(`unsupported ZIP compression method ${method}`, 'unsupported')
    }
    if (csize === 0xffffffff || usize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ArchiveLimitError('ZIP64 entries are not supported', 'unsupported')
    }
    // Extra fields: refuse a ZIP64 extended-information record (id 0x0001).
    let x = p + 46 + nameLen
    const xEnd = x + extraLen
    while (x + 4 <= xEnd) {
      if (dv.getUint16(x, true) === 0x0001) {
        throw new ArchiveLimitError('ZIP64 entries are not supported', 'unsupported')
      }
      x += 4 + dv.getUint16(x + 2, true)
    }

    const rawName = bytes.subarray(p + 46, p + 46 + nameLen)
    let name: string
    try {
      name = normalizeName(utf8.decode(rawName))
    } catch {
      throw new ArchiveLimitError('ZIP entry name is not valid UTF-8', 'corrupt')
    }
    const isDir = name.endsWith('/')
    if (name === '') throw new ArchiveLimitError('ZIP entry has an empty name', 'corrupt')
    const lower = name.toLowerCase()
    if (lowerSeen.has(lower)) {
      throw new ArchiveLimitError(`duplicate ZIP entry name "${name}"`, 'duplicate')
    }
    lowerSeen.add(lower)

    if (usize > limits.maxEntryBytes) {
      throw new ArchiveLimitError(
        `entry "${name}" declares ${usize} bytes, over the ${limits.maxEntryBytes} byte entry limit`,
        'limit',
      )
    }
    declaredTotal += usize
    if (declaredTotal > limits.maxTotalBytes) {
      throw new ArchiveLimitError(
        `archive declares more than ${limits.maxTotalBytes} uncompressed bytes in total`,
        'limit',
      )
    }
    if (method === 0 && csize !== usize) {
      throw new ArchiveLimitError(`stored entry "${name}" has inconsistent sizes`, 'corrupt')
    }
    if (isDir && usize !== 0) {
      throw new ArchiveLimitError(`directory entry "${name}" has data`, 'corrupt')
    }
    if (localOffset >= cdOffset) {
      throw new ArchiveLimitError(`entry "${name}" points outside the archive body`, 'corrupt')
    }
    entries.set(name, { name, rawName, method, crc, csize, usize, localOffset, isDir })
    names.push(name)
    p = next
  }
  if (p !== eocd) throw new ArchiveLimitError('unexpected bytes in central directory', 'corrupt')

  const cache = new Map<string, Uint8Array>()
  let acceptedTotal = 0

  const read = (name: string): Uint8Array => {
    const cached = cache.get(name)
    if (cached) return cached
    const e = entries.get(name)
    if (!e) throw new ArchiveLimitError(`entry "${name}" not found`, 'corrupt')
    if (e.isDir) return new Uint8Array(0)

    const o = e.localOffset
    if (o + 30 > cdOffset || dv.getUint32(o, true) !== LOC_SIG) {
      throw new ArchiveLimitError(`entry "${name}" has a bad local header`, 'corrupt')
    }
    const lflags = dv.getUint16(o + 6, true)
    const lmethod = dv.getUint16(o + 8, true)
    const lNameLen = dv.getUint16(o + 26, true)
    const lExtraLen = dv.getUint16(o + 28, true)
    if (lflags & 0x2041) {
      throw new ArchiveLimitError('encrypted ZIP entries are not supported', 'unsupported')
    }
    const nameStart = o + 30
    const dataStart = nameStart + lNameLen + lExtraLen
    const dataEnd = dataStart + e.csize
    if (lmethod !== e.method || lNameLen !== e.rawName.length || dataEnd > cdOffset) {
      throw new ArchiveLimitError(`entry "${name}" has an inconsistent local header`, 'corrupt')
    }
    for (let i = 0; i < lNameLen; i++) {
      if (bytes[nameStart + i] !== e.rawName[i]) {
        throw new ArchiveLimitError(`entry "${name}" has an inconsistent local header`, 'corrupt')
      }
    }
    if (acceptedTotal + e.usize > limits.maxTotalBytes) {
      throw new ArchiveLimitError(
        `accepted bytes would exceed the ${limits.maxTotalBytes} byte total limit`,
        'limit',
      )
    }

    const data = bytes.subarray(dataStart, dataEnd)
    let out: Uint8Array
    if (e.method === 0) {
      out = data.slice()
    } else {
      const chunks: Uint8Array[] = []
      let n = 0
      const inf = new Inflate((chunk) => {
        if (n + chunk.length > e.usize) {
          throw new ArchiveLimitError(
            `entry "${name}" inflates past its declared ${e.usize} bytes`,
            'corrupt',
          )
        }
        chunks.push(chunk.slice())
        n += chunk.length
      })
      try {
        for (let i = 0; i < data.length; i += PUSH_CHUNK) {
          inf.push(
            data.subarray(i, Math.min(i + PUSH_CHUNK, data.length)),
            i + PUSH_CHUNK >= data.length,
          )
        }
        if (data.length === 0) inf.push(new Uint8Array(0), true)
      } catch (err) {
        if (err instanceof ArchiveLimitError) throw err
        throw new ArchiveLimitError(`entry "${name}" is corrupt or truncated`, 'corrupt')
      }
      if (n !== e.usize) {
        throw new ArchiveLimitError(
          `entry "${name}" inflated to ${n} bytes, header declared ${e.usize}`,
          'corrupt',
        )
      }
      out = new Uint8Array(n)
      let at = 0
      for (const c of chunks) {
        out.set(c, at)
        at += c.length
      }
    }
    if (crc32(out) !== e.crc) {
      throw new ArchiveLimitError(`entry "${name}" failed its CRC-32 check`, 'corrupt')
    }
    acceptedTotal += out.length
    cache.set(name, out)
    return out
  }

  return { names, has: (n) => entries.has(n), read }
}
