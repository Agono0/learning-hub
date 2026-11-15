/**
 * 404 page — dark-theme consistent with the rest of the app.
 */
import Link from 'next/link'
import { Compass, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="panel celebrate mx-auto max-w-md space-y-4 py-10 text-center">
      <Compass className="mx-auto h-10 w-10 text-indigo-400" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-neutral-500">
          This route does not exist — it may have moved, or never existed.
        </p>
      </div>
      <Link href="/" className="btn mx-auto">
        <Home className="h-4 w-4" /> Back to dashboard
      </Link>
    </div>
  )
}
