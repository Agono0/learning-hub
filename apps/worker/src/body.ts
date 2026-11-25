/**
 * Reads a request body as raw bytes, counting while it streams. Returns null as soon as the
 * running total exceeds `maxBytes`; the rest of the stream is cancelled, never buffered.
 */
export async function readBytesCapped(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    all.set(c, off)
    off += c.byteLength
  }
  return all
}
