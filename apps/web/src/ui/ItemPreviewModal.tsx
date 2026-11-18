'use client'

import React, { useEffect, useRef } from 'react'
import { Coins, Hand, RotateCcw, X } from 'lucide-react'
import { ItemPreviewStage } from '@/lib/three/ItemPreview'
import { Badge } from './Feedback'
import { cx } from './cx'

export interface PreviewableItem {
  id: string
  category: string
  name: string
  description: string
  priceCoins: number
  rarity: string
}

export interface ItemPreviewModalProps {
  item: PreviewableItem | null
  onClose: () => void
  /** Whether the item is already unlocked (shows Equip instead of Buy). */
  isUnlocked: boolean
  isEquipped?: boolean
  canAfford: boolean
  onBuy: (itemId: string) => void
  onEquip: (itemId: string) => void
}

const RARITY_RING: Record<string, string> = {
  common: 'from-slate-400/30',
  rare: 'from-sky-400/40',
  epic: 'from-indigo-400/40',
  legendary: 'from-amber-400/40',
}

/**
 * The preview portal: a live 3D turntable of any marketplace item on a
 * collector's display pedestal, framed by its rarity glow. Drag to spin.
 */
export function ItemPreviewModal({
  item,
  onClose,
  isUnlocked,
  isEquipped,
  canAfford,
  onBuy,
  onEquip,
}: ItemPreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<ItemPreviewStage | null>(null)

  useEffect(() => {
    if (!item || !canvasRef.current) return
    const stage = new ItemPreviewStage({
      canvas: canvasRef.current,
      itemId: item.id,
      rarity: item.rarity,
    })
    stageRef.current = stage

    const resizeObserver = new ResizeObserver(() => stage.resize())
    resizeObserver.observe(canvasRef.current)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('keydown', onKey)
      stage.dispose()
      stageRef.current = null
    }
  }, [item, onClose])

  if (!item) return null

  const ring = RARITY_RING[item.rarity] ?? RARITY_RING.common

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${item.name}`}
    >
      <div
        className={cx(
          'relative w-full max-w-lg bg-gradient-to-b to-slate-900 rounded-3xl border shadow-2xl overflow-hidden',
          ring,
          'border-slate-700/60',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 3D turntable viewport */}
        <div className="relative h-64 sm:h-72 bg-gradient-to-b from-slate-800/60 to-slate-900/10">
          <canvas
            ref={canvasRef}
            className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
          />
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-slate-950/70 backdrop-blur px-2.5 py-1 rounded-lg text-[11px] text-slate-300 border border-slate-700/50">
              <Hand className="w-3 h-3" /> Drag to spin
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="absolute top-3 right-3 p-2 rounded-lg bg-slate-950/70 backdrop-blur border border-slate-700/50 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details */}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-faint">
                  {item.category.replace('_', ' ')}
                </span>
                <Badge
                  tone={
                    item.rarity === 'legendary'
                      ? 'warning'
                      : item.rarity === 'epic'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {item.rarity}
                </Badge>
              </div>
              <h3 className="text-lg font-semibold text-slate-50">{item.name}</h3>
              <p className="text-sm text-faint leading-relaxed mt-1">{item.description}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5 text-status-warning-text font-bold">
              <Coins className="w-4 h-4" />
              <span className="text-sm">
                {item.priceCoins === 0 ? 'Free' : `${item.priceCoins} coins`}
              </span>
            </div>

            {isEquipped ? (
              <Badge tone="success">Equipped</Badge>
            ) : isUnlocked ? (
              <button
                onClick={() => onEquip(item.id)}
                className="btn text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-xl"
              >
                Equip
              </button>
            ) : (
              <button
                disabled={!canAfford}
                onClick={() => onBuy(item.id)}
                className="btn text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {canAfford ? `Buy for ${item.priceCoins}` : 'Not enough coins'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-tertiary">
            <RotateCcw className="w-3 h-3" />
            The spin settles into a slow showroom turn after you let go.
          </div>
        </div>
      </div>
    </div>
  )
}
