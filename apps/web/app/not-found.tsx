/**
 * 404 page — dark-theme consistent with the rest of the app.
 */
import Link from 'next/link'
import { Compass, Home } from 'lucide-react'
import { ClayIn } from '@/lib/motion'

export default function NotFound() {
  return (
    // Center the celebrate card in the viewport instead of top-anchoring it:
    // the shell already pads the top, so a 70dvh grid centers the card within
    // the visible content area (safe at 360px — the card shrinks, never
    // overflows horizontally).
    <div className="grid min-h-[70dvh] place-items-center px-4">
      {/* Gentle pop: the celebrate card rises 8px + fades once on mount. SSR-safe —
          ClayIn renders the final state server-side and animates client-side only
          when motionOK() allows (reduced-motion / e-ink users never see it). */}
      <ClayIn y={8}>
        <div className="panel celebrate mx-auto max-w-md space-y-4 py-10 text-center">
          <Compass className="mx-auto h-10 w-10 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-strong">Page not found</h1>
            <p className="mt-1 text-sm text-secondary">
              This route does not exist — it may have moved, or never existed.
            </p>
          </div>
          <Link href="/" className="btn mx-auto">
            <Home className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>
      </ClayIn>
    </div>
  )
}
