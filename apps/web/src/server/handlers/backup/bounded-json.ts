/**
 * Read a request body as JSON while counting the bytes that actually arrive.
 *
 * `Content-Length` is only a hint: a chunked body has none and a client can send a wrong one.
 * This reads the stream, stops and cancels it as soon as more than `maxBytes` have been
 * received, and only then parses. The limit is on bytes read, not on parse work: JSON.parse
 * of a body at the limit still costs time proportional to its size.
 *
 * Memory: decoded text is kept as it arrives and each chunk is dropped after decoding, so the
 * peak is about the decoded string (and its joined copy) plus the parsed value. The raw bytes
 * are not held a second time. For a body of N bytes the retained text is up to roughly 2N
 * bytes for non-ASCII content (two-byte strings), so these are upper bounds, not guarantees.
 */
import { ApiError } from '@/lib/api'

const INVALID_JSON = 'Request body must be valid JSON'

export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  const body = req.body
  if (body === null) throw new ApiError(400, INVALID_JSON)

  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        // Stop the producer before anything is parsed or applied.
        await reader.cancel().catch(() => undefined)
        throw new ApiError(413, 'backup payload exceeds the 64MB limit')
      }
      parts.push(decoder.decode(value, { stream: true }))
    }
    parts.push(decoder.decode())
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(400, INVALID_JSON)
  }

  try {
    return JSON.parse(parts.join('')) as unknown
  } catch {
    throw new ApiError(400, INVALID_JSON)
  }
}
