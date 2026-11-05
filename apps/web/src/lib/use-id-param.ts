'use client'

import { useSearchParams } from 'next/navigation'

/**
 * The positive integer `?id=` of the current page (null when absent/invalid).
 *
 * Course/lesson pages use query params instead of `[id]` route segments
 * because the native apps ship a STATIC export, which cannot pre-render pages
 * for ids that only exist at runtime. Components using this must render
 * inside a <Suspense> boundary (Next.js static-export requirement).
 */
export function useIdParam(name = 'id'): number | null {
  const raw = useSearchParams().get(name)
  const id = Number(raw)
  return raw !== null && Number.isInteger(id) && id > 0 ? id : null
}
