'use client'

import React, { useCallback, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'

/**
 * Bento layout kit. `BentoGrid` is a 12-column container-query grid (see `.bento` in
 * globals.css): tiles reflow by the width of the pane they sit in, so the same markup works in
 * the phone shell, a tablet and a wide desktop. DOM order is reading and tab order; the size
 * classes only change shape.
 */
export function BentoGrid({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('bento', className)} {...rest}>
      {children}
    </div>
  )
}

export type BentoSize = 'stat' | 'sm' | 'md' | 'lg'

export interface BentoTileProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Column span at wider container widths: stat = one of three small tiles, sm = third, md = half, lg = two thirds. */
  size?: BentoSize
  /** Spans two rows in wide containers. */
  tall?: boolean
  /** The one tile the eye should land on (a quiet permanent accent wash). */
  hero?: boolean
  /** Optional small label above the content. */
  eyebrow?: ReactNode
  /** Render tag. */
  as?: 'section' | 'div' | 'article'
}

/**
 * A bento tile: a `.panel` surface with a pointer spotlight. The spotlight is hover feedback
 * only (fine pointer, no reduced motion), so it carries no information and never moves layout.
 */
export function BentoTile({
  size = 'sm',
  tall,
  hero,
  eyebrow,
  as = 'section',
  className,
  children,
  style,
  onPointerMove,
  ...rest
}: BentoTileProps) {
  const Tag = as as 'section'
  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      onPointerMove?.(e)
      if (e.pointerType !== 'mouse') return
      const r = e.currentTarget.getBoundingClientRect()
      e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
      e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
    },
    [onPointerMove],
  )
  return (
    <Tag
      className={cx(
        'panel bento-tile',
        `bento-${size}`,
        tall && 'bento-tall',
        hero && 'bento-hero',
        className,
      )}
      style={style as CSSProperties}
      onPointerMove={handleMove}
      {...rest}
    >
      {eyebrow && (
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-tertiary">{eyebrow}</p>
      )}
      {children}
    </Tag>
  )
}
