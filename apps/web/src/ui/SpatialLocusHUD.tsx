'use client'

import React, { useState } from 'react'
import { Box, Compass, Eye, Sparkles, Volume2 } from 'lucide-react'
import type { SpatialLocus } from '@learning-hub/core/spatial'
import { cx } from './cx'

export interface SpatialLocusHUDProps {
  locus: SpatialLocus
  distanceMeters: number
  stereoPan?: number // -1.0 (Left) to +1.0 (Right)
  retentionBonusMultiplier?: number // e.g. 1.25x
  cardContent?: {
    front: string
    back: string
  }
  onRecordRecall?: (rating: 1 | 2 | 3 | 4) => void
  onStartTour?: () => void
  onClose?: () => void
  className?: string
}

export function SpatialLocusHUD({
  locus,
  distanceMeters,
  stereoPan = 0,
  retentionBonusMultiplier = 1.22,
  cardContent,
  onRecordRecall,
  onStartTour,
  onClose,
  className,
}: SpatialLocusHUDProps) {
  const [isRevealed, setIsRevealed] = useState(false)

  const panDirection =
    Math.abs(stereoPan) < 0.15
      ? 'Center'
      : stereoPan < 0
        ? `${Math.round(Math.abs(stereoPan) * 100)}% Left`
        : `${Math.round(stereoPan * 100)}% Right`

  const assetBadge =
    locus.assetType === 'holographic_orb'
      ? { label: 'Holographic Orb', color: 'border-sky-500/30 bg-sky-500/10 text-sky-400' }
      : locus.assetType === 'wall_canvas'
        ? {
            label: 'Wall Canvas',
            color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
          }
        : { label: 'Pedestal Plaque', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' }

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl transition-all shadow-indigo-500/20 text-slate-200',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                assetBadge.color,
              )}
            >
              <Box className="h-3 w-3" />
              {assetBadge.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
              <Sparkles className="h-3 w-3 text-amber-300" />
              {retentionBonusMultiplier.toFixed(2)}x Spatial Retention
            </span>
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">{locus.title}</h3>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white transition-all text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Spatial Telemetry Bar */}
      <div className="my-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-0.5">
            Proximity
          </span>
          <span className="font-mono text-sm font-bold text-white">
            {distanceMeters.toFixed(1)}m away
          </span>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-0.5 flex items-center gap-1">
            <Volume2 className="h-3 w-3 text-indigo-400" /> Spatial Pan
          </span>
          <span className="font-mono text-sm font-bold text-white">{panDirection}</span>
        </div>
      </div>

      {/* Linked Mnemonic Card Recall Box */}
      {cardContent ? (
        <div className="my-3 space-y-3 rounded-xl border border-white/5 bg-slate-950/60 p-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Prompt (Front)
            </span>
            <p className="text-sm font-semibold text-slate-100">{cardContent.front}</p>
          </div>

          {isRevealed ? (
            <div className="space-y-1 border-t border-white/10 pt-2 animate-fadeIn">
              <span className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider">
                Mnemonic Target (Back)
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">{cardContent.back}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsRevealed(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all shadow-sm"
            >
              <Eye className="h-3.5 w-3.5 text-indigo-400" />
              <span>Reveal Answer (Space)</span>
            </button>
          )}

          {/* FSRS Rating Buttons */}
          {isRevealed && onRecordRecall && (
            <div className="grid grid-cols-4 gap-1.5 pt-2">
              <button
                type="button"
                onClick={() => onRecordRecall(1)}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 py-1.5 text-center text-xs font-semibold text-rose-300 hover:bg-rose-500/20 active:scale-95 transition-all"
              >
                Again
              </button>
              <button
                type="button"
                onClick={() => onRecordRecall(2)}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 text-center text-xs font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all"
              >
                Hard
              </button>
              <button
                type="button"
                onClick={() => onRecordRecall(3)}
                className="rounded-lg border border-sky-500/30 bg-sky-500/10 py-1.5 text-center text-xs font-semibold text-sky-300 hover:bg-sky-500/20 active:scale-95 transition-all"
              >
                Good
              </button>
              <button
                type="button"
                onClick={() => onRecordRecall(4)}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1.5 text-center text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all"
              >
                Easy
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="my-3 rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-slate-400">
          <p>
            {locus.contentPreview ||
              'Spatial anchor placeholder — link a flashcard to enable spatial review.'}
          </p>
        </div>
      )}

      {/* Actions */}
      {onStartTour && (
        <button
          type="button"
          onClick={onStartTour}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/20 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 hover:text-white transition-all shadow-sm"
        >
          <Compass className="h-3.5 w-3.5" />
          <span>Start Guided Tour from Here</span>
        </button>
      )}
    </div>
  )
}
