'use client'

import React, { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { WorldSceneManager, type WorldQuality } from '@/lib/three/SceneManager'

export interface WorldCanvasHandle {
  setProgress: (progress: number) => void
  setTimerTheme: (theme: string) => void
  setViewMode: (mode: 'diorama' | 'third_person' | 'hybrid') => void
  setCharacter: (
    characterId: string,
    headAccessory?: string | null,
    handAccessory?: string | null,
    robeColor?: string,
  ) => void
  setCompanion: (companionId: string | null) => void
  setUnlockedDecor: (itemIds: string[]) => void
  setMood: (moodId: string) => void
  setQuality: (quality: WorldQuality) => void
  setPlantedPlots: (
    plots: Array<{ treeType: string; posX: number; posZ: number; growthStage?: string }>,
  ) => void
}

export interface WorldCanvasProps {
  className?: string
  viewMode?: 'diorama' | 'third_person' | 'hybrid'
  timerTheme?: 'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
  characterId?: string
  equippedHead?: string | null
  equippedHand?: string | null
  equippedCompanion?: string | null
  equippedSkin?: string
  soundscape?: 'none' | 'birds' | 'rain' | 'fire' | 'wind'
  lowPolyQuality?: WorldQuality
  /** App palette id — drives the world's sky/light mood (WorldMood.ts). */
  mood?: string
  plantedPlots?: Array<{
    treeType: string
    posX: number
    posZ: number
    growthStage?: string
  }>
  /** Unlocked `decor_*` marketplace item ids rendered on the island. */
  unlockedDecor?: string[]
  progress?: number // 0..1
}

export const WorldCanvas = React.forwardRef<WorldCanvasHandle, WorldCanvasProps>(
  function WorldCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const managerRef = useRef<WorldSceneManager | null>(null)
    const [webglSupported, setWebglSupported] = useState(true)

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      try {
        const mgr = new WorldSceneManager({
          canvas,
          viewMode: props.viewMode ?? 'hybrid',
          timerTheme: props.timerTheme ?? 'tree',
          characterId: props.characterId ?? 'char_apprentice',
          equippedHead: props.equippedHead,
          equippedHand: props.equippedHand,
          equippedCompanion: props.equippedCompanion,
          equippedSkin: props.equippedSkin,
          soundscape: props.soundscape ?? 'none',
          lowPolyQuality: props.lowPolyQuality,
          mood: props.mood,
          plantedPlots: props.plantedPlots,
          unlockedDecor: props.unlockedDecor,
        })
        managerRef.current = mgr

        if (props.progress !== undefined) {
          mgr.setProgress(props.progress)
        }

        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect
            mgr.resize(width, height)
          }
        })
        resizeObserver.observe(canvas)

        return () => {
          resizeObserver.disconnect()
          mgr.dispose()
          managerRef.current = null
        }
      } catch (err) {
        console.warn('[WorldCanvas] WebGL context initialization fallback:', err)
        setWebglSupported(false)
      }
    }, [])

    // Synchronize props when changed externally
    useEffect(() => {
      if (managerRef.current && props.progress !== undefined) {
        managerRef.current.setProgress(props.progress)
      }
    }, [props.progress])

    useEffect(() => {
      if (managerRef.current && props.timerTheme) {
        managerRef.current.setTimerTheme(props.timerTheme)
      }
    }, [props.timerTheme])

    useEffect(() => {
      if (managerRef.current && props.viewMode) {
        managerRef.current.setViewMode(props.viewMode)
      }
    }, [props.viewMode])

    useEffect(() => {
      if (managerRef.current && props.plantedPlots) {
        managerRef.current.setPlantedPlots(props.plantedPlots)
      }
    }, [props.plantedPlots])

    useEffect(() => {
      if (managerRef.current && props.mood) {
        managerRef.current.setMood(props.mood)
      }
    }, [props.mood])

    useEffect(() => {
      if (managerRef.current && props.unlockedDecor) {
        managerRef.current.setUnlockedDecor(props.unlockedDecor)
      }
    }, [props.unlockedDecor])

    useEffect(() => {
      if (managerRef.current && props.characterId) {
        managerRef.current.setCharacter(
          props.characterId,
          props.equippedHead,
          props.equippedHand,
          props.equippedSkin,
        )
      }
    }, [props.characterId, props.equippedHead, props.equippedHand, props.equippedSkin])

    useEffect(() => {
      if (managerRef.current) {
        managerRef.current.setCompanion(props.equippedCompanion ?? null)
      }
    }, [props.equippedCompanion])

    useImperativeHandle(ref, () => ({
      setProgress: (p: number) => managerRef.current?.setProgress(p),
      setTimerTheme: (t: string) => managerRef.current?.setTimerTheme(t),
      setViewMode: (m: 'diorama' | 'third_person' | 'hybrid') => managerRef.current?.setViewMode(m),
      setCharacter: (c, head, hand, skin) => managerRef.current?.setCharacter(c, head, hand, skin),
      setCompanion: (id) => managerRef.current?.setCompanion(id),
      setUnlockedDecor: (ids) => managerRef.current?.setUnlockedDecor(ids),
      setMood: (moodId: string) => managerRef.current?.setMood(moodId),
      setQuality: (q: WorldQuality) => managerRef.current?.setQuality(q),
      setPlantedPlots: (plots) => managerRef.current?.setPlantedPlots(plots),
    }))

    if (!webglSupported) {
      return (
        <div
          className={`flex flex-col items-center justify-center bg-emerald-950/20 text-emerald-300 p-6 rounded-2xl border border-emerald-800/30 text-center ${props.className ?? ''}`}
        >
          <p className="font-semibold text-lg mb-1">🌲 Forest of Focus</p>
          <p className="text-sm text-slate-400">
            WebGL is not active or supported on this device. 3D rendering gracefully falling back to
            standard calm timer.
          </p>
        </div>
      )
    }

    return (
      <canvas
        ref={canvasRef}
        className={`w-full h-full block rounded-2xl outline-none select-none touch-none ${props.className ?? ''}`}
      />
    )
  },
)
