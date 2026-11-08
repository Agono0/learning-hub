'use client'

/**
 * Targeted Memory Reactivation (TMR) Sleep Consolidation Suite.
 *
 * - Queue: cues for cards reviewed today (commute sessions mint them automatically;
 *   "Queue today's reviews" mints them for everything reviewed in the last 24 h).
 * - Night mode: replays each card's harmonic earcon (its own partials, from core)
 *   softly, spaced by a random 20–40 s gap (Rasch & Born 2007; Oudiette & Paller 2013).
 * - Playback is logged in batches and flushed on exit; a screen wake lock keeps the
 *   timer alive where the browser supports it. OLED-black night screen.
 * - No raw fetch: uses apiGet/apiSend from @/lib/transport.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Moon, ShieldCheck, Sparkles, Volume2 } from 'lucide-react'
import { earconPartials, nextTmrCueDelayMs, type TmrEarcon } from '@learning-hub/core'
import { apiGet, apiSend } from '@/lib/transport'
import { Button, Callout, EmptyState, PageHeader, Panel, Skeleton } from '@/ui'

interface TmrCueItem {
  cardId: number
  earconSignature: TmrEarcon
  timesCuedAwake: number
  timesCuedSleep: number
  lastSleepCueAt?: string | null
}

interface TmrResponse {
  ok: boolean
  cues: TmrCueItem[]
}

/** Played card ids are sent to the server in batches of this size (and on exit). */
const FLUSH_EVERY = 5
/** Peak gain of one earcon — deliberately a whisper; the device volume does the rest. */
const EARCON_GAIN = 0.04

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

export default function SleepTmrPage() {
  const [nightMode, setNightMode] = useState(false)
  const [playedCount, setPlayedCount] = useState(0)
  const [currentFreq, setCurrentFreq] = useState<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const pendingIdsRef = useRef<number[]>([])

  const { data, isLoading, isError, refetch } = useQuery<TmrResponse>({
    queryKey: ['sleep-tmr-cues'],
    queryFn: () => apiGet<TmrResponse>('/api/audio/tmr/cues', { limit: 30 }),
    // Never swap the list under a running night session.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const cues = data?.cues ?? []

  const mintRecent = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean; minted: number }>('/api/audio/tmr/cues', 'POST', {
        action: 'mint_recent',
      }),
    onSuccess: () => void refetch(),
  })

  const flushPlayed = () => {
    const ids = pendingIdsRef.current
    if (ids.length === 0) return
    pendingIdsRef.current = []
    // Fire-and-forget: a lost batch only under-counts sleep cues.
    void apiSend('/api/audio/tmr/cues', 'POST', {
      action: 'record_sleep_playback',
      playedCardIds: ids,
    }).catch(() => undefined)
  }

  const playEarcon = (earcon: TmrEarcon) => {
    const ctx = getAudioContext(audioCtxRef)
    if (!ctx) return
    try {
      const seconds = earcon.durationMs / 1000
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(EARCON_GAIN, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0005, ctx.currentTime + seconds)
      gain.connect(ctx.destination)
      for (const freq of earconPartials(earcon)) {
        const osc = ctx.createOscillator()
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        osc.connect(gain)
        osc.start()
        osc.stop(ctx.currentTime + seconds)
      }
      setCurrentFreq(earcon.baseFrequency)
      setTimeout(() => setCurrentFreq(null), earcon.durationMs)
    } catch {
      /* audio unavailable */
    }
  }

  // ── Night loop: random 20–40 s gaps, cycling through the queue ────────────
  useEffect(() => {
    if (!nightMode || cues.length === 0) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let index = 0

    const scheduleNext = () => {
      timer = setTimeout(() => {
        if (cancelled) return
        const cue = cues[index % cues.length]!
        index++
        playEarcon(cue.earconSignature)
        setPlayedCount((c) => c + 1)
        pendingIdsRef.current.push(cue.cardId)
        if (pendingIdsRef.current.length >= FLUSH_EVERY) flushPlayed()
        scheduleNext()
      }, nextTmrCueDelayMs())
    }
    scheduleNext()

    // Keep the screen (and so the timers) awake where supported.
    let wakeLock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    nav.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (cancelled) void lock.release()
        else wakeLock = lock
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      clearTimeout(timer)
      void wakeLock?.release().catch(() => undefined)
      flushPlayed()
    }
  }, [nightMode, cues])

  // Leaving the page: flush and close audio.
  useEffect(
    () => () => {
      flushPlayed()
      void audioCtxRef.current?.close().catch(() => undefined)
      audioCtxRef.current = null
    },
    [],
  )

  const startNight = () => {
    getAudioContext(audioCtxRef) // inside the click: browsers block audio started later
    setPlayedCount(0)
    setNightMode(true)
  }

  const exitNight = () => {
    setNightMode(false)
    void refetch()
  }

  if (nightMode) {
    return (
      <div className="fixed inset-0 z-50 flex select-none flex-col items-center justify-between bg-black p-8 text-neutral-400">
        <div className="space-y-2 pt-8 text-center">
          <Moon className="mx-auto h-12 w-12 animate-pulse text-indigo-400/80" />
          <h1 className="text-xl font-medium text-neutral-200">Sleep replay running</h1>
          <p className="text-xs text-neutral-500">
            Soft cues every 20–40 seconds. Keep this screen open.
          </p>
        </div>
        <div className="space-y-2 text-center" aria-live="polite">
          <div className="font-mono text-4xl text-indigo-300">{playedCount}</div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            cues played tonight
          </div>
          {currentFreq ? (
            <div className="flex items-center justify-center gap-1 text-xs text-emerald-400">
              <Sparkles className="h-3 w-3" /> cue ({Math.round(currentFreq)} Hz)
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={exitNight}
          className="min-h-[48px] w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 px-6 py-4 text-sm font-semibold text-neutral-300 transition hover:bg-neutral-800"
        >
          Wake up / exit
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <PageHeader
        title="Sleep Replay (TMR)"
        subtitle="Soft audio cues paired with today's cards, replayed during sleep to support overnight consolidation."
        icon={<Moon className="h-5 w-5" />}
      />

      <Callout tone="accent" title="Set a safe volume first">
        <span className="inline-flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Press Preview on a cue and lower your device volume until it is barely audible. The app
          cannot measure loudness — your device volume sets it. Evidence for sleep cueing comes from
          lab studies (Rasch &amp; Born 2007); treat it as a small bonus, not a substitute for
          review.
        </span>
      </Callout>

      <Panel
        title="Tonight's queue"
        actions={
          <Button
            variant="ghost"
            loading={mintRecent.isPending}
            onClick={() => mintRecent.mutate()}
          >
            Queue today&apos;s reviews
          </Button>
        }
      >
        {mintRecent.data ? (
          <p className="text-xs text-neutral-500">
            {mintRecent.data.minted > 0
              ? `${mintRecent.data.minted} cards from the last 24 hours queued.`
              : 'No reviews in the last 24 hours to queue.'}
          </p>
        ) : null}
        {mintRecent.isError ? (
          <p className="text-xs text-rose-600">Could not queue reviews — try again.</p>
        ) : null}

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError ? (
          <Callout tone="danger" title="Could not load cues">
            <Button variant="ghost" onClick={() => void refetch()}>
              Try again
            </Button>
          </Callout>
        ) : cues.length === 0 ? (
          <EmptyState icon={<Moon className="h-6 w-6" />} title="Nothing queued yet">
            Finish a commute audio session, or press “Queue today&apos;s reviews” after studying.
          </EmptyState>
        ) : (
          <>
            <Button className="w-full" icon={<Moon className="h-4 w-4" />} onClick={startNight}>
              Start sleep replay ({cues.length} cues)
            </Button>
            <ul className="space-y-2">
              {cues.map((c) => (
                <li
                  key={c.cardId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 text-xs dark:border-(--hub-border)"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium">Card #{c.cardId}</div>
                    <div className="text-neutral-500">
                      {c.earconSignature.baseFrequency} Hz ·{' '}
                      {c.earconSignature.harmonicType.replace('_', ' ')} · replayed{' '}
                      {c.timesCuedSleep}×
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    icon={<Volume2 className="h-4 w-4" />}
                    onClick={() => playEarcon(c.earconSignature)}
                    aria-label={`Preview cue for card ${c.cardId}`}
                  >
                    Preview
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}
