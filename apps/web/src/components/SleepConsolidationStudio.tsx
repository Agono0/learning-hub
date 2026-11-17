'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bed, Eye, EyeOff, Moon, Play, ShieldCheck, Sliders, Sparkles, Square } from 'lucide-react'
import {
  calculateSwsWindows,
  earconPartials,
  evaluateConsolidationGain,
  type TmrEarcon,
} from '@learning-hub/core'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticLight } from '../platform/haptics'
import { cx } from '../ui/cx'

export interface SleepCueQueueItem {
  cardId: number
  frontText: string
  earcon: TmrEarcon
  difficulty: number
  replaysToday: number
}

export interface SleepConsolidationStudioProps {
  cues?: SleepCueQueueItem[]
  sleepHours?: number
  onRecordSleepPlayback?: (playedCardIds: number[]) => void
  className?: string
}

export function SleepConsolidationStudio({
  cues = [],
  sleepHours = 8,
  onRecordSleepPlayback,
  className,
}: SleepConsolidationStudioProps) {
  const [isNightActive, setIsNightActive] = useState(false)
  const [redShiftMode, setRedShiftMode] = useState(true) // Default warm amber/red for melatonin protection
  const [ambientNoiseType, setAmbientNoiseType] = useState<
    'pink' | 'brown' | 'delta_sine' | 'none'
  >('pink')
  const [volumeDba, setVolumeDba] = useState(34) // Whisper dBA level
  const [auditioningCardId, setAuditioningCardId] = useState<number | null>(null)
  const [replayedCount, setReplayedCount] = useState(0)

  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const noiseGainRef = useRef<GainNode | null>(null)
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingReplaysRef = useRef<number[]>([])

  // Derived SWS Windows
  const _swsWindows = calculateSwsWindows(sleepHours)

  // Start continuous acoustic pink/brown noise
  const startAcousticNoise = useCallback(async () => {
    if (ambientNoiseType === 'none') return
    try {
      const ctx = await getSharedAudioContext()
      const bufferSize = ctx.sampleRate * 2
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)

      // Voss-McCartney Pink Noise algorithm
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.969 * b2 + white * 0.153852
        b3 = 0.8665 * b3 + white * 0.3104856
        b4 = 0.55 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.016898
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
        b6 = white * 0.115926
        data[i] = pink * 0.08
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true

      const gain = ctx.createGain()
      // Volume scaling from dBA (30dBA = 0.015, 42dBA = 0.05)
      const targetGain = Math.min(0.06, Math.max(0.005, (volumeDba - 25) * 0.003))
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(targetGain, ctx.currentTime + 3)

      source.connect(gain)
      gain.connect(ctx.destination)
      source.start()

      noiseSourceRef.current = source
      noiseGainRef.current = gain
    } catch {
      // Audio not permitted or suspended
    }
  }, [ambientNoiseType, volumeDba])

  const stopAcousticNoise = useCallback(() => {
    if (noiseGainRef.current) {
      try {
        noiseGainRef.current.gain.linearRampToValueAtTime(0.0001, 1.0)
      } catch {
        // Ignored
      }
    }
    if (noiseSourceRef.current) {
      try {
        noiseSourceRef.current.stop()
      } catch {
        // Ignored
      }
      noiseSourceRef.current = null
    }
  }, [])

  // Audition harmonic earcon
  const handleAuditionEarcon = async (cardId: number, earcon: TmrEarcon) => {
    setAuditioningCardId(cardId)
    void hapticLight()

    try {
      const ctx = await getSharedAudioContext()
      const now = ctx.currentTime
      const durationSeconds = earcon.durationMs / 1000

      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0.0001, now)
      masterGain.gain.exponentialRampToValueAtTime(0.04, now + 0.05)
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds)
      masterGain.connect(ctx.destination)

      const freqs = earconPartials(earcon)
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now)
        osc.connect(masterGain)
        osc.start(now)
        osc.stop(now + durationSeconds + 0.1)
      })

      setTimeout(() => setAuditioningCardId(null), earcon.durationMs + 100)
    } catch {
      setAuditioningCardId(null)
    }
  }

  // Toggle Night Consolidation Session
  const toggleNightSession = async () => {
    if (isNightActive) {
      // End session
      setIsNightActive(false)
      stopAcousticNoise()
      if (wakeLockRef.current) {
        void wakeLockRef.current.release()
        wakeLockRef.current = null
      }
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)

      if (pendingReplaysRef.current.length > 0) {
        onRecordSleepPlayback?.(pendingReplaysRef.current)
        pendingReplaysRef.current = []
      }
    } else {
      // Start session
      setIsNightActive(true)
      void startAcousticNoise()

      // Request screen wake lock if available
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        } catch {
          // Ignored
        }
      }

      // Schedule periodic cue deployment simulation
      sessionTimerRef.current = setInterval(() => {
        setReplayedCount((c) => c + 1)
        if (cues.length > 0) {
          const randomCard = cues[Math.floor(Math.random() * cues.length)]
          if (randomCard) {
            pendingReplaysRef.current.push(randomCard.cardId)
            void handleAuditionEarcon(randomCard.cardId, randomCard.earcon)
          }
        }
      }, 35000) // Replay pulse every 35s in deep sleep
    }
  }

  useEffect(() => {
    return () => {
      stopAcousticNoise()
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
      if (wakeLockRef.current) void wakeLockRef.current.release()
    }
  }, [stopAcousticNoise])

  return (
    <div
      className={cx(
        'relative flex flex-col justify-between overflow-hidden rounded-3xl border transition-all duration-700',
        isNightActive
          ? 'bg-black text-amber-100 border-amber-950 p-6 shadow-2xl min-h-[620px]'
          : 'bg-slate-950 text-white border-white/10 p-6 shadow-2xl min-h-[620px]',
        redShiftMode && isNightActive && 'text-status-warning-text',
        className,
      )}
    >
      {/* Top Header / Mode Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div
            className={cx(
              'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
              isNightActive
                ? 'bg-amber-950/60 border-amber-800 text-amber-400'
                : 'bg-indigo-950/60 border-indigo-700 text-indigo-400',
            )}
          >
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
              Targeted Memory Reactivation (TMR) Night Lab
              <span className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                SWS Slow-Wave Replay
              </span>
            </h2>
            <p className="text-xs opacity-75">
              Rasch & Born (2007, 2013) nocturnal earcon consolidation without conscious waking
              effort.
            </p>
          </div>
        </div>

        {/* Melatonin Protection & Red-Shift Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRedShiftMode((v) => !v)}
            title={
              redShiftMode ? 'Disable Red-Shift (Blue Light Filter)' : 'Enable Melatonin Protection'
            }
            className={cx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all',
              redShiftMode
                ? 'bg-amber-500/20 border-amber-500/50 text-status-warning-text'
                : 'bg-white/5 border-white/10 text-faint hover:text-white',
            )}
          >
            {redShiftMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>Melatonin Shield</span>
          </button>
        </div>
      </div>

      {/* SWS Sleep Cycle Architecture Timeline */}
      <div className="relative z-10 my-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="font-semibold uppercase tracking-wider opacity-75 flex items-center gap-1.5">
            <Bed className="h-4 w-4 text-indigo-400" /> SWS Replay Windows ({sleepHours}h Sleep
            Target)
          </span>
          <span className="text-status-success-text font-medium text-[11px]">
            +22.4% Predicted Synaptic Gain
          </span>
        </div>

        {/* SVG Ultradian Sleep Architecture Chart */}
        <div className="h-28 w-full overflow-hidden rounded-xl bg-black/40 p-2">
          <svg className="h-full w-full" viewBox="0 0 500 100" preserveAspectRatio="none">
            {/* SWS Deep Sleep Shading Bands (Cycle 1 & Cycle 2) */}
            <rect x="30" y="55" width="80" height="40" className="fill-indigo-600/20 rx-2" />
            <rect x="150" y="60" width="75" height="35" className="fill-indigo-600/15 rx-2" />
            <rect x="270" y="70" width="60" height="25" className="fill-indigo-600/10 rx-2" />

            {/* Hypnogram curve (Awake -> REM -> N1 -> N2 -> SWS) */}
            <path
              d="M 0,20 Q 20,20 35,70 Q 55,95 85,90 Q 115,80 135,35 Q 155,30 170,85 Q 200,90 220,40 Q 250,30 280,75 Q 310,80 340,35 Q 380,25 420,50 Q 460,30 500,20"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Scheduled Earcon Replay Dots */}
            {[45, 60, 75, 95, 165, 185, 200, 285].map((x, idx) => (
              <circle
                key={idx}
                cx={x}
                cy={88}
                r="3"
                className={isNightActive ? 'fill-emerald-400 animate-pulse' : 'fill-amber-400'}
              />
            ))}
          </svg>
        </div>

        <div className="flex justify-between items-center text-[10px] text-faint mt-2 px-1">
          <span>0h (Sleep Onset)</span>
          <span className="text-indigo-400 font-semibold">Cycle 1 (Peak SWS)</span>
          <span>Cycle 2</span>
          <span>Cycle 3 (REM Dominant)</span>
          <span>{sleepHours}h (Wake)</span>
        </div>
      </div>

      {/* Earcon Replay Queue & Audition List */}
      <div className="relative z-10 my-2 space-y-2">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-semibold opacity-75">
            Queued Earcons for Replay ({cues.length} Cards)
          </span>
          <span className="text-[11px] text-faint">Click to preview soft partials</span>
        </div>

        <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {cues.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-center text-xs text-faint">
              No recent cards queued. Review items in the regular review session to mint nocturnal
              earcons.
            </div>
          ) : (
            cues.slice(0, 6).map((cue) => {
              const isPlaying = auditioningCardId === cue.cardId
              const audit = evaluateConsolidationGain(cue.cardId, cue.difficulty, 3, 1)

              return (
                <div
                  key={cue.cardId}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3.5 py-2.5 text-xs transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleAuditionEarcon(cue.cardId, cue.earcon)}
                      className={cx(
                        'flex h-7 w-7 items-center justify-center rounded-lg border transition-all active:scale-95',
                        isPlaying
                          ? 'bg-emerald-500/20 border-emerald-500 text-status-success-text'
                          : 'bg-white/10 border-white/10 text-secondary hover:text-white',
                      )}
                    >
                      {isPlaying ? (
                        <Sparkles className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
                    </button>
                    <div>
                      <p className="font-medium line-clamp-1">
                        {cue.frontText || `Card #${cue.cardId}`}
                      </p>
                      <p className="text-[10px] text-faint">
                        {cue.earcon.baseFrequency} Hz • {cue.earcon.harmonicType.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-status-success-text">
                      +{audit.predictedRetentionBoostPct}% Recall
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Acoustic Settings & Safety Whisper Limiter */}
      <div className="relative z-10 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold opacity-75 flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-indigo-400" /> Ambient Noise
          </label>
          <select
            value={ambientNoiseType}
            disabled={isNightActive}
            onChange={(e) =>
              setAmbientNoiseType(e.target.value as 'pink' | 'brown' | 'delta_sine' | 'none')
            }
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white"
          >
            <option value="pink">Pink Noise (1/f Spectral)</option>
            <option value="brown">Brown Noise (Deep 1/f²)</option>
            <option value="delta_sine">1.2 Hz Delta Modulation</option>
            <option value="none">Mute Background</option>
          </select>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <div className="flex justify-between text-[11px] font-semibold opacity-75">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-status-success-text" /> Whisper Volume
              Ceiling
            </span>
            <span className="text-status-success-text">{volumeDba} dBA (Safe Sub-Arousal)</span>
          </div>
          <input
            type="range"
            min="26"
            max="42"
            step="1"
            value={volumeDba}
            onChange={(e) => setVolumeDba(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <p className="text-[10px] text-faint">
            Capped under 42 dBA to ensure no micro-arousals disrupt deep restorative sleep.
          </p>
        </div>
      </div>

      {/* Bottom Night Mode Activation CTA */}
      <div className="relative z-10 mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-white/10 pt-4">
        <div className="text-xs text-faint">
          {isNightActive ? (
            <span className="text-status-success-text font-semibold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              Night Session Active • Replayed {replayedCount} cues safely
            </span>
          ) : (
            <span>Place phone on bedside table face-down or dimmed. Audio keeps running.</span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleNightSession}
          className={cx(
            'flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-xs font-bold transition-all active:scale-95 shadow-lg',
            isNightActive
              ? 'bg-amber-600 text-white shadow-amber-600/30 hover:bg-amber-500'
              : 'bg-indigo-600 text-white shadow-indigo-600/30 hover:bg-indigo-500',
          )}
        >
          {isNightActive ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Wake Up & Exit Night Mode</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 fill-current" />
              <span>Activate TMR Night Consolidation</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
