'use client'

/**
 * Hands-Free Auditory Spaced Repetition (Commute & Walking Engine).
 *
 * - Each card's silent recall pause comes from its FSRS stability (server-side).
 * - Optional procedural binaural beats (Web Audio; frequencies from core).
 * - Grades: on-screen buttons, or earbud media keys via the Media Session API
 *   (next track = Good, previous track = Again) where the browser supports it.
 * - Grades are sent once at the end and go through the single grading path.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Headphones, Mic, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { getBinauralFrequencies, type BinauralMode } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { AudioCommuteStudio } from '@/components/AudioCommuteStudio'
import { Button, Callout, EmptyState, PageHeader, Panel, SelectField, Skeleton } from '@/ui'
import { AudioDigestCard } from '@/components/AudioDigestCard'

interface AudioCue {
  cardId: number
  promptText: string
  spokenPrompt?: string
  answerText: string
  deckName?: string
  pauseMs: number
}

interface CommuteResponse {
  ok: boolean
  cues: AudioCue[]
}

interface SaveResponse {
  ok: boolean
  gradedCount: number
  failed: Array<{ cardId: number; error: string }>
  tmrCuesMinted: number
  /** Bookkeeping that failed AFTER the reviews were committed (reviews are safe). */
  warnings?: string[]
}

type Grade = 1 | 2 | 3 | 4
type InputType = 'manual_tap' | 'earbud_media_key'
type Phase = 'idle' | 'prompt' | 'pause' | 'answer' | 'grading'

interface GradedInput {
  cardId: number
  inputType: InputType
  grade: Grade
  latencyMs: number
  timestamp: string
}

const GRADES: Array<{ grade: Grade; label: string }> = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' },
]

const BINAURAL_OPTIONS: Array<{ value: BinauralMode; label: string }> = [
  { value: 'none', label: 'No beats' },
  { value: 'gamma_40hz', label: '40 Hz gamma (focus)' },
  { value: 'alpha_10hz', label: '10 Hz alpha (calm)' },
]

function getAudioContext(ref: { current: AudioContext | null }): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ref.current) ref.current = new Ctor()
  if (ref.current.state === 'suspended') void ref.current.resume()
  return ref.current
}

export default function AudioCommutePage() {
  const [viewMode, setViewMode] = useState<'studio' | 'classic'>('studio')
  const [binauralMode, setBinauralMode] = useState<BinauralMode>('none')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pauseRemainingMs, setPauseRemainingMs] = useState(0)
  const [inputs, setInputs] = useState<GradedInput[]>([])

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sessionStartRef = useRef<number | null>(null)
  const promptStartRef = useRef<number>(0)

  // The queue is a snapshot for the whole session: it does not depend on the beat
  // setting and never refetches in the background (a focus refetch would swap the
  // array and restart the card being spoken). "Start another round" refetches.
  const { data, isLoading, isError, refetch } = useQuery<CommuteResponse>({
    queryKey: ['audio-commute-cues'],
    queryFn: () => apiGet<CommuteResponse>('/api/audio/circadian/commute', { limit: 12 }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const cues = data?.cues ?? []
  const isCompleted = cues.length > 0 && currentIndex >= cues.length

  const saveSession = useMutation({
    mutationFn: (graded: GradedInput[]) =>
      apiSend<SaveResponse>('/api/audio/circadian/commute', 'POST', {
        sessionMode: 'commute',
        cardsReviewed: graded.length,
        durationSeconds: sessionStartRef.current
          ? Math.round((Date.now() - sessionStartRef.current) / 1000)
          : 0,
        binauralMode,
        handsFreeInputs: graded,
      }),
  })

  // ── Binaural beats ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || binauralMode === 'none') return
    const ctx = getAudioContext(audioCtxRef)
    if (!ctx) return
    const { carrierLeft, carrierRight } = getBinauralFrequencies(binauralMode)
    const merger = ctx.createChannelMerger(2)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    const oscL = ctx.createOscillator()
    const oscR = ctx.createOscillator()
    oscL.frequency.setValueAtTime(carrierLeft, ctx.currentTime)
    oscR.frequency.setValueAtTime(carrierRight, ctx.currentTime)
    oscL.connect(merger, 0, 0)
    oscR.connect(merger, 0, 1)
    merger.connect(gain)
    gain.connect(ctx.destination)
    oscL.start()
    oscR.start()
    return () => {
      try {
        oscL.stop()
        oscR.stop()
        gain.disconnect()
      } catch {
        /* already stopped */
      }
    }
  }, [isPlaying, binauralMode])

  // Close the audio context when leaving the page.
  useEffect(
    () => () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      void audioCtxRef.current?.close().catch(() => undefined)
      audioCtxRef.current = null
    },
    [],
  )

  // ── Card playback: prompt → silent recall pause → chime → answer ──────────
  useEffect(() => {
    if (!isPlaying || currentIndex >= cues.length) return
    const card = cues[currentIndex]!
    // Every async callback checks this, so pausing (or a cancelled utterance's
    // onend/onerror) can never advance a card that is no longer playing.
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined
    let fallback: ReturnType<typeof setTimeout> | undefined

    const speak = (text: string, onEnd: () => void) => {
      const done = () => {
        if (!cancelled) onEnd()
      }
      if ('speechSynthesis' in window && text.trim()) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 1.05
        utterance.onend = done
        utterance.onerror = done
        window.speechSynthesis.speak(utterance)
      } else {
        fallback = setTimeout(done, 2000)
      }
    }

    const chime = () => {
      const ctx = audioCtxRef.current
      if (!ctx) return
      try {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        g.gain.setValueAtTime(0.05, ctx.currentTime)
        osc.connect(g)
        g.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.15)
      } catch {
        /* audio unavailable */
      }
    }

    promptStartRef.current = Date.now()
    setPhase('prompt')
    speak(card.spokenPrompt ?? card.promptText, () => {
      setPhase('pause')
      const start = Date.now()
      setPauseRemainingMs(card.pauseMs)
      interval = setInterval(() => {
        if (cancelled) return
        const remaining = Math.max(0, card.pauseMs - (Date.now() - start))
        setPauseRemainingMs(remaining)
        if (remaining > 0) return
        clearInterval(interval)
        chime()
        setPhase('answer')
        speak(card.answerText, () => setPhase('grading'))
      }, 100)
    })

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      if (fallback) clearTimeout(fallback)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [isPlaying, currentIndex, cues])

  const submitGrade = useCallback(
    (grade: Grade, inputType: InputType) => {
      const card = cues[currentIndex]
      if (!card) return
      const next: GradedInput[] = [
        ...inputs,
        {
          cardId: card.cardId,
          inputType,
          grade,
          latencyMs: Math.max(0, Date.now() - promptStartRef.current),
          timestamp: new Date().toISOString(),
        },
      ]
      setInputs(next)
      setPhase('idle')
      setCurrentIndex(currentIndex + 1) // past the last card = completed
      if (currentIndex + 1 >= cues.length) {
        setIsPlaying(false)
        saveSession.mutate(next)
      }
    },
    [cues, currentIndex, inputs, saveSession],
  )

  // ── Earbud media keys (Media Session API) ─────────────────────────────────
  const submitRef = useRef(submitGrade)
  submitRef.current = submitGrade
  useEffect(() => {
    if (!isPlaying || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        /* action unsupported on this browser */
      }
    }
    set('nexttrack', () => submitRef.current(3, 'earbud_media_key'))
    set('previoustrack', () => submitRef.current(1, 'earbud_media_key'))
    set('pause', () => setIsPlaying(false))
    return () => {
      set('nexttrack', null)
      set('previoustrack', null)
      set('pause', null)
    }
  }, [isPlaying])

  const start = () => {
    // Create/resume the AudioContext inside the click (browser autoplay policy).
    getAudioContext(audioCtxRef)
    if (sessionStartRef.current === null) sessionStartRef.current = Date.now()
    setIsPlaying(true)
  }

  const newRound = () => {
    setCurrentIndex(0)
    setInputs([])
    setPhase('idle')
    sessionStartRef.current = null
    saveSession.reset()
    void refetch()
  }

  const current = cues[currentIndex]

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <PageHeader
        title="Hands-Free Commute Audio"
        subtitle="Spaced repetition for walking and commuting. Each card's recall pause scales with how well you already know it."
        icon={<Headphones className="h-5 w-5" />}
      />

      {/* Studio View Mode Switcher */}
      <div className="flex gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setViewMode('studio')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            viewMode === 'studio'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
          }`}
        >
          <Mic className="h-4 w-4" />
          <span>Hands-Free Voice Studio</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('classic')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            viewMode === 'classic'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
          }`}
        >
          <Headphones className="h-4 w-4" />
          <span>Classic Audio & Beats</span>
        </button>
      </div>

      <AudioDigestCard />

      {viewMode === 'studio' ? (
        <AudioCommuteStudio
          cards={cues.map((c) => ({
            id: c.cardId,
            front: c.promptText,
            back: c.answerText,
            deckName: c.deckName,
          }))}
          onGradeCard={(cardId, grade) => {
            submitGrade(grade, 'manual_tap')
          }}
          onSessionFinish={() => {
            if (inputs.length > 0) saveSession.mutate(inputs)
          }}
        />
      ) : (
        <>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : isError ? (
            <Callout tone="danger" title="Could not load your due cards">
              <Button variant="ghost" onClick={() => void refetch()}>
                Try again
              </Button>
            </Callout>
          ) : cues.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="No cards due right now">
              Nothing is due for review — come back after your next study session.
            </EmptyState>
          ) : isCompleted ? (
            <Panel title="Commute complete">
              <div className="space-y-3 text-sm">
                <p>You graded {inputs.length} cards hands-free.</p>
                {saveSession.isPending ? (
                  <p className="text-tertiary">Saving your reviews…</p>
                ) : saveSession.isError ? (
                  <Callout tone="danger" title="Your reviews were not saved">
                    <Button variant="ghost" onClick={() => saveSession.mutate(inputs)}>
                      Retry saving
                    </Button>
                  </Callout>
                ) : saveSession.data ? (
                  <Callout tone="success" title="Reviews saved">
                    {saveSession.data.gradedCount} scheduled with FSRS
                    {saveSession.data.failed.length > 0
                      ? ` · ${saveSession.data.failed.length} could not be graded (card removed?)`
                      : ''}
                    {saveSession.data.tmrCuesMinted > 0
                      ? ` · ${saveSession.data.tmrCuesMinted} queued for tonight's sleep replay`
                      : ''}
                    {saveSession.data.warnings?.length
                      ? ` · (${saveSession.data.warnings.join(', ')})`
                      : ''}
                  </Callout>
                ) : null}
                <Button
                  variant="ghost"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={newRound}
                  disabled={saveSession.isPending}
                >
                  Start another round
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel
              title={`Card ${currentIndex + 1} of ${cues.length}`}
              actions={
                current?.deckName ? (
                  <span className="text-xs text-tertiary">{current.deckName}</span>
                ) : null
              }
            >
              <div className="flex flex-col items-center gap-4 py-4 text-center" aria-live="polite">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-indigo-500/30">
                  {phase === 'pause' ? (
                    <div>
                      <div className="font-mono text-2xl font-bold text-indigo-500">
                        {(pauseRemainingMs / 1000).toFixed(1)}s
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-tertiary">
                        recall
                      </div>
                    </div>
                  ) : phase === 'prompt' ? (
                    <Volume2 className="h-9 w-9 animate-pulse text-indigo-500" />
                  ) : phase === 'answer' || phase === 'grading' ? (
                    <CheckCircle2 className="h-9 w-9 text-status-success-text" />
                  ) : (
                    <Headphones className="h-9 w-9 text-faint" />
                  )}
                </div>
                <p className="max-w-md text-sm font-medium">{current?.promptText}</p>
                {phase === 'answer' || phase === 'grading' ? (
                  <p className="max-w-md rounded-lg bg-emerald-600/10 px-3 py-1.5 text-sm text-emerald-700 dark:text-status-success-text">
                    {current?.answerText}
                  </p>
                ) : null}
              </div>

              {isPlaying ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {GRADES.map((g) => (
                      <Button
                        key={g.grade}
                        variant={g.grade === 3 ? 'primary' : 'ghost'}
                        onClick={() => submitGrade(g.grade, 'manual_tap')}
                      >
                        {g.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tertiary">
                    <Button
                      variant="ghost"
                      icon={<Pause className="h-4 w-4" />}
                      onClick={() => setIsPlaying(false)}
                    >
                      Pause
                    </Button>
                    <span>Earbuds (where supported): next = Good · previous = Again</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <SelectField
                    label="Background beats"
                    hint="Optional. Use headphones — binaural beats need separate left/right channels."
                    value={binauralMode}
                    onChange={(e) => setBinauralMode(e.target.value as BinauralMode)}
                  >
                    {BINAURAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </SelectField>
                  <Button className="w-full" icon={<Play className="h-4 w-4" />} onClick={start}>
                    {currentIndex === 0 ? 'Start audio commute' : 'Resume'}
                  </Button>
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
