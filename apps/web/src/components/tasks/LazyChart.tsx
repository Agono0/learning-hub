'use client'

/**
 * LazyChart (S3-96) — defers a chart's render until the page's metrics data
 * is ready (or the user expands it), so a heavy hand-rolled SVG never
 * blocks the first paint of the metrics page. Not scroll-jacking: the
 * fallback is a real "Show chart" button (a visible affordance, touch
 * ≥44px), matching the UI law's "lazy charts" row.
 */
import React, { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { Button } from '@/ui'

export interface LazyChartProps {
  /** The chart renders once open (the parent passes the ready SVG/data). */
  children: React.ReactNode
  /** Chart title for the toggle (verb + object). */
  label: string
  /** Start expanded (e.g. the day detail where the chart IS the content). */
  defaultOpen?: boolean
  /** True when the parent's data is ready; false keeps the button honest. */
  ready?: boolean
}

export function LazyChart({ children, label, defaultOpen = false, ready = true }: LazyChartProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (!ready) return null
  if (!open) {
    return (
      <Button
        variant="ghost"
        className="w-full text-xs"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <BarChart3 className="size-3.5" aria-hidden /> Show {label}
      </Button>
    )
  }
  return (
    <div className="space-y-2">
      <div>{children}</div>
      <Button
        variant="ghost"
        className="px-2 py-1 text-xs"
        onClick={() => setOpen(false)}
        aria-expanded={true}
      >
        Hide {label}
      </Button>
    </div>
  )
}

export default LazyChart
