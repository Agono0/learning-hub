'use client'

/**
 * Route-segment error boundary — renders inside the app shell when a page
 * throws. Offers a retry (reset this boundary) and a way back to the dashboard.
 */
import { useEffect } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // report to the console so devtools/server logs keep the stack
    console.error(error)
  }, [error])

  return (
    <div className="panel celebrate mx-auto max-w-md space-y-4 py-10 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-status-warning-text" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-1 text-sm text-tertiary">
          An unexpected error interrupted this page. Your data is safe — try again.
        </p>
        {error.digest && <p className="mt-1 text-xs text-neutral-600">digest: {error.digest}</p>}
      </div>
      <div className="flex items-center justify-center gap-2">
        <button className="btn" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <a href="/" className="btn-ghost">
          <Home className="h-4 w-4" /> Dashboard
        </a>
      </div>
    </div>
  )
}
