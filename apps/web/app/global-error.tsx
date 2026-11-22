'use client'

/**
 * Root error boundary — replaces the whole document when even the root layout
 * throws, so it must render its own <html>/<body> and re-import the global
 * stylesheet (the root layout's <html className="dark"> is gone at this point).
 */
import { AlertTriangle, RotateCcw } from 'lucide-react'
import './globals.css'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-50 text-neutral-900 antialiased dark:bg-(--hub-bg) dark:text-neutral-100">
        <div className="flex min-h-screen items-center justify-center p-6">
          {/* Last-resort boundary stays dependency-light (no framer-motion): the
              entrance is the CSS-gated whitelisted utility from globals.css. */}
          <div className="panel celebrate animate-fade-in-up max-w-md space-y-4 py-10 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-status-warning-text" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
              <p className="mt-1 text-sm text-tertiary">The app hit an unexpected error.</p>
              {error.digest && (
                <p className="mt-1 text-xs text-neutral-600">digest: {error.digest}</p>
              )}
            </div>
            <button className="btn mx-auto" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
