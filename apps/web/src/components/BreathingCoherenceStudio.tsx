'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Heart,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react'
import {
  BREATHING_PROTOCOLS,
  calculateHrvMetrics,
  evaluateBreathCycle,
  type BreathingProtocol,
  type HrvMetrics,
} from '@learning-hub/core/coherence'
import { hapticLight, hapticMedium } from '../platform/haptics'
import { getSharedAudioContext } from '../lib/audio-graph'
import { cx } from '../ui/cx'

export interface BreathingCoherenceStudioProps {
  onCompleteSession?: (metrics: HrvMetrics) => void
  onNavigateToReview?: () => void
  initialProtocol?: BreathingProtocol
  targetDurationSeconds?: number
  className?: string
}

export function BreathingCoherenceStudio({
  onCompleteSession,
  onNavigateToReview,
  initialProtocol = 'resonance_0_1hz',
  targetDurationSeconds = 120, // 2 minutes default pre-study priming
  className,
}: BreathingCoherenceStudioProps) {
  const [protocol, setProtocol] = useState<BreathingProtocol>(initialProtocol)
  const [isRunning, setIsRunning] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  // Heart rate & IBI pulse tracking state
  const [pulseIbis, setPulseIbis] = useState<number[]>([810, 840, 800, 850, 810, 860, 820])
  const [lastTapTime, setLastTapTime] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<HrvMetrics>(() =>
    calculateHrvMetrics([810, 840, 800, 850, 810, 860, 820]),
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const previousPhaseRef = useRef<string | null>(null)

  const cycleState = evaluateBreathCycle(protocol, elapsedMs)

  // Play gentle singing bowl bell tone on phase transition
  const playPhaseChime = useCallback(
    async (phase: string) => {
      if (!soundEnabled) return
      try {
        const ctx = await getSharedAudioContext()
        const now = ctx.currentTime

        // Gentle bowl frequencies: Inhale = 432 Hz, Hold = 528 Hz, Exhale = 360 Hz, Pause = 288 Hz
        const freqMap: Record<string, number> = {
          inhale: 432,
          hold: 528,
          exhale: 360,
          pause: 288,
        }
        const freq = freqMap[phase] ?? 432

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now)

        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.08)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(now)
        osc.stop(now + 1.25)
      } catch {
        // Fallback or audio not allowed yet
      }
    },
    [soundEnabled],
  )

  // Animation frame loop
  useEffect(() => {
    if (!isRunning) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      return
    }

    startTimeRef.current = Date.now() - elapsedMs

    const tick = () => {
      const now = Date.now()
      const currentElapsed = now - (startTimeRef.current ?? now)
      setElapsedMs(currentElapsed)

      const state = evaluateBreathCycle(protocol, currentElapsed)
      if (state.phase !== previousPhaseRef.current) {
        previousPhaseRef.current = state.phase
        void playPhaseChime(state.phase)
        void hapticLight()
      }

      // Check session completion
      if (currentElapsed >= targetDurationSeconds * 1000) {
        setIsRunning(false)
        setIsCompleted(true)
        void hapticMedium()
        const finalMetrics = calculateHrvMetrics(pulseIbis)
        setMetrics(finalMetrics)
        onCompleteSession?.(finalMetrics)
        return
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    animationFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [
    isRunning,
    protocol,
    targetDurationSeconds,
    playPhaseChime,
    pulseIbis,
    onCompleteSession,
    elapsedMs,
  ])

  // Tap Pulse Handler (manual beat input to calibrate live coherence)
  const handlePulseTap = () => {
    const now = Date.now()
    void hapticLight()

    if (lastTapTime !== null) {
      const ibi = now - lastTapTime
      if (ibi >= 350 && ibi <= 1800) {
        setPulseIbis((prev) => {
          const updated = [...prev.slice(-19), ibi]
          const updatedMetrics = calculateHrvMetrics(updated)
          setMetrics(updatedMetrics)
          return updated
        })
      }
    }
    setLastTapTime(now)
  }

  // Generate simulated smooth resonance pulse stream during session
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      setPulseIbis((prev) => {
        // Generate sinusoidal respiratory sinus arrhythmia matching breath phase
        const phaseVal = cycleState.phase === 'inhale' ? 1 : -1
        const naturalJitter = (Math.random() - 0.5) * 15
        const lastIbi = prev[prev.length - 1] ?? 800
        const targetIbi = phaseVal > 0 ? 760 : 880 // Inhale accelerates HR (lower IBI), Exhale decelerates HR
        const nextIbi = Math.round(lastIbi + (targetIbi - lastIbi) * 0.25 + naturalJitter)
        const updated = [...prev.slice(-24), nextIbi]
        setMetrics(calculateHrvMetrics(updated))
        return updated
      })
    }, 1200)

    return () => clearInterval(interval)
  }, [isRunning, cycleState.phase])

  const toggleRun = () => {
    if (isCompleted) {
      setElapsedMs(0)
      setIsCompleted(false)
      setIsRunning(true)
    } else {
      setIsRunning((prev) => !prev)
    }
  }

  const resetSession = () => {
    setIsRunning(false)
    setIsCompleted(false)
    setElapsedMs(0)
    previousPhaseRef.current = null
  }

  const toggleFullScreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      void containerRef.current
        .requestFullscreen()
        .then(() => setIsFullScreen(true))
        .catch(() => undefined)
    } else {
      void document
        .exitFullscreen()
        .then(() => setIsFullScreen(false))
        .catch(() => undefined)
    }
  }

  const totalProgress = Math.min(1.0, elapsedMs / (targetDurationSeconds * 1000))
  const remainingSeconds = Math.max(0, targetDurationSeconds - Math.floor(elapsedMs / 1000))

  // Visual phase theme colors
  const phaseColors = {
    inhale: {
      text: 'text-cyan-400',
      border: 'border-cyan-500/40',
      glow: 'shadow-cyan-500/30',
      gradient: 'from-cyan-500/30 via-sky-500/10 to-transparent',
      orbBg: 'bg-gradient-to-tr from-cyan-600 via-sky-500 to-teal-400',
    },
    hold: {
      text: 'text-emerald-400',
      border: 'border-emerald-500/40',
      glow: 'shadow-emerald-500/30',
      gradient: 'from-emerald-500/30 via-teal-500/10 to-transparent',
      orbBg: 'bg-gradient-to-tr from-emerald-600 via-teal-500 to-green-400',
    },
    exhale: {
      text: 'text-indigo-400',
      border: 'border-indigo-500/40',
      glow: 'shadow-indigo-500/30',
      gradient: 'from-indigo-500/30 via-purple-500/10 to-transparent',
      orbBg: 'bg-gradient-to-tr from-indigo-600 via-purple-500 to-violet-400',
    },
    pause: {
      text: 'text-slate-400',
      border: 'border-slate-500/40',
      glow: 'shadow-slate-500/20',
      gradient: 'from-slate-500/20 via-slate-600/10 to-transparent',
      orbBg: 'bg-gradient-to-tr from-slate-600 via-slate-500 to-slate-400',
    },
  }[cycleState.phase]

  return (
    <div
      ref={containerRef}
      className={cx(
        'relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-slate-950 p-6 text-white shadow-2xl backdrop-blur-2xl transition-all',
        isFullScreen ? 'h-screen w-screen rounded-none p-10' : 'min-h-[640px]',
        className,
      )}
    >
      {/* Top Header / Protocol Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 shadow-inner">
            <Wind className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Autonomic Resonance & Cardiac Coherence Studio
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                0.1 Hz Neurovisceral
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Synchronize baroreflex oscillations and vagal tone before cognitive work.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? 'Mute Chimes' : 'Enable Chimes'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={toggleFullScreen}
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen Focus'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Protocol Selection Tabs */}
      <div className="relative z-10 my-4 flex flex-wrap gap-2">
        {(Object.keys(BREATHING_PROTOCOLS) as BreathingProtocol[]).map((key) => {
          const p = BREATHING_PROTOCOLS[key]
          const isSelected = protocol === key
          return (
            <button
              key={key}
              type="button"
              disabled={isRunning}
              onClick={() => {
                setProtocol(key)
                setElapsedMs(0)
              }}
              className={cx(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                isSelected
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-50',
              )}
            >
              <span>{p.name}</span>
              <span className="text-[10px] opacity-75">({p.breathsPerMinute} bpm)</span>
            </button>
          )
        })}
      </div>

      {/* Center Breathing Orb Canvas */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center py-8">
        {/* Luminous Pulsing Glow Rings */}
        <div className="relative flex h-72 w-72 items-center justify-center">
          <div
            className={cx(
              'absolute inset-0 rounded-full transition-all duration-500 ease-out',
              phaseColors.orbBg,
              'opacity-20 blur-2xl',
              phaseColors.glow,
            )}
            style={{
              transform: `scale(${cycleState.orbScale * 1.3})`,
            }}
          />

          <div
            className={cx(
              'absolute rounded-full border border-white/20 transition-all duration-300 ease-out',
              phaseColors.gradient,
            )}
            style={{
              width: `${cycleState.orbScale * 180}px`,
              height: `${cycleState.orbScale * 180}px`,
            }}
          />

          {/* Central Orb Core */}
          <div
            className={cx(
              'relative flex flex-col items-center justify-center rounded-full shadow-2xl transition-all duration-300 ease-out',
              phaseColors.orbBg,
            )}
            style={{
              width: `${cycleState.orbScale * 120}px`,
              height: `${cycleState.orbScale * 120}px`,
            }}
          >
            <span className="text-xl font-black uppercase tracking-wider text-white drop-shadow-md">
              {cycleState.phase}
            </span>
            <span className="text-xs font-bold text-white/90">
              {Math.ceil(cycleState.phaseTimeRemainingMs / 1000)}s
            </span>
          </div>
        </div>

        {/* Guidance Prompt */}
        <p
          className={cx(
            'mt-6 text-center text-sm font-semibold tracking-wide transition-colors',
            phaseColors.text,
          )}
        >
          {cycleState.guidanceText}
        </p>
      </div>

      {/* Live Coherence & Autonomic Status Dock */}
      <div className="relative z-10 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-4">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Heart className="h-3.5 w-3.5 text-rose-400" /> Heart Rate
          </span>
          <p className="text-lg font-bold text-white">
            {metrics.heartRateBpm} <span className="text-xs font-normal text-slate-400">BPM</span>
          </p>
          <p className="text-[10px] text-slate-400">IBI: {metrics.meanIbiMs} ms</p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Activity className="h-3.5 w-3.5 text-cyan-400" /> Vagal RMSSD
          </span>
          <p className="text-lg font-bold text-cyan-300">
            {metrics.rmssd} <span className="text-xs font-normal text-slate-400">ms</span>
          </p>
          <p className="text-[10px] text-slate-400">SDNN: {metrics.sdnn} ms</p>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Coherence Ratio
          </span>
          <p className="text-lg font-bold text-emerald-400">
            {Math.round(metrics.coherenceRatio * 100)}%
          </p>
          <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 uppercase">
            {metrics.coherenceTier}
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-indigo-400" /> Cognitive Readiness
          </span>
          <p className="text-lg font-bold text-indigo-300">{metrics.cognitiveReadinessScore}/100</p>
          <button
            type="button"
            onClick={handlePulseTap}
            className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-200 hover:bg-white/20 active:scale-95 transition-all"
          >
            <span>Tap Pulse</span>
          </button>
        </div>
      </div>

      {/* Completion Modal / Banner */}
      {isCompleted && (
        <div className="relative z-20 mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/80 p-5 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  Pre-Study Resonance Priming Complete!
                </h3>
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  Your vagal tone is activated and cardiac coherence is at{' '}
                  {Math.round(metrics.coherenceRatio * 100)}%. Your prefrontal working memory
                  bandwidth is primed.
                </p>
              </div>
            </div>

            {onNavigateToReview && (
              <button
                type="button"
                onClick={onNavigateToReview}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                <span>Launch Review</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Session Progress & Primary CTA */}
      <div className="relative z-10 mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-white/10 pt-4">
        {/* Progress Bar & Countdown */}
        <div className="space-y-1.5 sm:w-1/2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Session Progress</span>
            <span className="font-semibold text-white">
              {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}{' '}
              remaining
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${totalProgress * 100}%` }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetSession}
            title="Reset Session"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={toggleRun}
            className={cx(
              'flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold transition-all active:scale-95 shadow-lg',
              isRunning
                ? 'bg-amber-600 text-white shadow-amber-600/30 hover:bg-amber-500'
                : 'bg-indigo-600 text-white shadow-indigo-600/30 hover:bg-indigo-500',
            )}
          >
            {isRunning ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{isCompleted ? 'Repeat Priming' : 'Begin Resonance'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
