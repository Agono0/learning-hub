'use client'

/**
 * Circadian Alertness Studio & Cognitive Peak Optimizer.
 *
 * Implements chronobiology-informed study scheduling and autonomic entrainment:
 * - 2-Process Sleep Regulation Model (Borbély 1982; Dijk & Czeisler 1994)
 * - Working memory & inhibitory control circadian peaks (Schmidt et al. 2007)
 * - The Inspiration Hour effect for creative association (Wieth & Zacks 2011)
 * - Pharmacokinetic caffeine clearance and adenosine preservation (Drake et al. 2013)
 * - Dual-channel procedural binaural beat entrainment (Herrmann 2001)
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Coffee,
  Headphones,
  Moon,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import {
  simulateCircadianAlertness,
  simulateCaffeineDecay,
  getBinauralFrequencies,
  type Chronotype,
  type BinauralMode,
  type CaffeineDose,
} from '@learning-hub/core'
import { Badge, Button, Callout, Panel } from '@/ui'

export interface CircadianAlertnessStudioProps {
  initialBedtime?: number
  onSyncWithPlanner?: (peakHours: { start: number; end: number }) => void
}

const CAFFEINE_PRESETS = [
  { label: 'Espresso', mg: 65, icon: '☕' },
  { label: 'Filter Coffee', mg: 120, icon: '☕' },
  { label: 'Matcha / Green Tea', mg: 40, icon: '🍵' },
  { label: 'Energy Drink', mg: 160, icon: '⚡' },
]

export function CircadianAlertnessStudio({
  initialBedtime = 23,
  onSyncWithPlanner,
}: CircadianAlertnessStudioProps) {
  const [chronotype, setChronotype] = useState<Chronotype>('intermediate')
  const [wakeHour, setWakeHour] = useState(7)
  const [bedtimeHour, setBedtimeHour] = useState(initialBedtime)

  // Caffeine simulator state
  const [doses, setDoses] = useState<CaffeineDose[]>([
    { mg: 120, hour: 8 },
    { mg: 65, hour: 13 },
  ])
  const [newDoseMg, setNewDoseMg] = useState(100)
  const [newDoseHour, setNewDoseHour] = useState(14)

  // Binaural audio player state
  const [binauralMode, setBinauralMode] = useState<BinauralMode>('none')
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioVolume, setAudioVolume] = useState(0.3)
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscLeftRef = useRef<OscillatorNode | null>(null)
  const oscRightRef = useRef<OscillatorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

  // Client-only clock: resolving the hour during prerender would stamp the
  // build machine's clock into the exported HTML, breaking the byte-identical
  // export the OTA content-addressed manifest relies on (docs/updates.md).
  // null until mounted → no live highlight in the static export; the real
  // hour appears on hydration.
  const [currentHour, setCurrentHour] = useState<number | null>(null)
  useEffect(() => {
    setCurrentHour(new Date().getHours())
  }, [])

  // Simulate circadian alertness curve
  const circadianResult = useMemo(
    () => simulateCircadianAlertness(chronotype, wakeHour, bedtimeHour),
    [chronotype, wakeHour, bedtimeHour],
  )

  // Simulate caffeine decay kinetics
  const caffeineResult = useMemo(
    () => simulateCaffeineDecay(doses, bedtimeHour),
    [doses, bedtimeHour],
  )

  // Current cognitive status point
  const currentStatusPoint = useMemo(
    () => circadianResult.hourlyCurve.find((p) => p.hour === currentHour),
    [circadianResult, currentHour],
  )

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio()
    }
  }, [])

  function stopAudio() {
    if (oscLeftRef.current) {
      try {
        oscLeftRef.current.stop()
        oscLeftRef.current.disconnect()
      } catch {
        /* noop */
      }
      oscLeftRef.current = null
    }
    if (oscRightRef.current) {
      try {
        oscRightRef.current.stop()
        oscRightRef.current.disconnect()
      } catch {
        /* noop */
      }
      oscRightRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    setIsPlayingAudio(false)
  }

  function startBinauralAudio(mode: BinauralMode) {
    stopAudio()
    if (mode === 'none') {
      setBinauralMode('none')
      return
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      audioContextRef.current = ctx

      const freqs = getBinauralFrequencies(mode)
      if (freqs.carrierLeft === 0) return

      // Create stereo panner / merger
      const merger = ctx.createChannelMerger(2)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(audioVolume, ctx.currentTime)
      gainNodeRef.current = gain

      // Left ear carrier
      const oscL = ctx.createOscillator()
      oscL.type = 'sine'
      oscL.frequency.setValueAtTime(freqs.carrierLeft, ctx.currentTime)
      oscL.connect(merger, 0, 0)
      oscLeftRef.current = oscL

      // Right ear carrier
      const oscR = ctx.createOscillator()
      oscR.type = 'sine'
      oscR.frequency.setValueAtTime(freqs.carrierRight, ctx.currentTime)
      oscR.connect(merger, 0, 1)
      oscRightRef.current = oscR

      merger.connect(gain)
      gain.connect(ctx.destination)

      oscL.start()
      oscR.start()

      setBinauralMode(mode)
      setIsPlayingAudio(true)
    } catch {
      // Audio playback unavailable in current environment
      setIsPlayingAudio(false)
    }
  }

  function handleVolumeChange(val: number) {
    setAudioVolume(val)
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(val, audioContextRef.current.currentTime)
    }
  }

  function addDose(mg: number, hour: number) {
    setDoses((prev) => [...prev, { mg, hour }].sort((a, b) => a.hour - b.hour))
  }

  function removeDose(index: number) {
    setDoses((prev) => prev.filter((_, i) => i !== index))
  }

  const customDoseHourId = useId()
  const customDoseMgId = useId()
  const binauralVolumeId = useId()

  return (
    <div className="space-y-6">
      {/* Real-time Physiological State Banner */}
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-indigo-950/20 to-neutral-900/60 p-5 shadow-lg backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold tracking-wide uppercase text-indigo-400">
                Live Circadian Tracking{currentHour !== null ? ` · ${currentHour}:00` : ''}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {currentStatusPoint?.zone === 'peak' && (
                <Zap className="h-5 w-5 text-status-warning-text" />
              )}
              {currentStatusPoint?.zone === 'dip' && (
                <Coffee className="h-5 w-5 text-status-warning-text" />
              )}
              {currentStatusPoint?.zone === 'optimal' && (
                <Brain className="h-5 w-5 text-indigo-400" />
              )}
              {currentStatusPoint?.zone === 'wind_down' && (
                <Moon className="h-5 w-5 text-indigo-400" />
              )}
              {currentStatusPoint?.zone === 'sleep' && <Moon className="h-5 w-5 text-blue-400" />}
              Current State: {currentStatusPoint?.zone.toUpperCase()} Focus (
              {currentStatusPoint?.alertness}% Alertness)
            </h3>
            <p className="text-xs text-secondary max-w-xl">
              {currentStatusPoint?.recommendedActivity}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onSyncWithPlanner && (
              <Button
                variant="primary"
                onClick={() =>
                  onSyncWithPlanner({
                    start: circadianResult.windows.workingMemoryPeak.startHour,
                    end: circadianResult.windows.workingMemoryPeak.endHour,
                  })
                }
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Sync with Study Planner
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Chronotype & Wake Schedule Tuning */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-status-warning-text" />
            <span>Chronotype Profile & Sleep Architecture</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setChronotype('morning_lark')}
              className={`rounded-xl border p-3.5 text-left transition ${
                chronotype === 'morning_lark'
                  ? 'border-amber-400 bg-amber-500/10 text-white shadow-sm ring-1 ring-amber-400'
                  : 'border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold flex items-center gap-1.5">🌅 Morning Lark</span>
                {chronotype === 'morning_lark' && (
                  <CheckCircle2 className="h-4 w-4 text-status-warning-text" />
                )}
              </div>
              <p className="text-xs opacity-80">
                Early cortisol rise. Peak analytical clarity 08:00–12:00. Evening wind-down by
                21:30.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setChronotype('intermediate')}
              className={`rounded-xl border p-3.5 text-left transition ${
                chronotype === 'intermediate'
                  ? 'border-indigo-400 bg-indigo-500/10 text-white shadow-sm ring-1 ring-indigo-400'
                  : 'border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  🕊️ Intermediate (Third Bird)
                </span>
                {chronotype === 'intermediate' && (
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                )}
              </div>
              <p className="text-xs opacity-80">
                Standard circadian phase. Peak focus 10:00–13:30. Post-lunch dip ~14:00–16:00.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setChronotype('night_owl')}
              className={`rounded-xl border p-3.5 text-left transition ${
                chronotype === 'night_owl'
                  ? 'border-indigo-400 bg-indigo-500/10 text-white shadow-sm ring-1 ring-indigo-400'
                  : 'border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold flex items-center gap-1.5">🦉 Night Owl</span>
                {chronotype === 'night_owl' && <CheckCircle2 className="h-4 w-4 text-indigo-400" />}
              </div>
              <p className="text-xs opacity-80">
                Delayed phase. Slower morning start; maximum working memory & flow 16:30–22:00.
              </p>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-white/5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-secondary flex items-center gap-1">
                  <Sun className="h-3.5 w-3.5 text-status-warning-text" /> Typical Wake Hour
                </label>
                <span className="text-xs font-mono font-bold text-status-warning-text">
                  {wakeHour}:00
                </span>
              </div>
              <input
                type="range"
                min="4"
                max="12"
                step="1"
                value={wakeHour}
                onChange={(e) => setWakeHour(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-secondary flex items-center gap-1">
                  <Moon className="h-3.5 w-3.5 text-indigo-400" /> Target Bedtime
                </label>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  {bedtimeHour}:00
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="28"
                step="1"
                value={bedtimeHour > 12 ? bedtimeHour : bedtimeHour + 24}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setBedtimeHour(val >= 24 ? val - 24 : val)
                }}
                className="w-full accent-indigo-400"
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* 24-Hour Visual Alertness Matrix */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-status-success-text" />
            <span>24-Hour Circadian Alertness & Cognitive Windows</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[650px] space-y-2">
              <div className="grid grid-cols-24 gap-1 items-end h-32 px-1 bg-black/20 rounded-xl p-2 border border-white/5">
                {circadianResult.hourlyCurve.map((point) => {
                  const isCurrent = point.hour === currentHour
                  const heightPct = Math.max(12, point.alertness)
                  const barColor =
                    point.zone === 'peak'
                      ? 'bg-amber-400'
                      : point.zone === 'optimal'
                        ? 'bg-emerald-400'
                        : point.zone === 'dip'
                          ? 'bg-rose-400'
                          : point.zone === 'wind_down'
                            ? 'bg-indigo-400'
                            : 'bg-indigo-900/60'

                  return (
                    <div
                      key={point.hour}
                      className="flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Tooltip */}
                      <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-neutral-900 border border-white/20 text-[10px] text-white px-2 py-1 rounded shadow-xl pointer-events-none whitespace-nowrap">
                        <span className="font-bold">
                          {point.hour}:00 · {point.alertness}%
                        </span>
                        <span className="text-faint">{point.zone}</span>
                      </div>

                      {isCurrent && (
                        <div className="absolute -top-3.5 flex flex-col items-center">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-300 animate-pulse" />
                        </div>
                      )}

                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t transition-all ${barColor} ${
                          isCurrent
                            ? 'ring-2 ring-white ring-offset-1 ring-offset-black'
                            : 'opacity-85'
                        }`}
                      />
                      <span
                        className={`text-[9px] mt-1 font-mono ${
                          isCurrent ? 'font-bold text-white' : 'text-tertiary'
                        }`}
                      >
                        {point.hour}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-faint pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Working Memory Peak
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Optimal Flow
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Post-Lunch Dip
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" /> Wind-Down / Journaling
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-900/60" /> Nocturnal Replay
                  (SWS)
                </span>
              </div>
            </div>
          </div>

          {/* Cognitive Windows Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-status-warning-text flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-status-warning-text" /> Deep Focus
                </span>
                <Badge tone="warning">
                  {circadianResult.windows.workingMemoryPeak.startHour}:00–
                  {circadianResult.windows.workingMemoryPeak.endHour}:00
                </Badge>
              </div>
              <p className="text-xs text-secondary">
                {circadianResult.windows.workingMemoryPeak.description}
              </p>
            </div>

            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-danger-text flex items-center gap-1">
                  <Coffee className="h-3.5 w-3.5 text-danger-text" /> Circadian Dip
                </span>
                <Badge tone="danger">
                  {circadianResult.windows.postLunchDip.startHour}:00–
                  {circadianResult.windows.postLunchDip.endHour}:00
                </Badge>
              </div>
              <p className="text-xs text-secondary">
                {circadianResult.windows.postLunchDip.description}
              </p>
            </div>

            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                  <Brain className="h-3.5 w-3.5 text-indigo-400" /> Creative Incubation
                </span>
                <Badge tone="violet">
                  {circadianResult.windows.creativeIncubation.startHour}:00–
                  {circadianResult.windows.creativeIncubation.endHour}:00
                </Badge>
              </div>
              <p className="text-xs text-secondary">
                {circadianResult.windows.creativeIncubation.description}
              </p>
            </div>

            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                  <Moon className="h-3.5 w-3.5 text-indigo-400" /> Slow-Wave Sleep
                </span>
                <Badge tone="neutral">
                  {circadianResult.windows.nocturnalConsolidation.startHour}:00–
                  {circadianResult.windows.nocturnalConsolidation.endHour}:00
                </Badge>
              </div>
              <p className="text-xs text-secondary">
                {circadianResult.windows.nocturnalConsolidation.description}
              </p>
            </div>
          </div>
        </div>
      </Panel>

      {/* Pharmacokinetic Caffeine Decay Simulator */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Coffee className="h-4 w-4 text-status-warning-text" />
            <span>Caffeine Clearance & Sleep Architecture Simulator</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Left 2 Cols: Decay status and log */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white/5 rounded-xl border border-white/10">
                <div>
                  <span className="text-xs text-faint">Bedtime Remaining Caffeine:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xl font-bold font-mono text-white">
                      {caffeineResult.bedtimeRemainingMg} mg
                    </span>
                    <Badge
                      tone={
                        caffeineResult.sleepDisruptionRisk === 'minimal'
                          ? 'success'
                          : caffeineResult.sleepDisruptionRisk === 'moderate'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {caffeineResult.sleepDisruptionRisk.toUpperCase()} DISRUPTION
                    </Badge>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-faint">Recommended Cutoff:</span>
                  <div className="text-lg font-bold font-mono text-status-warning-text">
                    {caffeineResult.recommendedCutoffHour}:00
                  </div>
                </div>
              </div>

              {caffeineResult.sleepDisruptionRisk !== 'minimal' ? (
                <Callout
                  tone={caffeineResult.sleepDisruptionRisk === 'high' ? 'danger' : 'warning'}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{caffeineResult.disruptionExplanation}</span>
                  </div>
                </Callout>
              ) : (
                <Callout tone="success">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{caffeineResult.disruptionExplanation}</span>
                  </div>
                </Callout>
              )}

              {/* Logged Doses List */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-secondary">
                  Logged Caffeine Doses Today:
                </span>
                <div className="flex flex-wrap gap-2">
                  {doses.map((dose, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs"
                    >
                      <Coffee className="h-3 w-3 text-status-warning-text" />
                      <span className="font-mono font-semibold">{dose.mg}mg</span>
                      <span className="text-tertiary">at {dose.hour}:00</span>
                      <button
                        type="button"
                        onClick={() => removeDose(idx)}
                        className="text-tertiary hover:text-danger-text ml-1 font-bold"
                        title="Remove dose"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {doses.length === 0 && (
                    <span className="text-xs text-tertiary italic">No caffeine logged today</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Col: Add Dose */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
              <span className="text-xs font-semibold text-neutral-200">
                Log Quick Caffeine Dose:
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                {CAFFEINE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => addDose(p.mg, currentHour ?? new Date().getHours())}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10 transition text-xs"
                  >
                    <span>
                      {p.icon} {p.label}
                    </span>
                    <span className="text-[10px] font-mono text-faint">{p.mg}mg</span>
                  </button>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label htmlFor={customDoseMgId} className="text-[10px] text-faint block mb-1">
                      Custom mg
                    </label>
                    <input
                      id={customDoseMgId}
                      type="number"
                      min="10"
                      max="500"
                      value={newDoseMg}
                      onChange={(e) => setNewDoseMg(Number(e.target.value))}
                      className="input text-xs w-full"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor={customDoseHourId} className="text-[10px] text-faint block mb-1">
                      Hour (0-23)
                    </label>
                    <input
                      id={customDoseHourId}
                      type="number"
                      min="0"
                      max="23"
                      value={newDoseHour}
                      onChange={(e) => setNewDoseHour(Number(e.target.value))}
                      className="input text-xs w-full"
                    />
                  </div>
                </div>
                <Button className="w-full text-xs" onClick={() => addDose(newDoseMg, newDoseHour)}>
                  Add Custom Dose
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Dual-Channel Procedural Binaural Beat Entrainment */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-indigo-400" />
            <span>Procedural Binaural Entrainment Audio Player</span>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-secondary">
            Synthesizes stereophonic pure sine carriers directly into headphones to elicit
            frequency-following responses in the auditory cortex (Herrmann 2001). Requires stereo
            headphones.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => startBinauralAudio('gamma_40hz')}
              className={`rounded-xl border p-3.5 text-left transition ${
                binauralMode === 'gamma_40hz' && isPlayingAudio
                  ? 'border-amber-400 bg-amber-500/10 text-white shadow-sm ring-1 ring-amber-400'
                  : 'border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  ⚡ 40Hz Gamma Focus
                </span>
                {binauralMode === 'gamma_40hz' && isPlayingAudio && (
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </div>
              <p className="text-xs opacity-80">
                Left 200Hz, Right 240Hz. Enhances active memory binding, arithmetic, and problem
                solving.
              </p>
            </button>

            <button
              type="button"
              onClick={() => startBinauralAudio('alpha_10hz')}
              className={`rounded-xl border p-3.5 text-left transition ${
                binauralMode === 'alpha_10hz' && isPlayingAudio
                  ? 'border-indigo-400 bg-indigo-500/10 text-white shadow-sm ring-1 ring-indigo-400'
                  : 'border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  🌊 10Hz Alpha Flow
                </span>
                {binauralMode === 'alpha_10hz' && isPlayingAudio && (
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                )}
              </div>
              <p className="text-xs opacity-80">
                Left 210Hz, Right 220Hz. Facilitates relaxed attentional focus, reading, and
                flashcard review.
              </p>
            </button>

            <button
              type="button"
              onClick={() => startBinauralAudio('delta_2hz')}
              className={`rounded-xl border p-3.5 text-left transition ${
                binauralMode === 'delta_2hz' && isPlayingAudio
                  ? 'border-indigo-400 bg-indigo-500/10 text-white shadow-sm ring-1 ring-indigo-400'
                  : 'border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  🌙 2.5Hz Delta Wind-Down
                </span>
                {binauralMode === 'delta_2hz' && isPlayingAudio && (
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                )}
              </div>
              <p className="text-xs opacity-80">
                Left 100Hz, Right 102.5Hz. Elicits slow-wave sleep synchronization and nocturnal
                wind-down.
              </p>
            </button>
          </div>

          {isPlayingAudio && (
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-3">
                <Button variant="danger" onClick={stopAudio}>
                  <VolumeX className="h-4 w-4 mr-1.5" />
                  Stop Entrainment
                </Button>
                <span className="text-xs text-faint">
                  Carrier active: <strong className="text-white">{binauralMode}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor={binauralVolumeId} className="sr-only">
                  Binaural audio volume
                </label>
                <Volume2 className="h-4 w-4 text-faint" />
                <input
                  id={binauralVolumeId}
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={audioVolume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-24 accent-indigo-400"
                />
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
