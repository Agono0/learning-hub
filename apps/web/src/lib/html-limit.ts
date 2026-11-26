import { HtmlTooLargeError } from '@learning-hub/core/html-scan'
import { ApiError } from '@/lib/api'

/**
 * Map the parser's size refusal to a 422. The message is fixed text: it never echoes the
 * page, the chapter or the limit math, and a partial import is not offered.
 */
export function htmlLimitError(err: unknown): ApiError | null {
  if (!(err instanceof HtmlTooLargeError)) return null
  return new ApiError(
    422,
    err.kind === 'chapter'
      ? 'A chapter in this EPUB is too large to import safely. Split the book or paste the text in the Markdown tab.'
      : 'This page is too large to import safely. Paste the article text in the Markdown tab instead.',
  )
}
