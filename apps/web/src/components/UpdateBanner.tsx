'use client'

/**
 * UpdateBanner — the ask-first update prompt (O1-15).
 *
 * Renders nothing until there is a real offer (`offer === null`) or when the
 * build may not self-update (`SELF_UPDATE_ENABLED === false`, the Play-store
 * gate from `@/lib/updates` — store builds never see this banner, by design,
 * because the flag is baked at build time and cannot be flipped at runtime).
 *
 * Ask-first law: the banner PROMPTS, it never applies anything silently. The
 * primary action hands off to the update service, which downloads into the
 * inactive A/B slot and installs on the next restart (docs/updates.md); the
 * copy says so explicitly. Sizes are shown honestly: the delta patch when one
 * matches the installed version, otherwise the full package — the user always
 * knows what they are about to download before consenting.
 *
 * Presentation only: no fetch (data arrives via props from the update
 * service), no effects, SSR-safe — `renderToString` renders the same markup
 * the client hydrates.
 */
import { ArrowDownToLine } from 'lucide-react'
import { Button, ProgressBar } from '@/ui'
import { SELF_UPDATE_ENABLED } from '@/lib/updates'
import { progressRatio, type UpdateDownloadProgress } from '@/platform/update-progress'

/** An available update, already verified by the update service. */
export interface UpdateOffer {
  /** Version being offered (e.g. `20261122-abc1234`). */
  version: string
  /** Release notes for this build (own CI output — still rendered as text). */
  notes?: string
  /**
   * Size in bytes of the matching delta patch. Absent when no patch applies
   * (unknown previous version, or `requiresNative`).
   */
  patchSize?: number
  /** Size in bytes of the full package — always known from the manifest. */
  fullSize: number
  /** True when this release needs the native installer/APK (no hot patch). */
  requiresNative?: boolean
}

export interface UpdateBannerProps {
  /** The available update, or `null` when the app is up to date. */
  offer: UpdateOffer | null
  /** Called when the user consents — the service downloads + schedules apply. */
  onApply?: () => void
  /** Called when the user postpones (banner hides; next check re-offers). */
  onDismiss?: () => void
  /** True while the consented download runs — the primary button shows it. */
  applying?: boolean
  /** Live download progress (O1-27) — renders the bar while `applying`. */
  progress?: UpdateDownloadProgress | null
}

/**
 * Format a byte count the way the banner shows it: bytes under 1 KB, then KB
 * and MB with one decimal (calm numerals, no fake precision past that).
 */
export function formatUpdateSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UpdateBanner({
  offer,
  onApply,
  onDismiss,
  applying = false,
  progress = null,
}: UpdateBannerProps) {
  if (!SELF_UPDATE_ENABLED || !offer) return null

  const patchAvailable = !offer.requiresNative && offer.patchSize !== undefined

  return (
    <section
      role="status"
      aria-label={`Update to ${offer.version} available`}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center dark:border-(--hub-border) dark:bg-(--hub-panel)"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-700 dark:bg-(--ac-soft) dark:text-(--ac-strong)">
          <ArrowDownToLine className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong">Learning HUB {offer.version} is ready</p>
          {offer.notes ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-secondary">{offer.notes}</p>
          ) : null}
          <p className="mt-1 text-sm text-tertiary">
            {patchAvailable
              ? `Hot update · ${formatUpdateSize(offer.patchSize ?? 0)} · full download ${formatUpdateSize(offer.fullSize)}`
              : `Full download · ${formatUpdateSize(offer.fullSize)}`}
            {offer.requiresNative ? ' · app reinstall required' : ''} · installs after you restart —
            nothing changes until then.
          </p>
          {applying && progress !== null ? (
            <ProgressBar
              value={progressRatio(progress)}
              label="Update download progress"
              className="mt-2"
            />
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={onApply} loading={applying} icon={undefined}>
          {applying ? 'Preparing…' : 'Download update'}
        </Button>
        <Button variant="ghost" onClick={onDismiss} disabled={applying}>
          Not now
        </Button>
      </div>
    </section>
  )
}
