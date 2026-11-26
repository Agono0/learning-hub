'use client'

/**
 * Audio digest card for /audio-commute — wires the previously-orphaned
 * `/api/audio/digest` endpoint: generates the hands-free narration script
 * (prompt → pause → answer cues) from currently-due cards, with speech
 * playback reusing the page's existing audio engine.
 */
import { useQuery } from '@tanstack/react-query'
import { BookOpenCheck, Clock, Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { stopSpeaking, speakText } from '@/lib/audio-engine'
import { isSpeechAvailable } from '@/lib/speech'
import { createCueSequencer } from '@/lib/cue-sequencer'
import { apiGet } from '@/lib/transport'
import { cx } from '@/ui/cx'

export interface AudioDigestCardProps {
  className?: string
}

interface DigestCue {
  id: string
  cardId?: number
  phase: 'intro' | 'prompt' | 'pause' | 'answer' | 'outro'
  text: string
  pauseMs: number
}

interface DigestResponse {
  ok: boolean
  script: {
    totalEstimatedSeconds: number
    cardCount: number
    cues: DigestCue[]
  }
}

const PHASE_TONE: Record<DigestCue['phase'], string> = {
  intro: 'text-tertiary dark:text-faint',
  prompt: 'text-neutral-800 dark:text-neutral-100 font-semibold',
  pause: 'text-faint italic',
  answer: 'text-status-success-text dark:text-status-success-text',
  outro: 'text-tertiary dark:text-faint',
}

/**
 * Generates and plays the digest script. Speech uses the same engine as the
 * commute studio; when speech is unavailable the script still reads inline.
 */
export function AudioDigestCard({ className }: AudioDigestCardProps) {
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(0)

  const q = useQuery({
    queryKey: ['audio-digest'],
    queryFn: () => apiGet<DigestResponse>('/api/audio/digest?limit=10&minutes=8'),
    staleTime: 120_000,
  })

  const cues = q.data?.script.cues ?? []

  const sequencerRef = useRef<ReturnType<typeof createCueSequencer> | null>(null)

  // Leaving the page must silence the digest, not leave it talking in the background.
  useEffect(
    () => () => {
      sequencerRef.current?.stop()
      stopSpeaking()
    },
    [],
  )

  const playFrom = (start: number) => {
    if (!isSpeechAvailable()) return
    sequencerRef.current?.stop()
    setPlaying(true)
    setCursor(start)
    const sequencer = createCueSequencer({
      cues,
      speak: (text) => speakText(text),
      onCursor: setCursor,
      onDone: () => setPlaying(false),
    })
    sequencerRef.current = sequencer
    sequencer.start(start)
  }

  const stop = () => {
    sequencerRef.current?.stop()
    stopSpeaking()
    setPlaying(false)
  }

  const minutes = Math.ceil((q.data?.script.totalEstimatedSeconds ?? 0) / 60)

  return (
    <div className={cx('panel space-y-3', className)} data-testid="audio-digest-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          <BookOpenCheck className="h-4 w-4 text-ac-text" />
          Hands-free digest
        </h3>
        {q.data?.script && (
          <span className="inline-flex items-center gap-1 text-xs text-tertiary dark:text-faint">
            <Clock className="h-3.5 w-3.5" />
            {q.data.script.cardCount} cards · ~{minutes} min
          </span>
        )}
      </div>

      {q.isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      ) : q.isError ? (
        <p className="text-xs text-danger-text dark:text-danger-text">
          Could not generate the digest.
        </p>
      ) : cues.length === 0 ? (
        <p className="text-xs text-tertiary dark:text-faint">
          Nothing due to narrate — the digest fills from your due queue.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {!playing ? (
              <button
                type="button"
                onClick={() => playFrom(0)}
                disabled={!isSpeechAvailable()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Play digest
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-500"
              >
                <Square className="h-4 w-4" /> Stop
              </button>
            )}
          </div>
          {!isSpeechAvailable() && (
            <p className="text-[11px] text-tertiary">
              Speech is unavailable here — read the script below, or open the full commute studio.
            </p>
          )}
          <ol className="scroll-x max-h-64 space-y-1.5 overflow-y-auto text-xs">
            {cues.map((cue, i) => (
              <li
                key={cue.id}
                className={cx(
                  'rounded-lg border border-neutral-200 px-3 py-2 dark:border-(--hub-border)',
                  PHASE_TONE[cue.phase],
                  playing && i === cursor && 'border-indigo-400 bg-indigo-500/5',
                )}
              >
                <span className="mr-1.5 font-mono text-[10px] uppercase text-faint">
                  {cue.phase}
                </span>
                {cue.text}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
