'use client'

/**
 * UpdateChangelog — the channel's release-notes panel (O1-26).
 *
 * Rendered inside Settings > Updates under the channel picker. Fetches through
 * the hub transport (`fetchChannelNotes` → /api/update/notes), so it works on
 * every host (web, Windows WebView2, Android webview worker) without raw
 * fetch. States are honest per the design law:
 * - loading: a skeleton shaped like the content (never `return null` mid-load);
 * - no notes published: "no changelog" sentence, not an empty box;
 * - fetch/pointer failure: same calm sentence plus a retry hint — this is
 *   information, not a failed user action, so no error dialog.
 * Notes are CI-authored but UNTRUSTED content: rendered through `<Markdown>`,
 * never raw HTML.
 */
import React, { useEffect, useState } from 'react'
import { fetchChannelNotes, type ChannelNotes } from '@/lib/updates'
import type { UpdateChannel } from '@learning-hub/core/update'
import { Markdown, Skeleton } from '@/ui'

interface ChangelogState {
  status: 'loading' | 'ready' | 'unavailable'
  notes: ChannelNotes | null
}

export function UpdateChangelog({ channel }: { channel: UpdateChannel }) {
  const [state, setState] = useState<ChangelogState>({ status: 'loading', notes: null })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', notes: null })
    fetchChannelNotes(channel)
      .then((notes) => {
        if (!cancelled) setState({ status: 'ready', notes })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable', notes: null })
      })
    return () => {
      cancelled = true
    }
  }, [channel])

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)">
      <p className="text-xs font-semibold text-tertiary">What's new on this channel</p>
      {state.status === 'loading' ? (
        <div className="mt-2 space-y-2" aria-busy="true" aria-label="Loading changelog">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : state.status === 'unavailable' || !state.notes ? (
        <p className="mt-2 text-sm text-secondary">
          No changelog published for this channel right now — check back after the next release.
        </p>
      ) : (
        <div className="mt-2 min-w-0 text-sm">
          <p className="text-xs text-tertiary">
            Current: {state.notes.version}
            {state.notes.publishedAt
              ? ` · published ${new Date(state.notes.publishedAt).toLocaleDateString()}`
              : ''}
          </p>
          {state.notes.notes ? (
            <div className="mt-1 [&>*:first-child]:mt-0">
              <Markdown>{state.notes.notes}</Markdown>
            </div>
          ) : (
            <p className="mt-1 text-secondary">No notes for this build.</p>
          )}
        </div>
      )}
    </div>
  )
}
