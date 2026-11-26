/**
 * Bounded local input for CLI commands.
 *
 * `--file` and stdin payloads used to be read with an unbounded `readFileSync`
 * and parsed straight away, so a huge file, a device file (`/dev/zero`) or an
 * endless pipe could exhaust memory. These helpers cap the size, refuse
 * non-regular files, and turn parse failures into one clear Error.
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

/** Default cap for a CLI JSON/text payload (8 MiB). */
export const MAX_CLI_INPUT_BYTES = 8 * 1024 * 1024

export class InputTooLargeError extends Error {
  constructor(source: string, maxBytes: number) {
    super(`${source} is larger than the ${maxBytes} byte limit`)
    this.name = 'InputTooLargeError'
  }
}

/**
 * Read a regular file path, or an already-open descriptor (0 is stdin), as UTF-8 text, never
 * holding more than `maxBytes`. Directories, FIFOs, sockets and devices given
 * as paths are refused (stdin may legitimately be a pipe).
 */
export function readBoundedText(
  source: string | 0,
  maxBytes: number = MAX_CLI_INPUT_BYTES,
): string {
  const isFd = typeof source === 'number'
  const label = source === 0 ? 'stdin' : isFd ? `fd ${source}` : `"${source}"`
  const fd = isFd ? source : openSync(source, 'r')
  try {
    if (!isFd) {
      const stat = fstatSync(fd)
      if (!stat.isFile()) throw new Error(`${label} is not a regular file`)
      if (stat.size > maxBytes) throw new InputTooLargeError(label, maxBytes)
    }
    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, maxBytes + 1 - total))
      let n: number
      try {
        n = readSync(fd, chunk, 0, chunk.length, null)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EOF') break
        if ((err as NodeJS.ErrnoException).code === 'EAGAIN') {
          // non-blocking stdin with no data yet: sleep briefly instead of spinning a core
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
          continue
        }
        throw err
      }
      if (n === 0) break
      total += n
      if (total > maxBytes) throw new InputTooLargeError(label, maxBytes)
      chunks.push(chunk.subarray(0, n))
    }
    return Buffer.concat(chunks, total).toString('utf8')
  } finally {
    if (!isFd) closeSync(fd)
  }
}

/** {@link readBoundedText} then `JSON.parse`, with the source named in the error. */
export function readBoundedJson(
  source: string | 0,
  maxBytes: number = MAX_CLI_INPUT_BYTES,
): unknown {
  const text = readBoundedText(source, maxBytes)
  try {
    return JSON.parse(text)
  } catch (err) {
    const label =
      source === 0 ? 'stdin' : typeof source === 'number' ? `fd ${source}` : `"${source}"`
    throw new Error(`${label} is not valid JSON: ${(err as Error).message}`)
  }
}
