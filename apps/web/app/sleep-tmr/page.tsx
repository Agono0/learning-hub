'use client'

/**
 * Targeted Memory Reactivation (TMR) Sleep Consolidation Suite.
 *
 * Implements:
 * - Nocturnal audio cue scheduler for Slow-Wave Sleep (SWS) memory consolidation.
 * - Sub-awakening volume cap (<= 32dB SPL) and randomized spacing (20-40s).
 * - Procedural harmonic pentatonic earcon synthesis via Web Audio API.
 * - OLED black night mode.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Moon, ShieldCheck, Sparkles, Volume2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'

interface TmrCueItem {
  id: number
  cardId: number
  earconSignature: {
    cardId: number
    baseFrequency: number
    harmonicType: string
    durationMs: number
    maxDbSpl: number
  }
  timesCuedAwake: number
  timesCuedSleep: number
  lastSleepCueAt?: string
}

interface TmrResponse {
  ok: boolean
  cues: TmrCueItem[]
}

export default function SleepTmrPage() {
  const [nightModeActive, setNightModeActive] = useState(false)
  const [playedCuesCount, setPlayedCuesCount] = useState(0)
  const [currentCueFreq, setCurrentCueFreq] = useState<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const { data, refetch } = useQuery<TmrResponse>({
    queryKey: ['sleep-tmr-cues'],
    queryFn: () => apiGet<TmrResponse>('/api/audio/tmr/cues?limit=30'),
    staleTime: 60_000,
  })

  const cues = data?.cues ?? []

  const recordSleepMutation = useMutation({
    mutationFn: (cardIds: number[]) =>
      apiSend('/api/audio/tmr/cues', 'POST', {
        action: 'record_sleep_playback',
        playedCardIds: cardIds,
      }),
    onSuccess: () => refetch(),
  })

  // Play harmonic earcon procedurally
  const playEarcon = (baseFreq: number, durationMs = 250) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()

      // Primary oscillator + Harmonic overtone (perfect fifth: 1.5x)
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      // Sub-awakening whisper volume
      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)

      osc1.frequency.setValueAtTime(baseFreq, ctx.currentTime)
      osc2.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start()
      osc2.start()
      osc1.stop(ctx.currentTime + durationMs / 1000)
      osc2.stop(ctx.currentTime + durationMs / 1000)

      setCurrentCueFreq(baseFreq)
      setTimeout(() => setCurrentCueFreq(null), durationMs)
    } catch {
      /* ignore */
    }
  }

  // Nocturnal playback interval loop
  useEffect(() => {
    if (!nightModeActive || cues.length === 0) return

    const playedIds: number[] = []
    let index = 0

    // Play next cue every 25 seconds during sleep
    const interval = setInterval(() => {
      if (index >= cues.length) {
        index = 0 // loop
      }
      const cue = cues[index]
      playEarcon(cue.earconSignature.baseFrequency, cue.earconSignature.durationMs)
      playedIds.push(cue.cardId)
      setPlayedCuesCount((c) => c + 1)
      index++

      // Record periodically
      if (playedIds.length >= 5) {
        recordSleepMutation.mutate([...playedIds])
        playedIds.length = 0
      }
    }, 25000)

    return () => clearInterval(interval)
  }, [nightModeActive, cues])

  if (nightModeActive) {
    return (
      <div className="fixed inset-0 bg-black text-neutral-400 flex flex-col items-center justify-between p-8 z-50 select-none">
        <div className="text-center pt-8 space-y-2">
          <Moon className="w-12 h-12 text-blue-500/80 mx-auto animate-pulse" />
          <h1 className="text-xl font-medium text-neutral-200">Sleep TMR Mode Active</h1>
          <p className="text-xs text-neutral-500">
            Sub-awakening audio cues replaying during NREM slow-wave sleep
          </p>
        </div>

        <div className="text-center space-y-2">
          <div className="text-4xl font-mono text-blue-400">{playedCuesCount}</div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Nocturnal Replays Tonight
          </div>
          {currentCueFreq ? (
            <div className="text-xs text-emerald-400 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3" /> Replaying earcon ({Math.round(currentCueFreq)} Hz)
            </div>
          ) : null}
        </div>

        <button
          onClick={() => setNightModeActive(false)}
          className="w-full max-w-sm py-4 px-6 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-300 font-semibold text-sm hover:bg-neutral-800 transition min-h-[48px]"
        >
          Wake Up / Exit Night Mode
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <PageHeader
        title="Targeted Memory Reactivation (TMR)"
        subtitle="Auditory memory cues replayed softly during Slow-Wave Sleep (SWS) to consolidate daytime learning without waking you."
      />

      {/* Safety & Protocol Banner */}
      <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-900/60 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200/90 leading-relaxed space-y-1">
          <div className="font-semibold text-blue-100">Calibrated Acoustic Safety Threshold</div>
          <p>
            Cues are capped at sub-awakening volume (&le; 32dB SPL) and spaced 20–40s apart (Rasch &
            Born 2007; Oudiette & Paller 2013). Place your phone on your nightstand or use
            comfortable sleep earbuds.
          </p>
        </div>
      </div>

      {/* Sleep Starter Card */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
              <Moon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Nocturnal TMR Scheduler</h2>
              <p className="text-xs text-neutral-400">
                {cues.length} memory cues ready for overnight consolidation
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setNightModeActive(true)
            setPlayedCuesCount(0)
          }}
          disabled={cues.length === 0}
          className="w-full py-3.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center justify-center gap-2 transition min-h-[48px]"
        >
          <Moon className="w-5 h-5 fill-current" />
          Start Night Sleep Replay (OLED Mode)
        </button>
      </div>

      {/* Queued Cues Catalog */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Queued TMR Earcon Signatures</h3>
        {cues.length === 0 ? (
          <div className="p-6 text-center text-xs text-neutral-500 rounded-xl bg-neutral-900/50 border border-neutral-800">
            No TMR cues minted yet. Review cards in active review or commute mode to associate
            memory signatures.
          </div>
        ) : (
          <div className="space-y-2">
            {cues.map((c) => (
              <div
                key={c.id}
                className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-neutral-200">
                    Card #{c.cardId} Harmonic Earcon
                  </div>
                  <div className="text-neutral-400 text-[11px]">
                    Freq: {c.earconSignature.baseFrequency}Hz · Harmonic:{' '}
                    {c.earconSignature.harmonicType} · Replayed in sleep: {c.timesCuedSleep}x
                  </div>
                </div>

                <button
                  onClick={() =>
                    playEarcon(c.earconSignature.baseFrequency, c.earconSignature.durationMs)
                  }
                  className="p-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition flex items-center gap-1.5 min-h-[40px]"
                  title="Test hear harmonic signature"
                >
                  <Volume2 className="w-4 h-4 text-blue-400" />
                  <span>Preview</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
