'use client'

/**
 * ArenaCanvas — thin React wrapper over {@link ArenaSceneManager}.
 *
 * Loaded via `next/dynamic` with `ssr: false` from the arena page (three.js
 * is heavy — same pattern as WorldCanvas). The page talks to the scene
 * through the forwarded handle after every graded exchange; all rendering
 * state lives inside the manager so React re-renders never touch three.js.
 */
import React, { useEffect, useImperativeHandle, useRef } from 'react'
import { ArenaSceneManager, type ArenaQuality } from '@/lib/three/ArenaSceneManager'

export interface ArenaCanvasHandle {
  strike: (options: { crit: boolean }) => void
  countered: () => void
  shieldRaise: () => void
  shieldBreak: () => void
  guardianDefeated: () => void
  playerDefeated: () => void
  setProgress: (progress: number) => void
  reset: () => void
}

export interface ArenaCanvasProps {
  className?: string
  quality?: ArenaQuality
}

export const ArenaCanvas = React.forwardRef<ArenaCanvasHandle, ArenaCanvasProps>(
  function ArenaCanvas({ className, quality = 'medium' }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const managerRef = useRef<ArenaSceneManager | null>(null)

    useImperativeHandle(
      ref,
      (): ArenaCanvasHandle => ({
        strike: (options) => managerRef.current?.strike(options),
        countered: () => managerRef.current?.countered(),
        shieldRaise: () => managerRef.current?.shieldRaise(),
        shieldBreak: () => managerRef.current?.shieldBreak(),
        guardianDefeated: () => managerRef.current?.guardianDefeated(),
        playerDefeated: () => managerRef.current?.playerDefeated(),
        setProgress: (progress) => managerRef.current?.setProgress(progress),
        reset: () => managerRef.current?.reset(),
      }),
      [],
    )

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const manager = new ArenaSceneManager({ canvas, quality })
      managerRef.current = manager
      manager.start()

      const observer = new ResizeObserver(() => manager.resize())
      if (canvas.parentElement) observer.observe(canvas.parentElement)

      return () => {
        observer.disconnect()
        manager.dispose()
        managerRef.current = null
      }
    }, [quality])

    return (
      <canvas
        ref={canvasRef}
        className={className}
        data-testid="arena-canvas"
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    )
  },
)
