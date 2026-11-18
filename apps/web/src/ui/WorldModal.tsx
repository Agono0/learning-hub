'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import { Coins, Compass, Maximize2, X } from 'lucide-react'

// Keep three.js out of the modal's critical path — it loads after first paint.
const WorldCanvas = dynamic(() => import('./WorldCanvas').then((m) => m.WorldCanvas), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-sm text-faint">Loading world…</div>
  ),
})

export interface WorldModalProps {
  isOpen: boolean
  onClose: () => void
  timerTheme?: 'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
  progress?: number
  balance?: number
}

export function WorldModal({
  isOpen,
  onClose,
  timerTheme = 'tree',
  progress = 0,
  balance = 0,
}: WorldModalProps) {
  const [viewMode, setViewMode] = useState<'diorama' | 'third_person'>('diorama')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl h-[600px] bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/90 z-10">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-status-success-text" />
            <h2 className="text-base font-semibold text-slate-100">3D Forest & Timer HUD</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-status-warning-text text-xs font-semibold">
              <Coins className="w-3.5 h-3.5 text-status-warning-text" />
              <span>{balance}</span>
            </div>

            <button
              onClick={() => setViewMode(viewMode === 'diorama' ? 'third_person' : 'diorama')}
              className="btn-ghost border border-neutral-700 text-xs px-2.5 py-1.5 flex items-center gap-1 rounded-lg"
            >
              <Maximize2 className="w-3.5 h-3.5 mr-1" />
              {viewMode === 'diorama' ? 'Walk (WASD)' : 'Diorama'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-faint hover:text-slate-100 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3D Canvas Viewport */}
        <div className="flex-1 relative bg-slate-950">
          <WorldCanvas viewMode={viewMode} timerTheme={timerTheme} progress={progress} />
        </div>
      </div>
    </div>
  )
}
