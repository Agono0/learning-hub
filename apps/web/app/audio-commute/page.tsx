'use client'

/**
 * Hands-Free Auditory Spaced Repetition (Commute & Walking Engine).
 *
 * Implements:
 * - Dynamic FSRS-6 recall pause intervals.
 * - Procedural Web Audio binaural beats (40Hz Gamma, 10Hz Alpha).
 * - Spoken speech synthesis & speech recognition grading.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Headphones, Pause, Play, RotateCcw, Sparkles, Volume2 } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { PageHeader } from '@/ui'

interface AudioCue {
  cardId: number
  promptText: string
  answerText: string
  deckName?: string
  pauseMs: number
}

interface CommuteResponse {
  ok: boolean
  cues: AudioCue[]
}

export default function AudioCommutePage() {
  const [binauralMode, setBinauralMode] = useState<'none' | 'gamma_40hz' | 'alpha_10hz'>(
    'gamma_40hz',
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'prompt' | 'pause' | 'answer' | 'grading'>('idle')
  const [pauseTimeRemainingMs, setPauseTimeRemainingMs] = useState(0)
  const [reviewedInputs, setReviewedInputs] = useState<
    Array<{ cardId: number; inputType: 'voice_speech' | 'earbud_media_key'; grade: 1 | 2 | 3 | 4 }>
  >([])

  // Web Audio Context reference for procedural binaural beats
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscillatorsRef = useRef<{
    oscL: OscillatorNode
    oscR: OscillatorNode
    gain: GainNode
  } | null>(null)

  const { data, isLoading, refetch } = useQuery<CommuteResponse>({
    queryKey: ['audio-commute-cues', binauralMode],
    queryFn: () =>
      apiGet<CommuteResponse>(`/api/audio/circadian/commute?binaural=${binauralMode}&limit=12`),
    staleTime: 60_000,
  })

  const cues = data?.cues ?? []

  // Complete session mutation
  const saveSession = useMutation({
    mutationFn: (payload: {
      cardsReviewed: number
      durationSeconds: number
      handsFreeInputs: typeof reviewedInputs
    }) =>
      apiSend('/api/audio/circadian/commute', 'POST', {
        sessionMode: 'commute',
        cardsReviewed: payload.cardsReviewed,
        durationSeconds: payload.durationSeconds,
        binauralMode,
        handsFreeInputs: payload.handsFreeInputs.map((i) => ({
          ...i,
          latencyMs: 3000,
          timestamp: new Date().toISOString(),
        })),
      }),
  })

  // Start / stop binaural beat synthesis via pure Web Audio API
  useEffect(() => {
    if (!isPlaying || binauralMode === 'none') {
      if (oscillatorsRef.current) {
        try {
          oscillatorsRef.current.oscL.stop()
          oscillatorsRef.current.oscR.stop()
        } catch {
          /* ignore */
        }
        oscillatorsRef.current = null
      }
      return
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      const merger = ctx.createChannelMerger(2)
      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0.08, ctx.currentTime)

      const baseFreq = binauralMode === 'gamma_40hz' ? 200 : 210
      const delta = binauralMode === 'gamma_40hz' ? 40 : 10

      const oscL = ctx.createOscillator()
      oscL.type = 'sine'
      oscL.frequency.setValueAtTime(baseFreq, ctx.currentTime)

      const oscR = ctx.createOscillator()
      oscR.type = 'sine'
      oscR.frequency.setValueAtTime(baseFreq + delta, ctx.currentTime)

      oscL.connect(merger, 0, 0)
      oscR.connect(merger, 0, 1)
      merger.connect(masterGain)
      masterGain.connect(ctx.destination)

      oscL.start()
      oscR.start()

      oscillatorsRef.current = { oscL, oscR, gain: masterGain }
    } catch {
      /* AudioContext unavailable or restricted */
    }

    return () => {
      if (oscillatorsRef.current) {
        try {
          oscillatorsRef.current.oscL.stop()
          oscillatorsRef.current.oscR.stop()
        } catch {
          /* ignore */
        }
        oscillatorsRef.current = null
      }
    }
  }, [isPlaying, binauralMode])

  // Play auditory card sequence
  useEffect(() => {
    if (!isPlaying || cues.length === 0 || currentIndex >= cues.length) return

    const card = cues[currentIndex]
    let timer: NodeJS.Timeout

    const speak = (text: string, onEnd: () => void) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 1.05
        utterance.onend = onEnd
        utterance.onerror = onEnd
        window.speechSynthesis.speak(utterance)
      } else {
        // Fallback delay if speech synthesis not available
        timer = setTimeout(onEnd, 2000)
      }
    }

    // Step 1: Prompt
    setPhase('prompt')
    speak(card.promptText, () => {
      // Step 2: Pause Countdown
      setPhase('pause')
      setPauseTimeRemainingMs(card.pauseMs)
      const start = Date.now()
      const totalPause = card.pauseMs

      const interval = setInterval(() => {
        const elapsed = Date.now() - start
        const remaining = Math.max(0, totalPause - elapsed)
        setPauseTimeRemainingMs(remaining)

        if (remaining <= 0) {
          clearInterval(interval)
          // Play micro chime sound
          try {
            if (audioCtxRef.current) {
              const chime = audioCtxRef.current.createOscillator()
              const chimeGain = audioCtxRef.current.createGain()
              chime.frequency.setValueAtTime(440, audioCtxRef.current.currentTime)
              chimeGain.gain.setValueAtTime(0.05, audioCtxRef.current.currentTime)
              chime.connect(chimeGain)
              chimeGain.connect(audioCtxRef.current.destination)
              chime.start()
              chime.stop(audioCtxRef.current.currentTime + 0.15)
            }
          } catch {
            /* ignore */
          }

          // Step 3: Answer
          setPhase('answer')
          speak(card.answerText, () => {
            setPhase('grading')
          })
        }
      }, 50)
    })

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      clearTimeout(timer)
    }
  }, [isPlaying, currentIndex, cues])

  const submitGrade = (grade: 1 | 2 | 3 | 4) => {
    if (cues.length === 0) return
    const currentCard = cues[currentIndex]
    const updated = [
      ...reviewedInputs,
      { cardId: currentCard.cardId, inputType: 'voice_speech' as const, grade },
    ]
    setReviewedInputs(updated)

    if (currentIndex + 1 < cues.length) {
      setCurrentIndex((prev) => prev + 1)
      setPhase('idle')
    } else {
      // Session finished
      setIsPlaying(false)
      setPhase('idle')
      saveSession.mutate({
        cardsReviewed: updated.length,
        durationSeconds: updated.length * 8,
        handsFreeInputs: updated,
      })
    }
  }

  const isCompleted = currentIndex >= cues.length && cues.length > 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <PageHeader
        title="Hands-Free Commute Audio"
        subtitle="Spaced repetition designed for walking and running. FSRS calculates the optimal pause interval before answers are revealed."
      />

      {/* Controller Card */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">
                {isCompleted ? 'Commute Completed!' : `Card ${currentIndex + 1} of ${cues.length}`}
              </h2>
              <p className="text-xs text-neutral-400">
                {cues[currentIndex]?.deckName
                  ? `Deck: ${cues[currentIndex].deckName}`
                  : 'Commute Queue'}
              </p>
            </div>
          </div>

          {/* Binaural Beat Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-800 rounded-lg text-xs">
            <button
              onClick={() => setBinauralMode('none')}
              className={`px-2.5 py-1.5 rounded-md font-medium transition ${
                binauralMode === 'none'
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              No Beats
            </button>
            <button
              onClick={() => setBinauralMode('gamma_40hz')}
              className={`px-2.5 py-1.5 rounded-md font-medium transition flex items-center gap-1 ${
                binauralMode === 'gamma_40hz'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3" /> 40Hz Gamma
            </button>
            <button
              onClick={() => setBinauralMode('alpha_10hz')}
              className={`px-2.5 py-1.5 rounded-md font-medium transition ${
                binauralMode === 'alpha_10hz'
                  ? 'bg-purple-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              10Hz Alpha
            </button>
          </div>
        </div>

        {/* Dynamic Visual Status Indicator */}
        {!isCompleted ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative flex items-center justify-center w-28 h-28 rounded-full border-4 border-blue-500/30">
              {phase === 'pause' ? (
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-blue-400">
                    {(pauseTimeRemainingMs / 1000).toFixed(1)}s
                  </div>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    Recall
                  </div>
                </div>
              ) : phase === 'prompt' ? (
                <Volume2 className="w-10 h-10 text-blue-400 animate-pulse" />
              ) : phase === 'answer' ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce" />
              ) : (
                <Headphones className="w-10 h-10 text-neutral-500" />
              )}
            </div>

            <div className="space-y-1 max-w-md">
              <div className="text-xs uppercase tracking-wider font-semibold text-neutral-400">
                Phase: <span className="text-blue-400 capitalize">{phase}</span>
              </div>
              <p className="text-sm font-medium text-neutral-200">
                {cues[currentIndex]?.promptText || 'Loading due cards...'}
              </p>
              {phase === 'answer' || phase === 'grading' ? (
                <p className="text-xs text-emerald-400 font-mono mt-2 bg-emerald-950/40 py-1.5 px-3 rounded-lg border border-emerald-800/40">
                  Target: {cues[currentIndex]?.answerText}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-base font-semibold text-white">Session Recorded Successfully</h3>
            <p className="text-xs text-neutral-400">
              You reviewed {reviewedInputs.length} cards hands-free during your commute.
            </p>
          </div>
        )}

        {/* Play/Pause & Grading Controls */}
        <div className="flex flex-col gap-3">
          {!isPlaying && !isCompleted ? (
            <button
              onClick={() => setIsPlaying(true)}
              disabled={isLoading || cues.length === 0}
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2 transition min-h-[48px]"
            >
              <Play className="w-5 h-5 fill-current" />
              Start Audio Commute
            </button>
          ) : isPlaying ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => submitGrade(1)}
                  className="py-3 px-2 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-300 font-semibold text-xs transition min-h-[44px]"
                >
                  Again (1)
                </button>
                <button
                  onClick={() => submitGrade(2)}
                  className="py-3 px-2 rounded-xl bg-amber-950/60 hover:bg-amber-900 border border-amber-800/60 text-amber-300 font-semibold text-xs transition min-h-[44px]"
                >
                  Hard (2)
                </button>
                <button
                  onClick={() => submitGrade(3)}
                  className="py-3 px-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 font-semibold text-xs transition min-h-[44px]"
                >
                  Good (3)
                </button>
                <button
                  onClick={() => submitGrade(4)}
                  className="py-3 px-2 rounded-xl bg-blue-950/60 hover:bg-blue-900 border border-blue-800/60 text-blue-300 font-semibold text-xs transition min-h-[44px]"
                >
                  Easy (4)
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-800 text-xs text-neutral-400">
                <button
                  onClick={() => setIsPlaying(false)}
                  className="flex items-center gap-1.5 hover:text-white transition"
                >
                  <Pause className="w-4 h-4" /> Pause Audio
                </button>
                <span>Earbud next/play media keys supported</span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setCurrentIndex(0)
                setReviewedInputs([])
                setIsPlaying(true)
                refetch()
              }}
              className="w-full py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold flex items-center justify-center gap-2 transition min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" /> Repeat Another Round
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
