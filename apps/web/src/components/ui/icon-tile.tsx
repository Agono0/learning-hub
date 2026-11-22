'use client'

/**
 * Clay-restyled icon tile for the page layer (`src/components/ui`) —
 * kit-izes the 11 `grid place-items-center rounded-xl bg-indigo-600/10`
 * usages found in the audit into one sized, toned component. Purely
 * presentational (no client JS); the design-system kit (`src/ui`) is
 * untouched.
 *
 * Colors ride the aliased @theme tokens in globals.css: `hub-accent` is the
 * palette accent, and the status hues (emerald/amber/rose/sky 300-500) are
 * mode-aware aliases of the status text/strong tokens, so every tone stays
 * palette-aware and AA-locked. Danger is rose (never red — design law §3.2).
 */

import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './lib'

/** Tile size preset — 36px / 44px (touch law) / 56px. */
export type IconTileSize = 'sm' | 'md' | 'lg'

/** Semantic tone of the tile; picks the tinted background + icon color. */
export type IconTileTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

/** Outer box per size (w matches h — always square). */
const TILE_SIZE: Record<IconTileSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
}

/** Inner Lucide icon per size. */
const ICON_SIZE: Record<IconTileSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

/**
 * Tone → tinted surface + icon color. All steps are aliased tokens
 * (`--color-hub-accent`, `--color-emerald-*`, `--color-amber-*`,
 * `--color-rose-*`, `--color-neutral-*`), so they re-skin with the palette.
 */
const TILE_TONE: Record<IconTileTone, string> = {
  accent: 'bg-hub-accent/10 text-hub-accent',
  success: 'bg-emerald-500/10 text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-400',
  danger: 'bg-rose-500/10 text-rose-400',
  neutral: 'bg-neutral-500/10 text-secondary',
}

/** Props for {@link IconTile}. */
export interface IconTileProps {
  /** Lucide icon to render inside the tile. */
  icon: LucideIcon
  /** Size preset. Defaults to `md` (44px, touch-law safe). */
  size?: IconTileSize
  /** Semantic tone. Defaults to `accent`. */
  tone?: IconTileTone
  /** Passthrough classes (margins, shrink/grow tweaks only). */
  className?: string
}

/**
 * Decorative square tile: `grid place-items-center rounded-xl` with a 10%
 * tint of the tone. Rendered `aria-hidden` — convey meaning with visible
 * text next to it, never through the tile alone.
 */
export function IconTile({
  icon: Icon,
  size = 'md',
  tone = 'accent',
  className,
}: IconTileProps): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid place-items-center rounded-xl',
        TILE_SIZE[size],
        TILE_TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className={ICON_SIZE[size]} />
    </span>
  )
}
