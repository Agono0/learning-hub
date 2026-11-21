'use client'

/**
 * Clay-restyled section eyebrow for the page layer (`src/components/ui`) —
 * kit-izes the three divergent uppercase-label styles found in the audit
 * into one row: optional icon, title, optional count pill, and a
 * right-aligned action slot. Purely presentational (no client JS); the
 * design-system kit (`src/ui`) is untouched.
 *
 * No built-in margins: rhythm (e.g. `mt-4`) flows through `className` so the
 * component composes inside any spacing system.
 */

import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './lib'

/** Props for {@link SectionHeader}. */
export interface SectionHeaderProps {
  /** Optional Lucide icon rendered at 14px before the title. */
  icon?: LucideIcon
  /** Eyebrow title (uppercased via CSS, never in the data). */
  title: string
  /** Optional count rendered as a small neutral pill after the title. */
  count?: number
  /** Right-aligned action slot (kit Buttons, IconButtons, links). */
  action?: React.ReactNode
  /** Passthrough classes — use for margin-top rhythm and layout only. */
  className?: string
}

/**
 * `text-xs font-semibold uppercase tracking-wide text-tertiary` row. The
 * count pill uses neutral tints so section headers never compete with the
 * page's one primary action.
 */
export function SectionHeader({
  icon: Icon,
  title,
  count,
  action,
  className,
}: SectionHeaderProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-tertiary',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : null}
      <span className="truncate">{title}</span>
      {typeof count === 'number' ? (
        <span
          className={cn(
            'rounded-full bg-neutral-200/70 px-1.5 py-0.5 text-[10px] font-semibold',
            'normal-case tabular-nums text-secondary dark:bg-(--hub-border) dark:text-faint',
          )}
        >
          {count}
        </span>
      ) : null}
      {action ? <span className="ml-auto flex shrink-0 items-center gap-1.5">{action}</span> : null}
    </div>
  )
}
