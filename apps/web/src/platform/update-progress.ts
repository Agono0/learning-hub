'use client'

/**
 * Update download progress bridge (O1-27/O1-29) — subscribes the webview to
 * the Rust downloader's `update://download-progress` events (O1-16:
 * `{ downloaded, total }` emitted from `update_download_file`), derives the
 * banner's live bar, and fires the "update ready, restart to apply" OS
 * notification when the download completes (through the shared notifications
 * gate in `@/platform/permissions` — permission is requested, never assumed).
 *
 * Null off-Tauri / before any event — the banner simply shows its plain
 * "Preparing…" state. The listener is dynamic-imported (haptics pattern) and
 * always cleaned up.
 */
import { useEffect, useState } from 'react'
import { isTauri } from '@/lib/transport'

/** One progress reading from the native downloader. */
export interface UpdateDownloadProgress {
  downloaded: number
  total: number
}

/** 0..1 clamped fraction (NaN-safe: a missing total never yields a bogus bar). */
export function progressRatio(progress: UpdateDownloadProgress | null): number {
  if (!progress || progress.total <= 0 || !Number.isFinite(progress.downloaded)) return 0
  return Math.min(1, Math.max(0, progress.downloaded / progress.total))
}

/** True when the download has fully arrived (O1-29's trigger). */
export function isDownloadComplete(progress: UpdateDownloadProgress | null): boolean {
  return (
    progress !== null &&
    progress.total > 0 &&
    Number.isFinite(progress.downloaded) &&
    progress.downloaded >= progress.total
  )
}

/**
 * Fire the "update ready, restart to apply" OS notification through the
 * shared notifications gate (permission requested here if needed). Returns
 * false off-Tauri/unsupported/denied — the in-app banner remains the
 * always-present surface; the OS notification is a bonus, not the contract.
 */
export async function notifyUpdateReady(): Promise<boolean> {
  try {
    const { requestPermission, deliverLocalNotification } = await import('@/platform/permissions')
    if ((await requestPermission('notifications')) !== 'granted') return false
    return await deliverLocalNotification(
      'Update ready',
      'Restart Learning HUB to apply the update — nothing changes until you do.',
    )
  } catch {
    return false
  }
}

/**
 * Subscribe to download-progress events. Returns the latest reading or null
 * (never throws; the event listener is torn down on unmount).
 */
export function useUpdateDownloadProgress(): UpdateDownloadProgress | null {
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null)

  useEffect(() => {
    if (!isTauri) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        if (disposed) return
        unlisten = await listen<UpdateDownloadProgress>('update://download-progress', (event) => {
          if (!disposed) setProgress(event.payload)
        })
      } catch {
        // Non-Tauri host or API unavailable — progress stays null.
      }
    })()
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  return progress
}
